// All Gemini calls go through the server-side proxy /api/gemini/generate
// so the API key is never exposed to the browser and requests originate from the server IP.

import axios from 'axios';
import { BookStackCredentials } from '../types';
export const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite',         label: 'Gemini 3.1 Flash-Lite', description: 'Сверхбыстрая и стабильная модель 3-го поколения' },
  { id: 'gemini-3.5-flash',              label: 'Gemini 3.5 Flash', description: 'Новейшая экспериментальная модель' },
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live', description: 'Превью-версия с поддержкой Real-time функций' },
  { id: 'gemini-3-flash-preview',        label: 'Gemini 3 Flash Preview', description: 'Высокая производительность' },
  { id: 'gemini-2.5-pro',                label: 'Gemini 2.5 Pro', description: 'Продвинутая модель для глубокого анализа' },
] as const;

export type GeminiModelId = typeof GEMINI_MODELS[number]['id'];

export const DEFAULT_MODEL: GeminiModelId = 'gemini-3.1-flash-lite';

export interface CallGeminiConfig {
  responseMimeType?: string;
  responseSchema?: any;
  systemInstruction?: string;
  signal?: AbortSignal;
  checkPause?: () => Promise<void>;
}

export async function callGemini(model: GeminiModelId, contents: any[], config?: CallGeminiConfig): Promise<{ text: string, modelUsed: string }> {
  if (config?.checkPause) await config.checkPause();
  
  let res;
  try {
    res = await axios.post('/api/gemini/generate', { 
      model, 
      contents, 
      config: { 
        responseMimeType: config?.responseMimeType,
        responseSchema: config?.responseSchema,
        systemInstruction: config?.systemInstruction
      } 
    }, {
      signal: config?.signal,
      timeout: 600000
    });
  } catch (err: any) {
    if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
      throw err;
    }
    if (err.response) {
      throw new Error(`Ошибка от сервера (${err.response.status}): ${err.response.data?.error || err.response.data || err.message}`);
    } else if (err.code === 'ECONNABORTED') {
      throw new Error('Сетевая ошибка: превышено время ожидания ответа от ИИ (timeout).');
    }
    throw new Error(`Сетевая ошибка при обращении к серверу: ${err.message}`);
  }

  return { 
    text: res.data?.text || '', 
    modelUsed: res.data?.modelUsed || model 
  };
}

export function extractJson(text: string): any {
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
    return {};
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
  options?: { 
    signal?: AbortSignal, 
    checkPause?: () => Promise<void>, 
    onProgress?: (msg: string) => void, 
    systemInstruction?: string, 
    dataStructure?: string,
    activeSkills?: Record<string, boolean>
  },
  attachments?: { mimeType: string; data: string }[]
): Promise<any> {
  if (options?.onProgress) {
    options.onProgress('Запуск многоагентного синтеза на бэкенде (все агенты включены постоянно)...');
  }

  try {
    const response = await axios.post('/api/gemini/generate-article', {
      sources,
      goal,
      targetMode,
      availableContext,
      model,
      existingContent,
      systemInstruction: options?.systemInstruction,
      dataStructure: options?.dataStructure,
      attachments
    }, {
      signal: options?.signal,
      timeout: 600000 // 10 minutes timeout for the whole workflow max
    });

    return response.data;
  } catch (error: any) {
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      throw error;
    }
    console.warn('Backend generateArticle failed, throwing error:', error);
    
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Сетевая ошибка: превышено время ожидания сервера во время генерации статьи. Пожалуйста, попробуйте повторить попытку.`);
    }

    throw new Error(`Ошибка генерации статьи на бэкенде: ${error.response?.data?.error || error.message || String(error)}`);
  }
}

/**
 * Генерирует интерактивное оглавление (Table of Contents) на основе заголовков Markdown.
 * Оглавление строится, если статья достаточно длинная (содержит 2 и более заголовков).
 */
export function generateTableOfContents(markdown: string): string {
  if (!markdown) return markdown;
  
  const lines = markdown.split('\n');
  const toc: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Пропускаем блоки кода, заголовки внутри них не учитываются
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Регулярное выражение для поиска заголовков (от # до ######)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      // Пропускаем служебные заголовки оглавления, чтобы избежать дублирования
      const isSelfTOC = /^(содержание|оглавление|table\s+of\s+contents)$/i.test(title);
      if (isSelfTOC) continue;

      // Отступы в зависимости от уровня заголовка (начиная со 2-го уровня)
      const indent = '  '.repeat(Math.max(0, level - 1));

      // Генерация Slug (якоря/ссылки) по правилам BookStack
      const slug = title
        .toLowerCase()
        .replace(/[^\w\sа-яё\-]/gi, '') // удаление спецсимволов кроме букв, цифр, пробелов и дефисов
        .trim()
        .replace(/\s+/g, '-');         // пробелы в дефисы

      if (slug) {
        toc.push(`${indent}- [${title}](#${slug})`);
      }
    }
  }

  // Если заголовков мало, оглавление не требуется
  if (toc.length < 2) {
    return markdown;
  }

  const tocBlock = [
    '## Содержание',
    ...toc,
    '',
    '---',
    ''
  ].join('\n');

  // Вставляем оглавление после первого заголовка уровня H1 (# Заголовок) или в самое начало
  const firstLine = lines[0] || '';
  if (firstLine.trim().startsWith('# ')) {
    return [lines[0], '', tocBlock, ...lines.slice(1)].join('\n');
  } else {
    return tocBlock + markdown;
  }
}

export async function generateMindmap(
  combinedContent: string,
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
): Promise<string> {
  const prompt = `Вы — Ассистент NotebookLM. Создай Mindmap по загруженным источникам. Верни СТРОГО вложенными списками Markdown. Корень должен быть один (название темы). НИКАКИХ дополнительных слов, только списки.\n\nАКТИВНЫЕ ИСТОЧНИКИ:\n${combinedContent}`;
  const result = await callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }], { signal: options?.signal, checkPause: options?.checkPause });
  return result.text;
}

export async function generateFAQ(
  combinedContent: string,
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
): Promise<string> {
  const prompt = `Вы — Ассистент NotebookLM. Составь подробный FAQ (Часто задаваемые вопросы) на основе загруженных источников. Отформатируй красиво в Markdown.\n\nАКТИВНЫЕ ИСТОЧНИКИ:\n${combinedContent}`;
  const result = await callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }], { signal: options?.signal, checkPause: options?.checkPause });
  return result.text;
}

export async function generateMermaid(
  combinedContent: string,
  model: GeminiModelId = DEFAULT_MODEL,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void> }
): Promise<string> {
  const prompt = `Вы — эксперт по визуализации данных и системный аналитик. Создайте детализированную схему Mermaid.js (например, graph TD, sequenceDiagram или stateDiagram-v2) на основе предоставленных источников или текста статьи.
Схема должна визуализировать архитектуру, технический процесс, алгоритм работы или карту связей, описанную в контенте.

Правила:
1. Верните ТОЛЬКО код Mermaid внутри блока \`\`\`mermaid ... \`\`\`. Не пишите никакого вводного или заключительного текста.
2. Используйте понятные текстовые метки на русском языке (для кириллицы в Mermaid используйте кавычки: A["Название шага"] --> B["Другой шаг"]).
3. Сделайте диаграмму максимально информативной и структурированной.

АКТИВНЫЕ ИСТОЧНИКИ:
${combinedContent}`;
  const result = await callGemini(model, [{ role: 'user', parts: [{ text: prompt }] }], { signal: options?.signal, checkPause: options?.checkPause });
  return result.text;
}

export async function extractTextFromFile(
  base64: string, 
  mimeType: string, 
  _model?: any, // Ignored to force cheap model
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, activeSkills?: Record<string, boolean> }
) {
  const safeMimeType = mimeType === 'application/octet-stream' ? 'text/plain' : mimeType;
  const parsingModel = 'gemini-3.1-flash-lite';

  let prompt = `Извлеки весь значимый текст из этого файла. 
    Если это HTML, убери скрипты и стили, верни только контент. 
    Если это PDF, сохрани логическую структуру. 
    Верни ТОЛЬКО извлеченный текст, без своих комментариев.`;

  // --- SKILL: PDF-CONVERSION-ROUTER ---
  if (safeMimeType === 'application/pdf') {
    prompt = `Вы — высокоточная машина по разметке PDF документов и извлечению данных (OCR + Layout Structure).
Ваша задача — извлечь весь значимый текст и таблицы из этого PDF-файла.
Требования:
1. Сохраняйте исходную логическую структуру и иерархию разделов (заголовки h1/h2/h3).
2. Склеивайте разорванные слова и убирайте знаки переноса в слогах, возникшие из-за узких колонок PDF.
3. ОБЯЗАТЕЛЬНО: Если в файле содержатся таблицы или структурированные списки, преобразуйте их в аккуратные, валидные Markdown-таблицы (со столбцами и разделителями |---|). Не сливайте колонки в кашу.
4. Отформатируйте все неструктурированные перечисления.
5. Верните исключительно чистый Markdown с текстом и таблицами, без ваших мета-комментариев.`;
  }

  try {
    const result = await callGemini(
      parsingModel as GeminiModelId,
      [{ role: 'user', parts: [{ text: prompt }, { inlineData: { data: base64, mimeType: safeMimeType } }] }],
      { signal: options?.signal, checkPause: options?.checkPause }
    );
    return result.text;
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

export async function analyzeLogsDirectly(
  logContent: string,
  logName: string,
  activeSkills?: Record<string, boolean>
): Promise<string> {
  const modelToUse = 'gemini-3.1-flash-lite';
  let skillDirectives = '';
  if (activeSkills?.['log-analyzer']) {
    skillDirectives += `\n- Детально разберите ошибки (ERROR, CRITICAL, FATAL): выявите их причины, сгруппируйте по типам, подсчитайте частоту возникновения и предложите точечные технические решения по их устранению.`;
  }
  if (activeSkills?.['analyzing-logs']) {
    skillDirectives += `\n- Проведите глубокий анализ производительности (Performance Insights): найдите медленные запросы (аномально высокий latency, длительные SQL-запросы или API-вызовы) и узкие места в системных ресурсах. Дайте рекомендации по ускорению и оптимизации.`;
  }
  if (!skillDirectives) {
    skillDirectives = `\n- Проведите базовый разбор лог-файла: выявите ключевые предупреждения, ошибки и дайте общее состояние системы на основе логов.`;
  }

  const prompt = `Ты — элитный и опытный Senior DevOps и Cloud Infrastructure Architect.
Проведи профессиональный разбор и анализ предоставленного лог-файла "${logName}".

Вот содержимое логов:
---
${logContent.substring(0, 100000)} ${logContent.length > 100000 ? '\n\n[...Текст лога обрезан в целях экономии токенов...]' : ''}
---

Выполни следующие задачи:${skillDirectives}

Требования к оформлению отчета:
1. Пиши исключительно на русском языке, в авторитетном, строгом и лаконичном тоне.
2. Используй профессиональный Markdown (с разделителями, блоками кода для стектрейсов или SQL-запросов, а также аккуратными таблицами).
3. Избегай "воды". Сразу переходи к делу.
4. В самом начале выведи Краткое резюме здоровья системы (Health Status): OK / Warning / Critical.

Верни только готовый Markdown-отчет без каких-либо вводных слов вроде "Конечно, вот ваш отчет:".`;

  const response = await callGemini(
    modelToUse as GeminiModelId,
    [{ role: 'user', parts: [{ text: prompt }] }],
    { systemInstruction: "You are an elite DevOps and senior system performance analyst." }
  );
  return response.text;
}
