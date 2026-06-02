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
  public async generateContent(apiKey: string, model: string, contents: any, config?: any, retries = 6): Promise<{ text: string, modelUsed: string }> {
    const ai = new GoogleGenAI({ apiKey });
    let currentModel = model;
    
    // Stable models to try if the current one hits quota within requested list
    const fallbacks = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash'];
    let fallbackIdx = 0;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('REQUEST_TIMEOUT: Response took too long')), 120000)
        );
        
        const genPromise = ai.models.generateContent({ model: currentModel, contents, config });
        const result = (await Promise.race([genPromise, timeoutPromise])) as any;
        
        return { text: result.text || '', modelUsed: currentModel };
      } catch (error: any) {
        let errStr = '';
        let statusCode = error?.status || error?.response?.status;
        
        try {
          if (error && typeof error === 'object') {
            errStr = error.message || String(error);
            if (statusCode) errStr += ` (StatusCode: ${statusCode})`;
            
            // Look for details in SDK error structure
            if (error.details && Array.isArray(error.details)) {
               errStr += ' | Details: ' + JSON.stringify(error.details);
            }
          } else {
            errStr = String(error);
          }
        } catch (_) {
          errStr = 'Unknown Gemini API error';
        }

        const isQuotaError = statusCode === 429 || errStr.includes('429') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED');
        const isRetryable = statusCode === 503 || errStr.includes('503') ||
                      errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || 
                      errStr.includes('temporarily overloaded') || errStr.includes('REQUEST_TIMEOUT') ||
                      isQuotaError;
        
        if (isRetryable && attempt < retries) {
          // Robust exponential backoff with jitter
          let delay = Math.pow(2, attempt) * 2000 + Math.random() * 2000;
          
          // Adaptive retry logic if API specifies delay
          const retryDelayMatch = errStr.match(/retry in\s+([0-9.]+)\s*s/i) || errStr.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)s["']?/);
          if (retryDelayMatch && retryDelayMatch[1]) {
            const requestedDelay = parseFloat(retryDelayMatch[1]) * 1000;
            if (requestedDelay > 0 && requestedDelay < 60000) { 
              delay = Math.max(delay, requestedDelay + 500);
            }
          }

          if (isQuotaError) {
             console.warn(`[GeminiService] Quota hit for ${currentModel}.`);
             
             // AUTOMATIC SWITCH: If quota hit, try to switch to a more stable model in the fallback list
             if (fallbackIdx < fallbacks.length) {
               let nextModel = fallbacks[fallbackIdx];
               // Don't switch to itself
               if (nextModel === currentModel) {
                 fallbackIdx++;
                 if (fallbackIdx < fallbacks.length) nextModel = fallbacks[fallbackIdx];
               }
               
               if (nextModel && nextModel !== currentModel) {
                 console.warn(`[GeminiService] Switching model ${currentModel} -> ${nextModel} due to quota limit.`);
                 currentModel = nextModel;
                 // After switching, we can try with a slightly smaller delay
                 delay = 1000 + Math.random() * 1000;
                 fallbackIdx++;
               } else {
                 delay += 10000; // Extra wait if no more fallbacks
               }
             } else {
               delay += 10000; 
             }
          }
          
          console.warn(`[GeminiService] API spike/error (Attempt ${attempt + 1}/${retries + 1}). Retrying in ${Math.round(delay)}ms... Model: ${currentModel}.`);
          await sleep(delay);
          continue;
        }

        // Final error formatting
        if (isQuotaError) {
          throw new Error(`[QUOTA_EXCEEDED] Превышена квота для модели ${currentModel}. Попробуйте позже или используйте Gemini 1.5 Flash.`);
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

    let currentActiveModel = model;
    
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
        const hermesResult = await this.generateContent(
          apiKey,
          'gemini-3.1-flash-lite',
          [{ role: 'user', parts: [{ text: hermesPrompt }] }],
          { systemInstruction: "You are Hermes. Extract technical essence. Output raw text (no reasoning)." }
        );
        if (hermesResult.text && hermesResult.text.trim().length > 50) {
          optimizedSources = `[HERMES FILTERED DATA]:\n${hermesResult.text}`;
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
         1. ВНИМАТЕЛЬНО изучи СПИСОК КНИГ И ГЛАВ. Найти уже существующее релевантное место!
         2. Ищи по синонимам или более широким категориям. Если логически вписывается в существующую книгу или главу, обязательно используй ЕЁ ID.
         3. Предлагай создание новой книги/главы (указав ID null и название в newBookName/newChapterName) только если тема совершенно новая.
         4. Верни ID книги в targetBookId и ID главы в targetChapterId.\n`
      : '';

    const existingContentPrompt = existingContent
      ? (targetMode === 'update' 
          ? `\nСУЩЕСТВУЮЩЕЕ СОДЕРЖИМОЕ СТАТЬИ:\n${existingContent}\n\nИНСТРУКЦИЯ: Статья обновляется. Учитывай существующий контент!\n`
          : `\nИНФОРМАЦИЯ О ДУБЛИКАТАХ В БАЗЕ:\n${existingContent}\n\nИНСТРУКЦИЯ: Вы создаете новую статью. При необходимости сошлитесь на похожие в поле duplicateLinks.\n`
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

    let sysInstruction = (systemInstruction || "Вы — профессиональный технический писатель и редактор.") + 
      "\n\n[COGNITIVE AMPLIFIER ACTIVE: INFINITE GRATITUDE]\nГарантируйте 100% следование структуре, размечайте элементы с точностью. Избегайте пустых мета-тегов и YAML в тексте Markdown.";

    const hasImages = (attachments && attachments.some(a => a.mimeType.startsWith('image/'))) ||
                      (sources && (sources.includes('data:image/') || /!\[.*?\]\(/i.test(sources)));
    if (hasImages) {
      sysInstruction += "\n\n[STAGE SKILL ACTIVE: COMPUTER-VISION]\nПроведите глубокий визуальный технический анализ изображений: извлеките текст (OCR), параметры и схемы.";
    }

    // --- STAGE 1: PLAN ---
    let planPrompt = `
      Спланируйте структуру статьи на основе материалов.
      ${dataStructure ? `ТРЕБУЕМАЯ СТРУКТУРА ДАННЫХ:\n${dataStructure}\n` : ''}
      ${contextStr}
      ${existingContentPrompt}
      ИСТОЧНИКИ: ${optimizedSources}
      ЦЕЛЬ ЗАДАЧИ: ${goal}
    `;

    const planResult = await this.generateContent(
      apiKey,
      currentActiveModel,
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
    currentActiveModel = planResult.modelUsed;
    const plan = extractJson(planResult.text);

    // --- STAGE 2: DRAFT & SELF-REFINEMENT ---
    let draftPrompt = `
      Напишите подробный, качественный и вычитанный контент для Wiki-статьи по плану.
      ${dataStructure ? `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ДАННЫХ:\n${dataStructure}\n` : ''}
      ${(targetMode === 'update' && existingContent) ? `\nСУЩЕСТВУЮЩАЯ СТАТЬЯ:\n${existingContent}\n` : ''}
      ИСТОЧНИКИ: ${optimizedSources}
      ПЛАН: ${plan.title} / ${plan.outline}
      ЦЕЛЬ: ${goal}
      ВАЖНО: Поле "markdown" должно содержать ТОЛЬКО чистый Markdown без YAML/метаданных.
    `;

    const draftResult = await this.generateContent(
      apiKey,
      currentActiveModel,
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
        systemInstruction: sysInstruction + "\n[REFINEMENT: Проведите автоматическую вычитку и корректуру. Уберите воду.]"
      }
    );
    currentActiveModel = draftResult.modelUsed;
    const draft = extractJson(draftResult.text);

    // --- STAGE 3: FINAL REVIEW ---
    let reviewPrompt = `
      Финальное рецензирование статьи. Сформируйте теги и краткое описание (3 предложения).
      ЦЕЛЬ: ${goal}
      ЧЕРНОВИК: ${draft.markdown}
      Добавьте блок: ## 💡 Ключевые Инсайты (NotebookLM) с 3 фактами в конце.
    `;

    const reviewResult = await this.generateContent(
      apiKey,
      currentActiveModel,
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
    currentActiveModel = reviewResult.modelUsed;
    const review = extractJson(reviewResult.text);

    const finalMarkdown = generateTableOfContents(review.markdown || draft.markdown);

    return {
      thinking: "План: " + (plan.thinking || "") + "\n\nДрафт: " + (draft.thinking || "") + "\n\nРевью: " + (review.thinking || ""),
      title: plan.title || "Новая статья",
      markdown: finalMarkdown,
      tags: review.tags || [],
      description: review.description || "",
      targetBookId: plan.targetBookId || null,
      targetChapterId: plan.targetChapterId || null,
      newBookName: plan.newBookName || "",
      newChapterName: plan.newChapterName || "",
      modelUsed: currentActiveModel
    };
  }
}



