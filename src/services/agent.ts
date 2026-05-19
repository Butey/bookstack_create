import { BookStackCredentials } from '../types';
import { callGemini, extractJson, GeminiModelId, DEFAULT_MODEL } from './gemini';

export async function agenticRagWorkflow(
  sources: string,
  goal: string,
  credentials: BookStackCredentials,
  model: GeminiModelId = DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, searchPrompt?: string, duplicatePrompt?: string, contextPrompt?: string }
) {
  onProgress?.('Агент запускает RAG-флоу: переформулирование запроса');
  
  // step 1: Query generation
  let defaultQueryPrompt = `Основываясь на задаче: "${goal}" и кратком содержании источников:\n\n${sources.substring(0, 1500)}\n\nТвоя задача — сгенерировать 5 узких поисковых запросов для поиска существующих статей-дублей в wiki-базе (BookStack).\nНам нужно найти статьи ИМЕННО ОБ ЭТОМ процессе, или ИМЕННО ОБ ЭТОЙ ошибке, а не просто смежные материалы.\nСформулируй запросы по правилам:\n1-2. Точное название конкретного модуля, функции или кода ошибки (самое специфичное).\n3. Главное действие, которое описывает материал.\n4-5. Уникальные термины, аббревиатуры или идентификаторы из текста.\n\nЗАПРОСЫ ДОЛЖНЫ БЫТЬ УЗКИМИ И КОРОТКИМИ (1-3 слова). Возвращай СТРОГО JSON массив строк, например: ["vpn error 504", "setup mikrotik ipsec", "payment gateway"].`;
  
  let queryPrompt = options?.searchPrompt 
    ? options.searchPrompt.replace('{goal}', goal).replace('{sources}', sources.substring(0, 1500))
    : defaultQueryPrompt;

  
  let queries: string[];
  try {
    const qResp = await callGemini(model, [{ role: 'user', parts: [{ text: queryPrompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: "array",
        items: { type: "string" }
      },
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    queries = extractJson(qResp);
    if (!Array.isArray(queries)) queries = [queries];
    if (queries.length === 0) queries = [goal.split(' ')[0] || goal.substring(0, 10)];
  } catch(e) {
    const rawWords = goal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    queries = rawWords.slice(0, 2);
    if (queries.length === 0) queries = [goal.substring(0, 10)];
  }

  // Also manually add the most frequent long word from goal as fallback
  const fallbackTerms = goal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 4);
  if (fallbackTerms.length > 0) queries.push(fallbackTerms[0]);

  // Clean and unique queries
  queries = [...new Set(queries.map(q => q.trim()).filter(q => q.length > 2))];

  onProgress?.(`Агент осуществляет семантический поиск в BookStack по запросам: ${queries.join(', ')}...`);
  const { searchPages, searchVectorStore, fetchPage } = await import('./api');
  let retrievedPages: any[] = [];
  let fetchedIds = new Set();
  
  // Also search vector store
  try {
    const vectorResults = await searchVectorStore(goal, 3);
    for (const vRes of vectorResults) {
      if (vRes.id && vRes.id.startsWith('bookstack:page:')) {
        const pageId = parseInt(vRes.id.replace('bookstack:page:', ''), 10);
        if (!fetchedIds.has(pageId)) {
          fetchedIds.add(pageId);
          retrievedPages.push({
            id: pageId,
            name: vRes.metadata?.name || 'Найденная через векторный поиск статья',
            snippet: vRes.text.substring(0, 4000), // increased length
            book_id: vRes.metadata?.book_id,
            url: vRes.metadata?.url
          });
        }
      }
    }
  } catch (e) {
    console.error('Vector store search failed', e);
  }

  for (const q of queries.slice(0, 3)) { // reduced to 3 keywords to save time
    if (options?.checkPause) await options.checkPause();
    try {
      const results = await searchPages(credentials, `${q} {type:page}`);
      const items = Array.isArray(results) ? results : (results?.data || []);
      for (const res of items.slice(0, 3)) { // reduced to 3 pages per query
        if (!fetchedIds.has(res.id) && res.type === 'page') {
          fetchedIds.add(res.id);
          
          let fullSnippet = '';
          try {
             // Fetch full page to get better context
            const fullPage = await fetchPage(credentials, res.id);
            const text = fullPage.markdown || fullPage.html || fullPage.raw_html || '';
            fullSnippet = text.substring(0, 4000);
          } catch(err) {
            const snippetObj = res.preview_html || res.preview_text;
            fullSnippet = (typeof snippetObj === 'object' && snippetObj !== null) ? (snippetObj.content || snippetObj.text || JSON.stringify(snippetObj)) : (snippetObj || '');
          }

          retrievedPages.push({ id: res.id, name: res.name, snippet: fullSnippet, book_id: res.book_id, url: res.url });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (retrievedPages.length === 0) {
    onProgress?.('Релевантные статьи не найдены. Агент рекомендует: СОЗДАТЬ');
    return { decision: 'create', retrievedContext: [], relatedPages: [] };
  }

  onProgress?.('Агент проверяет найденные статьи на точные дубли...');
  const defaultDuplicatePrompt = `
    Вы — строгий аналитик базы знаний. Цель пользователя: "{goal}".
    Новый материал: 
    ---
    {sources}
    ---
    
    Найденные статьи:
    {retrievedPages}
    
    Оцени каждую статью ТОЛЬКО на предмет того, является ли она ДУБЛЕМ (статьей, которую нужно обновить).
    ИНСТРУКЦИЯ ПО ОЦЕНКЕ ДУБЛЕЙ:
    - Статья является дублем ТОЛЬКО если она описывает ИМЕННО ТУ ЖЕ функцию, ТОТ ЖЕ процесс или ТУ ЖЕ инструкцию.
    - Если сомневаетесь, ставьте isDuplicate: false.
    
    Верни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему", "isDuplicate": boolean }] }
  `;

  let duplicatePromptStr = options?.duplicatePrompt
    ? options.duplicatePrompt
        .replace('{goal}', goal)
        .replace('{sources}', sources.substring(0, 2000))
        .replace('{retrievedPages}', JSON.stringify(retrievedPages))
    : defaultDuplicatePrompt
        .replace('{goal}', goal)
        .replace('{sources}', sources.substring(0, 2000))
        .replace('{retrievedPages}', JSON.stringify(retrievedPages));

  let duplicateIds: number[] = [];
  try {
    const dupResp = await callGemini(model, [{ role: 'user', parts: [{ text: duplicatePromptStr }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: "object",
        properties: {
          evaluatedPages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                reason: { type: "string" },
                isDuplicate: { type: "boolean" }
              },
              required: ["id", "reason", "isDuplicate"]
            }
          }
        },
        required: ["evaluatedPages"]
      },
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    const dupJson = extractJson(dupResp);
    duplicateIds = (dupJson.evaluatedPages || []).filter((p: any) => p.isDuplicate).map((p: any) => p.id);
  } catch(e) {
    console.error('Duplicate detection failed', e);
  }

  const duplicatePages = retrievedPages.filter(p => duplicateIds.includes(p.id));
  
  onProgress?.('Агент ищет полезный контекст среди остальных статей...');
  
  const remainingPages = retrievedPages.filter(p => !duplicateIds.includes(p.id));
  
  const defaultContextPrompt = `
    Вы — аналитик базы знаний. Цель: "{goal}".
    Новый материал: 
    ---
    {sources}
    ---
    
    Оставшиеся статьи (не дубли):
    {retrievedPages}
    
    Оцени каждую статью на полезность как КОНТЕКСТ для написания новой.
    ИНСТРУКЦИЯ ПО ОЦЕНКЕ КОНТЕКСТА:
    - Статья полезна, если она описывает общую систему, в которую внедряется инструкция, или содержит связанные термины и архитектуру.
    
    Верни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему", "isContext": boolean }] }
  `;

  let contextPromptStr = options?.contextPrompt
    ? options.contextPrompt
        .replace('{goal}', goal)
        .replace('{sources}', sources.substring(0, 2000))
        .replace('{retrievedPages}', JSON.stringify(remainingPages))
    : defaultContextPrompt
        .replace('{goal}', goal)
        .replace('{sources}', sources.substring(0, 2000))
        .replace('{retrievedPages}', JSON.stringify(remainingPages));

  let contextIds: number[] = [];
  try {
    if (remainingPages.length > 0) {
      const ctxResp = await callGemini(model, [{ role: 'user', parts: [{ text: contextPromptStr }] }], {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            evaluatedPages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  reason: { type: "string" },
                  isContext: { type: "boolean" }
                },
                required: ["id", "reason", "isContext"]
              }
            }
          },
          required: ["evaluatedPages"]
        },
        signal: options?.signal, 
        checkPause: options?.checkPause
      });
      const ctxJson = extractJson(ctxResp);
      contextIds = (ctxJson.evaluatedPages || []).filter((p: any) => p.isContext).map((p: any) => p.id);
    }
  } catch(e) {
    console.error('Context detection failed', e);
    contextIds = remainingPages.map(p => p.id);
  }

  const contextPages = remainingPages.filter(p => contextIds.includes(p.id));
  
  if (duplicatePages.length === 0) {
    onProgress?.(`Дублей не найдено. Агент рекомендует: СОЗДАТЬ новую. Найдено ${contextPages.length} статей для контекста.`);
    return { decision: 'create', retrievedContext: contextPages, relatedPages: retrievedPages };
  }

  const decisionMsg = duplicatePages.length > 1 
    ? `Агент принял решение: обнаружены дублирующиеся статьи. Требуется ОБНОВЛЕНИЕ статьи "${duplicatePages[0].name}" (с объединением информации)`
    : `Агент принял решение: требуется ОБНОВЛЕНИЕ старой статьи "${duplicatePages[0].name}"`;

  onProgress?.(decisionMsg);
  
  const combinedContextPages = [...duplicatePages, ...contextPages];
  const uniqueContextPages = Array.from(new Map(combinedContextPages.map(item => [item.id, item])).values());

  return { 
    decision: 'update', 
    targetPageId: duplicatePages[0].id, 
    targetPageName: duplicatePages[0].name,
    targetBookId: duplicatePages[0].book_id,
    retrievedContext: uniqueContextPages,
    relatedPages: retrievedPages
  };
}
