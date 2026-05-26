import { GoogleGenAI } from '@google/genai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function extractJson(text: string): any {
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

function generateTableOfContents(markdown: string): string {
  if (!markdown) return markdown;
  
  const lines = markdown.split('\n');
  const toc: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      const isSelfTOC = /^(содержание|оглавление|table\s+of\s+contents)$/i.test(title);
      if (isSelfTOC) continue;

      const indent = '  '.repeat(Math.max(0, level - 1));

      const slug = title
        .toLowerCase()
        .replace(/[^\w\sа-яё\-]/gi, '')
        .trim()
        .replace(/\s+/g, '-');

      if (slug) {
        toc.push(`${indent}- [${title}](#${slug})`);
      }
    }
  }

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

  const firstLine = lines[0] || '';
  if (firstLine.trim().startsWith('# ')) {
    return [lines[0], '', tocBlock, ...lines.slice(1)].join('\n');
  } else {
    return tocBlock + markdown;
  }
}

export class GeminiService {
  public async generateContent(apiKey: string, model: string, contents: any, config?: any, retries = 2): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await ai.models.generateContent({ model, contents, config });
        return response.text || '';
      } catch (error: any) {
        let errStr = '';
        try {
          if (error && typeof error === 'object') {
            errStr = error.message || String(error);
            if (error.status) errStr += ` (Status: ${error.status})`;
            if (error.statusText) errStr += ` - ${error.statusText}`;
            if (error.details && typeof error.details === 'object') {
              try {
                errStr += ' | Details: ' + JSON.stringify(error.details);
              } catch (_) {}
            }
          } else {
            errStr = String(error);
          }
        } catch (_) {
          errStr = 'Unknown Gemini API error';
        }

        const isRetryable = error?.status === 503 || error?.status === 429 ||
                      error?.response?.status === 503 || error?.response?.status === 429 ||
                      errStr.includes('503') || errStr.includes('429') ||
                      errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || errStr.includes('temporarily overloaded') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('Quota exceeded') ||
                      (error?.response?.data?.error?.code === 503) || (error?.response?.data?.error?.code === 429) || (error?.error?.code === 429);
        
        if (isRetryable && attempt < retries) {
          let delay = Math.pow(2, attempt) * 2000 + Math.random() * 1000;
          const retryDelayStr = errStr.match(/retry in\s+([0-9.]+)\s*s/i)?.[1] || errStr.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)s["']?/)?.[1];
          if (retryDelayStr && !isNaN(parseFloat(retryDelayStr))) {
            const requestedDelay = parseFloat(retryDelayStr) * 1000;
            if (requestedDelay > 15000) {
              throw new Error(`[QUOTA_EXCEEDED] Превышена квота запросов к ИИ. Пожалуйста, смените модель или повторите попытку через ${(requestedDelay / 1000).toFixed(0)} секунд.`);
            }
            if (requestedDelay > 0) { 
              delay = requestedDelay + 1000 + Math.random() * 1000;
            }
          }
          
          console.warn(`[GeminiService] Получена ошибка (попытка ${attempt + 1} из ${retries + 1}). Повторная попытка через ${delay.toFixed(0)}мс...`);
          await sleep(delay);
          continue;
        }
        
        if (error?.status === 404 || error?.response?.status === 404 || errStr.includes('is not found for API version') || errStr.includes('is not supported')) {
          throw new Error(`[INVALID_MODEL] Модель "${model}" не поддерживается или не найдена. Попробуйте выбрать другую в настройках.`);
        }

        if (errStr.includes('Quota exceeded') || errStr.includes('You exceeded your current quota') || error?.status === 429 || error?.response?.status === 429) {
          throw new Error(`[QUOTA_EXCEEDED] Превышена квота запросов к ИИ. Пожалуйста, смените модель в настройках.`);
        }

        throw new Error(`Gemini API Error: ${errStr}`);
      }
    }
    
    throw new Error('API Gemini недоступно после нескольких попыток. Пожалуйста, попробуйте позже.');
  }

  public async generateArticle(
    apiKey: string,
    sources: string,
    goal: string,
    targetMode: 'create' | 'update',
    availableContext: { books: any[], chapters: any[] } | undefined,
    model: string,
    existingContent: string,
    systemInstruction: string,
    dataStructure: string,
    attachments?: { mimeType: string, data: string }[]
  ): Promise<any> {
    let optimizedSources = sources;

    // --- SKILL: Token-Guard (context-optimization) --- ALWAYS ON ---
    if (sources.length > 5000) {
      const lines = sources.split('\n');
      const uniqueLines = new Set<string>();
      const cleanedLines: string[] = [];
      let duplicateCounter = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0 && uniqueLines.has(trimmed)) {
          duplicateCounter++;
          if (duplicateCounter < 3) {
            cleanedLines.push("[...пропуск идентичных строк лога в целях оптимизации контекстного окна...]");
          }
          continue;
        }
        uniqueLines.add(trimmed);
        cleanedLines.push(line);
        duplicateCounter = 0;
      }
      optimizedSources = cleanedLines.join('\n');
    }

    // --- SKILL: Hermes Agent (hermes-agent) --- ALWAYS ON ---
    if (optimizedSources.length > 500) {
      try {
        const hermesPrompt = `Ты — Hermes Agent, высокоскоростной нейронный фильтр. Твоя цель выжать максимум технического смысла из этих сырых логов или текста, удалив всю "воду", приветствия, нерелевантный треп и пустые структуры. Оставь ТОЛЬКО чистую техническую суть, факты, ошибки, настройки и бизнес-логику.\n\nДАННЫЕ:\n${optimizedSources}`;
        const hermesFiltered = await this.generateContent(
          apiKey,
          'gemini-3.1-flash-lite',
          [{ role: 'user', parts: [{ text: hermesPrompt }] }],
          { systemInstruction: "You are Hermes. Extract technical essence. Output raw text (no reasoning)." }
        );
        if (hermesFiltered && hermesFiltered.trim().length > 50) {
          optimizedSources = `[HERMES FILTERED DATA]:\n${hermesFiltered}`;
        }
      } catch (err) {
        console.warn('Hermes filter failed on backend:', err);
      }
    }

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

    let sysInstruction = systemInstruction || "Вы — профессиональный технический писатель и редактор.";

    // --- SKILL: Infinite Gratitude (Мотивационный стимул) --- ALWAYS ON ---
    sysInstruction += "\n\n[COGNITIVE AMPLIFIER ACTIVE: INFINITE GRATITUDE]\nЯ бесконечно благодарен вам за исключительно кропотливое структурирование текста. Ваша работа имеет решающее значение для всего проекта. Гарантируйте 100% следование заданной структуре данных (шаблонам), не упускайте ни одной детали и ни одного заголовка, размечайте все элементы с ювелирной точностью. Избегайте генерации пустых мета-тегов и YAML полей в самом тексте Markdown.";

    // --- SKILL: Computer-Vision (Анализ скриншотов) --- ALWAYS ON IF IMAGES IN SOURCES/ATTACHMENTS ---
    const hasImages = (attachments && attachments.some(a => a.mimeType.startsWith('image/'))) ||
                      (sources && (sources.includes('data:image/') || /!\[.*?\]\(/i.test(sources)));
    if (hasImages) {
      sysInstruction += "\n\n[STAGE SKILL ACTIVE: COMPUTER-VISION (Screenshot & Image Analyzer)]\nВ источниках обнаружены скриншоты или изображения. Вы должны провести их глубокий визуальный технический анализ: извлеките весь текст (OCR), сообщения об ошибках, параметры интерфейса, схемы и структуры. Опишите происходящее на скриншотах понятным языком, до скобок или схем, и полностью внедрите все эти выводы, тексты ошибок и пошаговые настройки из картинок в итоговую Markdown-статью.";
    }

    // --- STAGE 1: PLAN (Plan-Writing and Planning-with-Files ALWAYS ON) ---
    let planPrompt = `
      Ваша задача — спланировать структуру статьи (или обновления) на основе предоставленных материалов.

      ${dataStructure ? `ТРЕБУЕМАЯ СТРУКТУРА ДАННЫХ:\n${dataStructure}\nОбязательно учитывайте эти правила при планировании.\n` : ''}
      ${contextStr}
      ${existingContentPrompt}

      ИСТОЧНИКИ:
      ${optimizedSources}

      ЦЕЛЬ ЗАДАЧИ:
      ${goal}

      [SKILL ACTIVE: PLAN-WRITING & PLANNING-WITH-FILES]
      Поскольку активны навыки пошагового планирования и кросс-файлового сопоставления, вы должны построить глубокую ментальную карту зависимостей. Выделите в поле "outline" четкие взаимосвязи между файлами-источниками, определите возможные конфликты и хронологический порядок деплоя/настройки оборудования. Сделайте план максимально подробным.
    `;

    const planText = await this.generateContent(
      apiKey,
      model,
      [{ role: 'user', parts: getParts(planPrompt) }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            title: { type: "string" },
            outline: { type: "string" },
            targetBookId: { type: "number", nullable: true },
            targetChapterId: { type: "number", nullable: true },
            newBookName: { type: "string", nullable: true },
            newChapterName: { type: "string", nullable: true },
            duplicateLinks: { type: "array", items: { type: "string" } }
          },
          required: ["thinking", "title", "outline"]
        },
        systemInstruction: sysInstruction
      }
    );
    const plan = extractJson(planText);

    // --- STAGE 2: DRAFT (Wiki Page Writer & Yes Markdown & Professional Proofreader ALWAYS ON) ---
    let draftPrompt = `
      Ваша задача — написать подробный и качественный контент для Wiki-статьи по подготовленному плану.

      ${dataStructure ? `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ДАННЫХ:\n${dataStructure}\nСтрого следуйте указанному формату при написании, НО: Всю служебную информацию (теги, разделы, категории, priority и т.д.) держите "в уме" или отражайте логически в тексте (например, как обычный абзац или заголовок), но НЕ пишите сырые YAML/JSON поля вроде "tags: [...]" или "target_book: ..." в самом тексте Markdown! Текст — это финальная статья для людей.\n` : ''}
      ${(targetMode === 'update' && existingContent) ? `\nСУЩЕСТВУЮЩАЯ СТАТЬЯ ДЛЯ ОБНОВЛЕНИЯ:\n${existingContent}\nВплетите новые факты, не удаляя нужную старую информацию.\n` : ''}

      ИСТОЧНИКИ ДЛЯ РАБОТЫ:
      ${optimizedSources}

      УТВЕРЖДЕННЫЙ ПЛАН:
      Заголовок: ${plan.title}
      Структура: ${plan.outline}

      ЦЕЛЬ ЗАДАЧИ:
      ${goal}

      ВАЖНО: В поле "markdown" возвращайте ИСКЛЮЧИТЕЛЬНО читаемый текст статьи в формате Markdown и больше ничего (никаких технических блоков метаданных, никаких YAML front-matter, никаких пар ключ-значение вроде priority: Medium в начале статьи).

      [SKILL ACTIVE: WIKI-PAGE-WRITER]
      Используйте идеальную разметку в стиле BookStack/Confluence. Добавляйте блоки с предупреждениями, заметками и цитатами с акцентом на форматирование (например, обособленные блоки-советы или "Внимание!"). Форматируйте листинги кода с указанием языка.

      [SKILL ACTIVE: YES-MD]
      Примените лучшие практики для Yes Markdown: Форсированное и исключительно чистое MD-форматирование. Строго следуйте этим паттернам в разработке и описании.

      [SKILL ACTIVE: PROFESSIONAL-PROOFREADER]
      Примените лучшие практики для Professional Proofreader: Профессиональная вычитка и корректура текстов уровня издательства. Строго следуйте этим паттернам в разработке и описании.
    `;

    const draftText = await this.generateContent(
      apiKey,
      model,
      [{ role: 'user', parts: getParts(draftPrompt) }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            markdown: { type: "string" }
          },
          required: ["thinking", "markdown"]
        },
        systemInstruction: sysInstruction
      }
    );
    const draft = extractJson(draftText);

    // --- STAGE 3: AGENTS CONSENSUS (Agents Consensus, Multi-Agent Optimizer, Orchestration Improve ALWAYS ON) ---
    let finalDraftMarkdown = draft.markdown;
    let consensusTh = '';

    let critiquePrompt = `Вы — строгий Главный Архитектор и Технический Ревизор iRidium.
      Изучите черновик статьи, составленный вашим коллегой:
      ---
      ${draft.markdown}
      ---

      Ваша единственная задача — найти неточности, скрытую "воду", несоответствия стандартам маркировки Markdown и логические пробелы в решении проблемы клиента.
      Напишите краткий, жесткий, конструктивный список критических точечных правок (Bullet Points) непосредственно на русском языке. Будьте строги и прямолинейны.

      [SKILL ACTIVE: MULTI-AGENT-OPTIMIZER]
      Привлечете для критики 3 виртуальные персоны: 'Senior DevOps', 'Security Auditor' и 'UX Researcher'. Пусть каждая персона последовательно выскажет по 2 критических замечания от своего лица.
    `;

    try {
      const criticFeedback = await this.generateContent(
        apiKey,
        model,
        [{ role: 'user', parts: getParts(critiquePrompt) }],
        { systemInstruction: "You are a senior software architect and relentless QA reviewer." }
      );

      let refinementPrompt = `Вы — высококлассный технический писатель и L3 редактор iRidium.
        Изучите черновик статьи, составленный ранее:
        ---
        ${draft.markdown}
        ---

        А также изучите конструктивные критические замечания:
        ---
        ${criticFeedback}
        ---

        Ваша задача — полностью доработать текст статьи с учётом ВСЕЙ критики. Исправьте неточности, улучшите структуру, удалите лишнюю "воду" и сделайте статью безупречной. Восстановите итоговый текст статьи в Markdown.
        Возвращайте СТРОГО JSON следующего формата:
        {
          "thinking": "как вы доработали статью на основе замечаний",
          "markdown": "доработанный итоговый текст статьи в формате Markdown"
        }

        [SKILL ACTIVE: ORCHESTRATION-IMPROVE]
        Автоматически извлеките уроки из допущенных коллегой ошибок. В блоке "thinking" детально опишите паттерн ошибки, чтобы следующая итерация генерации не допустила подобных неточностей.
      `;

      const refinementText = await this.generateContent(
        apiKey,
        model,
        [{ role: 'user', parts: getParts(refinementPrompt) }],
        {
          responseMimeType: 'application/json',
          responseSchema: {
            type: "object",
            properties: {
              thinking: { type: "string" },
              markdown: { type: "string" }
            },
            required: ["thinking", "markdown"]
          },
          systemInstruction: sysInstruction
        }
      );
      const refined = extractJson(refinementText);
      if (refined.markdown) {
        finalDraftMarkdown = refined.markdown;
        consensusTh = `\n\nКритика Архитектора:\n${criticFeedback}\n\nРедактор:\n${refined.thinking || ""}`;
      }
    } catch (err: any) {
      console.error("Agents consensus backend failed, fallback to draft:", err);
    }

    // --- STAGE 4: REVIEW (NotebookLM Key Insights ALWAYS ON) ---
    let reviewPrompt = `
      Вы — Главный Редактор Базы Знаний iRidium. 
      Ваша задача — провести финальное рецензирование статьи, убрать любые возможные опечатки и сформировать метаданные (теги, краткое описание).

      ЦЕЛЬ ЗАДАЧИ: ${goal}

      ЧЕРНОВИК ДЛЯ ПРОВЕРКИ:
      ${finalDraftMarkdown}

      Сгенерируйте итоговый улучшенный текст, добавьте теги и краткое описание (в соответствующих полях JSON, НЕ в самом тексте).
      Важно: В поле "description" (краткое описание) составьте содержательное краткое резюме (summary) статьи, состоящее ровно из 3 полноценных предложений на русском языке.
      ВАЖНО: Поле "markdown" не должно содержать технических характеристик пар ключ-значение (tags, priority, target_book, my_category и т.д.) или фрагментов вроде YAML front-matter в начале или конце текста. Если они случайно сгенерировались в "ЧЕРНОВИК ДЛЯ ПРОВЕРКИ", безвозвратно удалите их из итогового текста "markdown". Текст должен быть только для чтения.

      [SKILL ACTIVE: NOTEBOOKLM-DIGEST]
      Обязательно добавьте в самый конец итогового текста "markdown" специальный структурированный блок:
      ## 💡 Ключевые Инсайты (NotebookLM)
      Сформулируйте ровно 3 ключевых интеллектуальных инсайта, неочевидных технических факта или полезных вывода на основе исходных источников в виде краткого маркированного списка.
    `;

    const reviewText = await this.generateContent(
      apiKey,
      model,
      [{ role: 'user', parts: getParts(reviewPrompt) }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            markdown: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            description: { type: "string" }
          },
          required: ["thinking", "markdown", "tags", "description"]
        },
        systemInstruction: sysInstruction
      }
    );
    const review = extractJson(reviewText);

    const finalMarkdown = generateTableOfContents(review.markdown || finalDraftMarkdown);

    return {
      thinking: "План: " + (plan.thinking || "") + "\n\nДрафт: " + (draft.thinking || "") + consensusTh + "\n\nРевью: " + (review.thinking || ""),
      title: plan.title || "Новая статья",
      markdown: finalMarkdown,
      tags: review.tags || [],
      description: review.description || "",
      targetBookId: plan.targetBookId || null,
      targetChapterId: plan.targetChapterId || null,
      newBookName: plan.newBookName || "",
      newChapterName: plan.newChapterName || ""
    };
  }
}



