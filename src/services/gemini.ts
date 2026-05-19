// All Gemini calls go through the server-side proxy /api/gemini/generate
// so the API key is never exposed to the browser and requests originate from the server IP.

import { BookStackCredentials } from '../types';
export const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview',  label: 'Gemini 3 Flash (Preview)', description: 'Быстрая, высокое качество' },
  { id: 'gemini-3.1-flash-lite',   label: 'Gemini 3.1 Flash-Lite (Stable)', description: 'Быстрая и экономичная' },
  { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash (Stable)', description: 'Цена/качество, рассуждения' },
  { id: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro (Stable)', description: 'Мощная модель для сложных задач' },
] as const;

export type GeminiModelId = typeof GEMINI_MODELS[number]['id'];

export const DEFAULT_MODEL: GeminiModelId = 'gemini-3-flash-preview';

export interface CallGeminiConfig {
  responseMimeType?: string;
  responseSchema?: any;
  systemInstruction?: string;
  signal?: AbortSignal;
  checkPause?: () => Promise<void>;
}

export async function callGemini(model: GeminiModelId, contents: any[], config?: CallGeminiConfig): Promise<string> {
  if (config?.checkPause) await config.checkPause();
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      model, 
      contents, 
      config: { 
        responseMimeType: config?.responseMimeType,
        responseSchema: config?.responseSchema,
        systemInstruction: config?.systemInstruction
      } 
    }),
    signal: config?.signal
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Server error ${res.status}`);
  }
  return data.text || '';
}

export function extractJson(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try { return JSON.parse(jsonMatch[1]); } catch (_) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      if (firstBracket !== -1 && firstBracket < firstBrace && lastBracket > lastBrace) {
        try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (_) {}
      }
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (_) {}
    }
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (_) {}
    }
    
    console.error("Failed to parse JSON string:", text.substring(0, 500));
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
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, onProgress?: (msg: string) => void, systemInstruction?: string, dataStructure?: string },
  attachments?: { mimeType: string; data: string }[]
) {
  const contextStr = availableContext
    ? `\nСПИСОК ДОСТУПНЫХ МЕСТ (КНИГИ И ГЛАВЫ):
       КНИГИ: ${JSON.stringify(availableContext.books.map(b => ({ id: b.id, name: b.name })))}
       ГЛАВЫ: ${JSON.stringify(availableContext.chapters.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })))}
       
       ИНСТРУКЦИЯ ПО ВЫБОРУ МЕСТА (ОЧЕНЬ ВАЖНО): 
       1. ВНИМАТЕЛЬНО изучи СПИСОК КНИГ И ГЛАВ. Твоя главная цель — найти уже существующее релевантное место, а не плодить новые сущности!
       2. Ищи по синонимам, пересечениям тем или более широким категориям. Если новая статья логически вписывается в существующую книгу или главу (даже если название не совпадает на 100%), обязательно используй ЕЁ ID.
       3. Предлагай создание новой книги/главы (указав ID null и название в newBookName/newChapterName) ТОЛЬКО в самом крайнем случае, если тема совершенно новая и не имеет ничего общего с текущей структурой базы знаний.
       4. Обязательно верни ID книги в targetBookId и ID главы в targetChapterId (если применимо).\n`
    : '';

  const historyPrompt = previousChat && previousChat.length > 0
    ? `\nПРЕДЫДУЩИЙ ДИАЛОГ И ПРАВКИ:\n${previousChat.map(m => `${m.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'АГЕНТ'}: ${m.content}`).join('\n')}\n`
    : '';

  const existingContentPrompt = existingContent
    ? (targetMode === 'update' 
        ? `\nСУЩЕСТВУЮЩЕЕ СОДЕРЖИМОЕ СТАТЬИ:\n${existingContent}\n\nИНСТРУКЦИЯ: Статья обновляется. Учитывай существующий контент при планировании структуры!\n`
        : `\nИНФОРМАЦИЯ О ДУБЛИКАТАХ В БАЗЕ:\n${existingContent}\n\nИНСТРУКЦИЯ: Вы создаете новую статью, но в базе уже есть похожие. Пожалуйста, учтите их существование и при необходимости сошлитесь на них или укажите их урлы в поле duplicateLinks.\n`
      )
    : '';

  const getParts = (promptText: string) => {
     const parts: any[] = [{ text: promptText }];
     if (attachments && attachments.length > 0) {
        attachments.forEach(a => {
           parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
        });
     }
     return parts;
  };

  const sysInstruction = options?.systemInstruction ? options.systemInstruction : "Вы — профессиональный технический писатель и редактор.";

  // --- STAGE 1: PLAN ---
  if (options?.onProgress) options.onProgress('Этап 1: Планирование структуры статьи...');
  
  const planPrompt = `
    Ваша задача — спланировать структуру статьи (или обновления) на основе предоставленных материалов.

    ${options?.dataStructure ? `ТРЕБУЕМАЯ СТРУКТУРА ДАННЫХ:\n${options.dataStructure}\nОбязательно учитывайте эти правила при планировании.\n` : ''}
    ${contextStr}
    ${historyPrompt}
    ${existingContentPrompt}

    ИСТОЧНИКИ:
    ${sources}

    ЦЕЛЬ ЗАДАЧИ:
    ${goal}
  `;

  let plan;
  try {
    const planText = await callGemini(model, [{ role: 'user', parts: getParts(planPrompt) }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: "object",
        properties: {
          thinking: { type: "string", description: "логика выбора места. Если вы заметили похожие статьи, предложите их объединение и объясните почему. Ваша цель - избегать создания дубликатов" },
          title: { type: "string", description: "идеальный заголовок статьи" },
          outline: { type: "string", description: "подробный пошаговый план статьи (какие разделы)" },
          targetBookId: { type: "number", nullable: true },
          targetChapterId: { type: "number", nullable: true },
          newBookName: { type: "string", nullable: true },
          newChapterName: { type: "string", nullable: true },
          duplicateLinks: { type: "array", items: { type: "string" } }
        },
        required: ["thinking", "title", "outline"]
      },
      systemInstruction: sysInstruction,
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    plan = extractJson(planText);
  } catch (error: any) { throw new Error(`Ошибка на этапе планирования: ${error.message || String(error)}`); }

  // --- STAGE 2: DRAFT ---
  if (options?.onProgress) options.onProgress(`Этап 2: Написание черновика "${plan.title}"...`);
  
  const draftPrompt = `
    Ваша задача — написать подробный и качественный контент для Wiki-статьи по подготовленному плану.

    ${options?.dataStructure ? `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ДАННЫХ:\n${options.dataStructure}\nСтрого следуйте указанному формату!\n` : ''}
    ${historyPrompt}
    ${(targetMode === 'update' && existingContent) ? `\nСУЩЕСТВУЮЩАЯ СТАТЬЯ ДЛЯ ОБНОВЛЕНИЯ:\n${existingContent}\nВплетите новые факты, не удаляя нужную старую информацию.\n` : ''}

    ИСТОЧНИКИ ДЛЯ РАБОТЫ:
    ${sources}

    УТВЕРЖДЕННЫЙ ПЛАН:
    Заголовок: ${plan.title}
    Структура: ${plan.outline}

    ЦЕЛЬ ЗАДАЧИ:
    ${goal}
  `;

  let draft;
  try {
    const draftText = await callGemini(model, [{ role: 'user', parts: getParts(draftPrompt) }], { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: "object",
        properties: {
          thinking: { type: "string", description: "как вы реализовывали план (кратко)" },
          markdown: { type: "string", description: "ПОЛНЫЙ, КАЧЕСТВЕННЫЙ ТЕКСТ СТАТЬИ в формате Markdown на основе источников и плана" }
        },
        required: ["thinking", "markdown"]
      },
      systemInstruction: sysInstruction,
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    draft = extractJson(draftText);
  } catch (error: any) { throw new Error(`Ошибка на этапе написания черновика: ${error.message || String(error)}`); }

  // --- STAGE 3: REVIEW ---
  if (options?.onProgress) options.onProgress('Этап 3: Финальное ревью и проверка качества...');
  
  const reviewPrompt = `
    Проверьте черновик статьи. Сделайте текст более читаемым, исправьте опечатки, улучшите форматирование (Markdown). Убедитесь, что цель задачи выполнена.

    ЦЕЛЬ ЗАДАЧИ: ${goal}
    ${historyPrompt}

    ЧЕРНОВИК ДЛЯ ПРОВЕРКИ:
    ${draft.markdown}

    Сгенерируйте итоговый улучшенный текст, добавьте теги и краткое описание.
  `;

  let review;
  try {
    const reviewText = await callGemini(model, [{ role: 'user', parts: getParts(reviewPrompt) }], { 
      responseMimeType: 'application/json',
      responseSchema: {
        type: "object",
        properties: {
          thinking: { type: "string", description: "какие улучшения были внесены в черновик" },
          markdown: { type: "string", description: "Итоговый улучшенный текст статьи (весь полностью)" },
          tags: { type: "array", items: { type: "string" } },
          description: { type: "string", description: "краткое описание статьи (до 200 символов)" }
        },
        required: ["thinking", "markdown", "tags", "description"]
      },
      systemInstruction: sysInstruction,
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
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
  _model?: any, // Ignored to force cheap model
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
) {
  const safeMimeType = mimeType === 'application/octet-stream' ? 'text/plain' : mimeType;
  const parsingModel = 'gemini-3.1-flash-lite';

  const prompt = `Извлеки весь значимый текст из этого файла. 
    Если это HTML, убери скрипты и стили, верни только контент. 
    Если это PDF, сохрани логическую структуру. 
    Верни ТОЛЬКО извлеченный текст, без своих комментариев.`;

  try {
    const text = await callGemini(
      parsingModel as GeminiModelId,
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
