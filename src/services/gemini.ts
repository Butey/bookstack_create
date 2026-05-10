import { GoogleGenAI } from "@google/genai";

// Initialization as per gemini-api skill
const getApiKeySync = (): string => {
  if (typeof window !== 'undefined') {
    if ((window as any).GEMINI_API_KEY) return (window as any).GEMINI_API_KEY;
    if (window.process?.env?.GEMINI_API_KEY) return window.process.env.GEMINI_API_KEY;
  }
  return '';
};

const fetchApiKeyFromServer = async (): Promise<string> => {
  try {
    const res = await fetch('/api/gemini-key');
    if (res.ok) {
      const data = await res.json();
      if (data.key) return data.key;
    }
  } catch (_) {
    // ignore network errors
  }
  return '';
};

let aiInstance: GoogleGenAI | null = null;

async function getAi(): Promise<GoogleGenAI> {
  if (aiInstance) return aiInstance;

  let apiKey = getApiKeySync();
  if (!apiKey) {
    apiKey = await fetchApiKeyFromServer();
  }
  if (!apiKey) {
    throw new Error("API key is missing. Please check your .env file or environment variables.");
  }
  aiInstance = new GoogleGenAI({ apiKey });
  return aiInstance;
}

function extractJson(text: string) {
  try {
    // Try simple parse first
    return JSON.parse(text);
  } catch (e) {
    // Try to extract from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        console.error("Failed to parse extracted JSON:", e2);
      }
    }
    
    // Last ditch effort: find first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (e3) {
        console.error("Failed to parse braced JSON:", e3);
      }
    }
    
    throw new Error("Could not parse JSON from model response");
  }
}

export async function generateArticleFromSources(
  sources: string, 
  goal: string, 
  targetMode: 'create' | 'update' = 'create',
  availableContext?: { books: any[], chapters: any[] },
  previousChat?: { role: 'user' | 'model', content: string }[]
) {
  const contextStr = availableContext 
    ? `\nСПИСОК ДОСТУПНЫХ МЕСТ (КНИГИ И ГЛАВЫ):
       КНИГИ: ${JSON.stringify(availableContext.books.map(b => ({ id: b.id, name: b.name })))}
       ГЛАВЫ: ${JSON.stringify(availableContext.chapters.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })))}
       
       ИНСТРУКЦИЯ ПО ВЫБОРУ ЦЕЛИ: 
       1. Проанализируй ИСТОЧНИКИ и ЦЕЛЬ ЗАДАЧИ на наличие упоминаний конкретных продуктов, технологий или тем (например, BUS77, Smart Home, HDL и т.д.).
       2. Найди в СПИСКЕ КНИГ ту, которая наиболее точно соответствует теме.
       3. Если подходящей книги НЕТ в списке, ты можешь предложить создать её, вернув "targetBookId": null и указав её название в "newBookName".
       4. Обязательно верни ID книги в поле "targetBookId" ИЛИ null, если создаешь новую.
       5. Аналогично для глав: если в книге нет подходящей главы, предложи создать её через "newChapterName".\n`
    : '';

  const historyPrompt = previousChat && previousChat.length > 0 
    ? `\nПРЕДЫДУЩИЙ ДИАЛОГ И ПРАВКИ:
       ${previousChat.map(m => `${m.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'АГЕНТ'}: ${m.content}`).join('\n')}\n`
    : '';

  const prompt = `
    Вы — эксперт по техническому письму. Синтезируйте предоставленные источники в понятную и профессиональную статью для базы знаний Wiki.

    ${contextStr}
    ${historyPrompt}

    ИСТОЧНИКИ:
    ${sources}

    ЦЕЛЬ ТЕКУЩЕЙ ЗАДАЧИ:
    ${goal}

    РЕЖИМ: ${targetMode === 'create' ? 'СОЗДАНИЕ НОВОЙ СТАТЬИ' : 'ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕЙ'}

    ИНСТРУКЦИЯ ПО JSON И ОЧИСТКЕ ТЕКСТА:
    1. Ответ должен быть СТРОГО в формате JSON.
    2. Поле "targetBookId" — Числовой ID выбранной книги. Если книги нет — null.
    3. Поле "targetChapterId" — Числовой ID главы или null.
    4. Поле "newBookName" — Название для НОВОЙ книги (если targetBookId == null).
    5. Поле "newChapterName" — Название для НОВОЙ главы (если targetChapterId == null).
    6. Поле "markdown" — ТОЛЬКО ЧИСТОЕ СОДЕРЖАНИЕ СТАТЬИ. 
       СТРОЖАЙШЕЕ ПРАВИЛО: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО включать в текст статьи ("markdown") технические поля, такие как "target_book:", "target_chapter:", "tags:", "priority:", "root_cause_category:". Используй их для формирования JSON, но УДАЛИ из финального текста. Статья должна быть готова к публикации, без признаков автоматической генерации или метаданных.
    7. Поле "title" — заголовок для страницы.
    8. Поле "tags" — массив тематических меток (strings).
    9. Поле "description" — краткое описание (до 200 символов).
    10. Поле "thinking" — ОБЯЗАТЕЛЬНОЕ ПОЛЕ. Твой подробный разбор (Chain of Thought) на русском языке. Обоснуй выбор книги (почему именно этот ID или почему создаешь новую), главы и опиши логику синтеза.

    ВЕРНИТЕ JSON В ФОРМАТЕ:
    {
      "thinking": "строка с обоснованием",
      "title": "заголовок",
      "markdown": "контент",
      "tags": ["метка1", "метка2"],
      "description": "описание",
      "targetBookId": 123,
      "targetChapterId": 456,
      "newBookName": "Название новой книги (если ID null)",
      "newChapterName": "Название новой главы (если ID null)"
    }
  `;

  try {
    const ai = await getAi();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    return extractJson(response.text || "{}");
  } catch (error: any) {
    console.error("Agent Critical Error:", error);
    const message = error.message || String(error);
    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Превышена квота запросов к AI. Пожалуйста, подождите немного или попробуйте позже.");
    }
    throw new Error(`Агент не смог обработать данные: ${message}`);
  }
}

export async function extractTextFromFile(base64: string, mimeType: string) {
  // Gemini does not support application/octet-stream. 
  // If we get it (common for unknown text files), we try text/plain.
  const safeMimeType = mimeType === 'application/octet-stream' ? 'text/plain' : mimeType;

  const prompt = `Извлеки весь значимый текст из этого файла. 
    Если это HTML, убери скрипты и стили, верни только контент. 
    Если это PDF, сохрани логическую структуру. 
    Верни ТОЛЬКО извлеченный текст, без своих комментариев.`;

  try {
    const ai = await getAi();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64,
                mimeType: safeMimeType
              }
            }
          ]
        }
      ]
    });

    return response.text || "";
  } catch (error: any) {
    console.error("Extraction Error:", error);
    const message = error.message || String(error);
    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Превышена квота запросов к AI для обработки файлов. Пожалуйста, подождите.");
    }
    
    if (safeMimeType === 'text/plain') {
       try {
         const binaryString = atob(base64);
         const bytes = new Uint8Array(binaryString.length);
         for (let i = 0; i < binaryString.length; i++) {
           bytes[i] = binaryString.charCodeAt(i);
         }
         return new TextDecoder().decode(bytes);
       } catch (e) {
         throw new Error(`Не удалось извлечь текст из файла: ${message}`);
       }
    }
    throw new Error(`Не удалось извлечь текст из файла: ${message}`);
  }
}
