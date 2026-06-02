import { BookStackCredentials } from '../types';
import { callGemini, extractJson, GeminiModelId, DEFAULT_MODEL } from './gemini';
import { searchPages, searchVectorStore, fetchPage } from './api';

// Safe replacement helper to avoid JS string.replace regex-substitutions issues (like $&, $1, etc.)
function safeReplace(str: string, search: string, replacement: string): string {
  if (!str) return '';
  return str.split(search).join(replacement);
}

/**
 * Generates narrow search queries based on the user's goal and sources.
 */
async function generateSearchQueries(
  goal: string,
  sources: string,
  model: GeminiModelId,
  options?: { signal?: AbortSignal; checkPause?: () => Promise<void>; searchPrompt?: string }
): Promise<string[]> {
  const defaultQueryPrompt = `Основываясь на задаче: "{goal}" и кратком содержании источников:\n\n{sources}\n\nТвоя задача — сгенерировать 5 узких поисковых запросов для поиска существующих статей в wiki-базе (BookStack).\n\nВАЖНОЕ ПРАВИЛО: ИГНОРИРУЙ номера тикетов и задач (например, "225-390021", "тикет 12345"). Статьи в базе знаний описывают функционал и проблемы, а НЕ переписки по тикетам. Выделяй только СУТЬ проблемы!\n\nНам нужно найти статьи ИМЕННО ОБ ЭТОМ процессе, или ИМЕННО ОБ ЭТОЙ ошибке, а не просто смежные материалы.\nСформулируй запросы по правилам:\n1-2. Точное название конкретного модуля, функции, UI элемента или кода ошибки.\n3. Главное действие, которое описывает материал.\n4-5. Уникальные технические термины из текста (без мусорных слов).\n\nЗАПРОСЫ ДОЛЖНЫ БЫТЬ УЗКИМИ И КОРОТКИМИ (1-3 слова). Возвращай СТРОГО JSON массив строк, например: ["scaling ui", "panel resolution", "touch modifier"].`;

  let queryPrompt = options?.searchPrompt 
    ? options.searchPrompt
    : defaultQueryPrompt;

  const cleanGoal = goal.replace(/тикет\s*[\d-]+/gi, '').replace(/ticket\s*[\d-]+/gi, '').replace(/\b\d{3}-\d{6}\b/g, '');
  queryPrompt = safeReplace(queryPrompt, '{goal}', cleanGoal);
  queryPrompt = safeReplace(queryPrompt, '{sources}', sources.substring(0, 1500));

  let queries: string[] = [];
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
    const parsed = extractJson(qResp.text);
    if (Array.isArray(parsed)) {
      queries = parsed.filter(item => typeof item === 'string');
    } else if (typeof parsed === 'string') {
      queries = [parsed];
    } else {
      throw new Error("Invalid json format for queries");
    }
  } catch (e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Query generation failed. Falling back to key terms.', e);
    const rawWords = cleanGoal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    queries = rawWords.slice(0, 2);
  }

  // Ensure fallback words from goal
  const fallbackTerms = cleanGoal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 4 && !/^\d+$/.test(w));
  if (fallbackTerms.length > 0) {
    queries.push(fallbackTerms[0]);
  }

  return [...new Set(queries.map(q => q.trim()).filter(q => q.length > 2))];
}

/**
 * Searches for relevant documents via vector indexing and standard keywords.
 */
async function searchRelevantPages(
  queries: string[],
  goal: string,
  credentials: BookStackCredentials,
  options?: { signal?: AbortSignal; checkPause?: () => Promise<void> }
): Promise<{ retrievedPages: any[]; fetchedIds: Set<number> }> {
  const retrievedPages: any[] = [];
  const fetchedIds = new Set<number>();

  // 1. Vector store search
  const cleanGoal = goal.replace(/тикет\s*[\d-]+/gi, '').replace(/ticket\s*[\d-]+/gi, '').replace(/\b\d{3}-\d{6}\b/g, '');
  try {
    const vectorResults = await searchVectorStore(cleanGoal, 3);
    for (const vRes of vectorResults) {
      if (vRes.id && vRes.id.startsWith('bookstack:page:')) {
        const pageId = parseInt(vRes.id.replace('bookstack:page:', ''), 10);
        if (!isNaN(pageId) && !fetchedIds.has(pageId)) {
          fetchedIds.add(pageId);
          retrievedPages.push({
            id: pageId,
            name: vRes.metadata?.name || 'Найденная через векторный поиск статья',
            snippet: vRes.text.substring(0, 4000),
            book_id: vRes.metadata?.book_id,
            url: vRes.metadata?.url
          });
        }
      }
    }
  } catch (e) {
    console.error('[Agent] Vector store search failed:', e);
  }

  // 2. Keyword Search in Parallel across up to 5 queries
  try {
    const searchPromises = queries.slice(0, 5).map(async (q) => {
      if (options?.checkPause) await options.checkPause();
      try {
        const results = await searchPages(credentials, `${q} {type:page}`);
        return Array.isArray(results) ? results : (results?.data || []);
      } catch (e) {
        console.error(`[Agent] Search error for query "${q}":`, e);
        return [];
      }
    });

    const searchResultsLists = await Promise.all(searchPromises);
    const itemsToFetch: any[] = [];

    for (const results of searchResultsLists) {
      for (const res of results.slice(0, 5)) {
        const pageId = typeof res.id === 'string' ? parseInt(res.id, 10) : res.id;
        if (!isNaN(pageId) && !fetchedIds.has(pageId) && res.type === 'page') {
          fetchedIds.add(pageId);
          itemsToFetch.push({ ...res, id: pageId });
        }
      }
    }

    // 3. Parallel full content fetching for optimal context analysis
    if (itemsToFetch.length > 0) {
      // Process in batches to avoid rate limits and freezing
      const batchSize = 5;
      const resolvedPages = [];
      for (let i = 0; i < itemsToFetch.length; i += batchSize) {
        const batch = itemsToFetch.slice(i, i + batchSize);
        const batchPromises = batch.map(async (res) => {
          if (options?.checkPause) await options.checkPause();
          let fullSnippet = '';
          try {
            const fullPage = await fetchPage(credentials, res.id);
            const text = fullPage.markdown || fullPage.html || fullPage.raw_html || '';
            fullSnippet = text.substring(0, 4000); // 4000 chars should be enough to decide if it's a duplicate
          } catch (err) {
            console.error(`[Agent] Failed to fetch page content for page ID ${res.id}`, err);
            const snippetObj = res.preview_html || res.preview_text;
            fullSnippet = (typeof snippetObj === 'object' && snippetObj !== null)
              ? (snippetObj.content || snippetObj.text || JSON.stringify(snippetObj))
              : (snippetObj || '');
          }
          return { id: res.id, name: res.name, snippet: fullSnippet, book_id: res.book_id, url: res.url };
        });
        const batchResults = await Promise.all(batchPromises);
        resolvedPages.push(...batchResults);
      }

      retrievedPages.push(...resolvedPages);
    }
  } catch (searchErr) {
    console.error('[Agent] Parallel keyword search or fetching failed', searchErr);
  }

  return { retrievedPages, fetchedIds };
}

export async function agenticRagWorkflow(
  sources: string,
  goal: string,
  credentials: BookStackCredentials,
  model: GeminiModelId = DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, searchPrompt?: string, duplicatePrompt?: string, contextPrompt?: string }
) {
  onProgress?.('Агент запускает RAG-флоу: генерация поисковых запросов...');
  
  // Step 1: Query generation
  const queries = await generateSearchQueries(goal, sources, model, {
    signal: options?.signal,
    checkPause: options?.checkPause,
    searchPrompt: options?.searchPrompt
  });

  onProgress?.(`Агент осуществляет семантический и ключевой поиск в BookStack по запросам: ${queries.join(', ')}...`);
  
  // Step 2: Parallel search & fetching
  const { retrievedPages } = await searchRelevantPages(queries, goal, credentials, {
    signal: options?.signal,
    checkPause: options?.checkPause
  });

  if (retrievedPages.length === 0) {
    onProgress?.('Релевантные статьи не найдены. Агент рекомендует: СОЗДАТЬ');
    return { decision: 'create', retrievedContext: [], relatedPages: [] };
  }

  onProgress?.('Агент проверяет найденные статьи на предмет точных дублей...');
  
  // Step 3: Duplicate detection
  const defaultDuplicatePrompt = `Вы — строгий аналитик базы знаний. Цель пользователя: "{goal}".
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

Верни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему", "isDuplicate": boolean }] }`;

  let duplicatePromptStr = options?.duplicatePrompt || defaultDuplicatePrompt;
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{goal}', goal);
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{sources}', sources.substring(0, 2000));
  const duplicateMinifiedPages = retrievedPages.map(p => ({ id: p.id, name: p.name, snippet: p.snippet.substring(0, 1500) }));
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{retrievedPages}', JSON.stringify(duplicateMinifiedPages));

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
    const dupJson = extractJson(dupResp.text);
    duplicateIds = (dupJson.evaluatedPages || []).filter((p: any) => p.isDuplicate).map((p: any) => p.id);
  } catch(e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Duplicate detection failed', e);
  }

  const duplicatePages = retrievedPages.filter(p => duplicateIds.includes(p.id));
  const remainingPages = retrievedPages.filter(p => !duplicateIds.includes(p.id));
  
  onProgress?.('Агент классифицирует оставшиеся статьи как вспомогательный контекст...');
  
  // Step 4: Context classification
  const defaultContextPrompt = `Вы — аналитик базы знаний. Цель: "{goal}".
Новый материал: 
---
{sources}
---

Оставшиеся статьи (не дубли):
{retrievedPages}

Оцени каждую статью на полезность как КОНТЕКСТ для написания новой.
ИНСТРУКЦИЯ ПО ОЦЕНКЕ КОНТЕКСТА:
- Статья полезна, если она описывает общую систему, в которую внедряется инструкция, или содержит связанные термины и архитектуру.

Верни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему", "isContext": boolean }] }`;

  let contextPromptStr = options?.contextPrompt || defaultContextPrompt;
  contextPromptStr = safeReplace(contextPromptStr, '{goal}', goal);
  contextPromptStr = safeReplace(contextPromptStr, '{sources}', sources.substring(0, 2000));
  const contextMinifiedPages = remainingPages.map(p => ({ id: p.id, name: p.name, snippet: p.snippet.substring(0, 1000) }));
  contextPromptStr = safeReplace(contextPromptStr, '{retrievedPages}', JSON.stringify(contextMinifiedPages));

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
      const ctxJson = extractJson(ctxResp.text);
      contextIds = (ctxJson.evaluatedPages || []).filter((p: any) => p.isContext).map((p: any) => p.id);
    }
  } catch(e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Context detection failed', e);
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
    relatedPages: duplicatePages // Show true duplicates in the modal, not all random context pages
  };
}
