// All Gemini calls go through the server-side proxy /api/gemini/generate
// so the API key is never exposed to the browser and requests originate from the server IP.

import { BookStackCredentials } from '../types';
export const GEMINI_MODELS = [
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', description: 'Самая умная, сложные задачи' },
  { id: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash (Preview)', description: 'Быстрая, высокое качество' },
  { id: 'gemini-3.1-flash-lite',   label: 'Gemini 3.1 Flash-Lite (Stable)', description: 'Быстрая и экономичная' },
  { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash (Stable)', description: 'Цена/качество, рассуждения' },
] as const;

export type GeminiModelId = typeof GEMINI_MODELS[number]['id'];

export const DEFAULT_MODEL: GeminiModelId = 'gemini-3-flash-preview';

export interface CallGeminiConfig {
  responseMimeType?: string;
  signal?: AbortSignal;
  checkPause?: () => Promise<void>;
}

export async function callGemini(model: GeminiModelId, contents: any[], config?: CallGeminiConfig): Promise<string> {
  if (config?.checkPause) await config.checkPause();
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, config: { responseMimeType: config?.responseMimeType } }),
    signal: config?.signal
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }
  return data.text || '';
}

export function extractJson(text: string) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try { return JSON.parse(jsonMatch[1]); } catch (_) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (_) {}
    }
    throw new Error("Could not parse JSON from model response");
  }
}


export async function generateArticleFromSources(
  sources: string,
  goal: string,
  targetMode: 'create' | 'update' = 'create',
  availableContext?: { books: any[], chapters: any[] },
  previousChat?: { role: 'user' | 'model', content: string }[],
  model: GeminiModelId = DEFAULT_MODEL,
  existingContent?: string,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, onProgress?: (msg: string) => void }
) {
  const contextStr = availableContext
    ? `\nСПИСОК ДОСТУПНЫХ МЕСТ (КНИГИ И ГЛАВЫ):
       КНИГИ: ${JSON.stringify(availableContext.books.map(b => ({ id: b.id, name: b.name })))}
       ГЛАВЫ: ${JSON.stringify(availableContext.chapters.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })))}
       
       ИНСТРУКЦИЯ ПО ВЫБОРУ ЦЕЛИ: 
       1. Проанализируй ИСТОЧНИКИ и ЦЕЛЬ ЗАДАЧИ.
       2. Найди в СПИСКЕ КНИГ ту, которая наиболее точно соответствует теме.
       3. Если подходящей книги НЕТ в списке, предложи создать её, указав ID null и её название в newBookName.
       4. Обязательно верни ID книги в поле targetBookId.
       5. Аналогично для глав.\n`
    : '';

  const historyPrompt = previousChat && previousChat.length > 0
    ? `\nПРЕДЫДУЩИЙ ДИАЛОГ И ПРАВКИ:\n${previousChat.map(m => `${m.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'АГЕНТ'}: ${m.content}`).join('\n')}\n`
    : '';

  const existingContentPrompt = (targetMode === 'update' && existingContent)
    ? `\nСУЩЕСТВУЮЩЕЕ СОДЕРЖИМОЕ СТАТЬИ:\n${existingContent}\n\nИНСТРУКЦИЯ: Статья обновляется. Учитывай существующий контент при планировании структуры!\n`
    : '';

  // --- STAGE 1: PLAN ---
  if (options?.onProgress) options.onProgress('Этап 1: Планирование структуры статьи...');
  
  const planPrompt = `
    Вы — Главный Редактор. Ваша задача — спланировать структуру статьи (или обновления) на основе предоставленных материалов.

    ${contextStr}
    ${historyPrompt}
    ${existingContentPrompt}

    ИСТОЧНИКИ:
    ${sources}

    ЦЕЛЬ ЗАДАЧИ:
    ${goal}

    ВЕРНИТЕ СТРОГО JSON В УКАЗАННОМ ФОРМАТЕ:
    {
      "thinking": "анализ материалов и логика выбора места и структуры",
      "title": "идеальный заголовок статьи",
      "outline": "подробный пошаговый план статьи (какие разделы, что в них)",
      "targetBookId": 123,
      "targetChapterId": 456,
      "newBookName": "Название, если ID null",
      "newChapterName": "Название, если ID null"
    }
  `;

  let plan;
  try {
    const planText = await callGemini(model, [{ role: 'user', parts: [{ text: planPrompt }] }], { responseMimeType: 'application/json', signal: options?.signal, checkPause: options?.checkPause });
    plan = extractJson(planText);
  } catch (error: any) { throw new Error(`Ошибка на этапе планирования: ${error.message || String(error)}`); }

  // --- STAGE 2: DRAFT ---
  if (options?.onProgress) options.onProgress(`Этап 2: Написание черновика "${plan.title}"...`);
  
  const draftPrompt = `
    Вы — Технический Писатель. Ваша задача — написать подробный и качественный контент для Wiki-статьи по подготовленному плану.

    ${historyPrompt}
    ${(targetMode === 'update' && existingContent) ? `\nСУЩЕСТВУЮЩАЯ СТАТЬЯ ДЛЯ ОБНОВЛЕНИЯ:\n${existingContent}\nВплетите новые факты, не удаляя нужную старую информацию.\n` : ''}

    ИСТОЧНИКИ ДЛЯ РАБОТЫ:
    ${sources}

    УТВЕРЖДЕННЫЙ ПЛАН ОТ ГЛАВНОГО РЕДАКТОРА:
    Заголовок: ${plan.title}
    Структура: ${plan.outline}

    ЦЕЛЬ ЗАДАЧИ:
    ${goal}

    ВЕРНИТЕ СТРОГО JSON:
    {
      "thinking": "как вы реализовывали план (кратко)",
      "markdown": "ПОЛНЫЙ, КАЧЕСТВЕННЫЙ ТЕКСТ СТАТЬИ в формате Markdown на основе источников и плана"
    }
  `;

  let draft;
  try {
    const draftText = await callGemini(model, [{ role: 'user', parts: [{ text: draftPrompt }] }], { responseMimeType: 'application/json', signal: options?.signal, checkPause: options?.checkPause });
    draft = extractJson(draftText);
  } catch (error: any) { throw new Error(`Ошибка на этапе написания черновика: ${error.message || String(error)}`); }

  // --- STAGE 3: REVIEW ---
  if (options?.onProgress) options.onProgress('Этап 3: Финальное ревью и проверка качества...');
  
  const reviewPrompt = `
    Вы — Редактор-Корректор (QA). Проверьте черновик статьи.
    Сделайте текст более читаемым, исправьте опечатки, улучшите форматирование (Markdown). Убедитесь, что цель задачи выполнена.

    ЦЕЛЬ ЗАДАЧИ: ${goal}
    ${historyPrompt}

    ЧЕРНОВИК ДЛЯ ПРОВЕРКИ:
    ${draft.markdown}

    Сгенерируйте итоговый улучшенный текст, добавьте теги и краткое описание.
    ВЕРНИТЕ СТРОГО JSON:
    {
      "thinking": "какие улучшения были внесены в черновик",
      "markdown": "Итоговый улучшенный текст статьи (весь полностью)",
      "tags": ["тег1", "тег2"],
      "description": "краткое описание статьи (до 200 символов)"
    }
  `;

  let review;
  try {
    const reviewText = await callGemini(model, [{ role: 'user', parts: [{ text: reviewPrompt }] }], { responseMimeType: 'application/json', signal: options?.signal, checkPause: options?.checkPause });
    review = extractJson(reviewText);
  } catch (error: any) { throw new Error(`Ошибка на этапе проверки: ${error.message || String(error)}`); }

  // Combine and return
  return {
    thinking: "План: " + (plan.thinking || "") + "\n\nДрафт: " + (draft.thinking || "") + "\n\nРевью: " + (review.thinking || ""),
    title: plan.title,
    markdown: review.markdown,
    tags: review.tags || [],
    description: review.description || "",
    targetBookId: plan.targetBookId || null,
    targetChapterId: plan.targetChapterId || null,
    newBookName: plan.newBookName || "",
    newChapterName: plan.newChapterName || "",
    targetPublishMode: undefined as any,
    targetPublishPageId: undefined as any,
    targetPublishBookId: undefined as any,
  } as any;
}

export async function generateMindmap(
  combinedContent: string,
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
): Promise<string> {
  const prompt = `Вы — Ассистент NotebookLM. Создай Mindmap по загруженным источникам. Верни СТРОГО вложенными списками Markdown. Корень должен быть один (название темы). НИКАКИХ дополнительных слов, только списки.\n\nАКТИВНЫЕ ИСТОЧНИКИ:\n${combinedContent}`;
  return callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }], { signal: options?.signal, checkPause: options?.checkPause });
}

export async function generateFAQ(
  combinedContent: string,
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
): Promise<string> {
  const prompt = `Вы — Ассистент NotebookLM. Составь подробный FAQ (Часто задаваемые вопросы) на основе загруженных источников. Отформатируй красиво в Markdown.\n\nАКТИВНЫЕ ИСТОЧНИКИ:\n${combinedContent}`;
  return callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }], { signal: options?.signal, checkPause: options?.checkPause });
}

export async function extractTextFromFile(
  base64: string, 
  mimeType: string, 
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
) {
  const safeMimeType = mimeType === 'application/octet-stream' ? 'text/plain' : mimeType;

  const prompt = `Извлеки весь значимый текст из этого файла. 
    Если это HTML, убери скрипты и стили, верни только контент. 
    Если это PDF, сохрани логическую структуру. 
    Верни ТОЛЬКО извлеченный текст, без своих комментариев.`;

  try {
    const text = await callGemini(
      model,
      [{ role: 'user', parts: [{ text: prompt }, { inlineData: { data: base64, mimeType: safeMimeType } }] }],
      { signal: options?.signal, checkPause: options?.checkPause }
    );
    return text;
  } catch (error: any) {
    const message = error.message || String(error);
    if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
      throw new Error('Превышена квота запросов к AI для обработки файлов. Пожалуйста, подождите.');
    }
    if (safeMimeType === 'text/plain') {
      try {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (_) {
        throw new Error(`Не удалось извлечь текст из файла: ${message}`);
      }
    }
    throw new Error(`Не удалось извлечь текст из файла: ${message}`);
  }
}
