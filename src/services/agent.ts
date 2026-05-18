import { BookStackCredentials } from '../types';
import { callGemini, extractJson, GeminiModelId, DEFAULT_MODEL } from './gemini';

export async function agenticRagWorkflow(
  sources: string,
  goal: string,
  credentials: BookStackCredentials,
  model: GeminiModelId = DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
) {
  onProgress?.('Агент запускает RAG-флоу: переформулирование запроса');
  
  // step 1: Query generation
  const queryPrompt = `Основываясь на задаче: "${goal}" и кратком содержании источников:\n\n${sources.substring(0, 1500)}\n\nСформулируй 4 поисковых запроса для поиска существующих статей по этой теме в базе wiki (BookStack). \n1. Главная сущность (1-2 слова, например название сервиса или технологии)\n2. То же самое на другом языке (русский/английский), если применимо\n3. Более широкая категория (например, "Базы данных")\n4. Специфический термин из текста\n\nЗапросы должны быть ОЧЕНЬ короткими (1-2 слова максимум). Возвращай только JSON массив строк: ["term1", "term 2", ...].`;
  
  let queries: string[];
  try {
    const qResp = await callGemini(model, [{ role: 'user', parts: [{ text: queryPrompt }] }], { responseMimeType: 'application/json', signal: options?.signal, checkPause: options?.checkPause });
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

  onProgress?.(`Агент осуществляет поиск (Retrieval) в BookStack по запросам: ${queries.join(', ')}...`);
  const { searchPages } = await import('./api');
  let retrievedPages: any[] = [];
  let fetchedIds = new Set();
  
  for (const q of queries.slice(0, 4)) {
    if (options?.checkPause) await options.checkPause();
    try {
      // Add {type:page} BookStack filter to focus search and maybe improve accuracy
      const results = await searchPages(credentials, `${q} {type:page}`);
      const items = Array.isArray(results) ? results : (results?.data || []);
      for (const res of items.slice(0, 5)) {
        if (!fetchedIds.has(res.id) && res.type === 'page') {
          fetchedIds.add(res.id);
          const snippetObj = res.preview_html || res.preview_text;
          const snippetStr = (typeof snippetObj === 'object' && snippetObj !== null) ? (snippetObj.content || snippetObj.text || JSON.stringify(snippetObj)) : (snippetObj || '');
          retrievedPages.push({ id: res.id, name: res.name, snippet: snippetStr, book_id: res.book_id });
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (retrievedPages.length === 0) {
    onProgress?.('Релевантные статьи не найдены. Агент рекомендует: СОЗДАТЬ');
    return { decision: 'create', retrievedContext: [] };
  }

  onProgress?.('Агент оценивает релевантность найденного (Document Grading)...');
  const gradePrompt = `
    Вы — оценщик релевантности (Grader). У пользователя есть цель: "${goal}".
    Также исходный собираемый материал пользователя: 
    ---
    ${sources.substring(0, 2000)}
    ---
    
    Мы нашли следующие статьи в Wiki:
    ${JSON.stringify(retrievedPages)}
    
    Оцени каждую статью - относится ли она к той же сущности, системе или объекту, что и задача пользователя. 
    Принимай во внимание название статьи (name). Если название явно совпадает с термином, система 100% релевантна!
    Даже если статья шире, чем новый материал, и эту информацию логично добавить в нее (дополнить статью), считай ее релевантной.
    Верни JSON: { "relevantPages": [{ "id": number, "reason": "почему релевантна или не релевантна", "isRelevant": boolean }] }
  `;
  
  let relevantIds: number[] = [];
  try {
    const gradeResp = await callGemini(model, [{ role: 'user', parts: [{ text: gradePrompt }] }], { responseMimeType: 'application/json', signal: options?.signal, checkPause: options?.checkPause });
    const gradeJson = extractJson(gradeResp);
    relevantIds = (gradeJson.relevantPages || [])
      .filter((p: any) => p.isRelevant)
      .map((p: any) => p.id);
  } catch(e) {
    relevantIds = retrievedPages.map(p => p.id);
  }

  const finalPages = retrievedPages.filter(p => relevantIds.includes(p.id));
  
  if (finalPages.length === 0) {
    onProgress?.('Найденные статьи признаны не релевантными (недостаточная полнота). Агент рекомендует: СОЗДАТЬ');
    return { decision: 'create', retrievedContext: [] };
  }

  onProgress?.(`Агент принял решение: требуется ОБНОВЛЕНИЕ старой статьи "${finalPages[0].name}"`);
  return { 
    decision: 'update', 
    targetPageId: finalPages[0].id, 
    targetPageName: finalPages[0].name,
    targetBookId: finalPages[0].book_id,
    retrievedContext: finalPages
  };
}
