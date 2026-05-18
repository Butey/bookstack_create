const fs = require('fs');

const path = require('path');

const code = fs.readFileSync('src/services/gemini.ts', 'utf8');

const newFunc = `export async function generateArticleFromSources(
  sources: string, 
  goal: string, 
  targetMode: 'create' | 'update' = 'create',
  availableContext?: { books: any[], chapters: any[] },
  previousChat?: { role: 'user' | 'model', content: string }[],
  onProgress?: (step: string) => void
) {
  const contextStr = availableContext 
    ? \`\\nСПИСОК ДОСТУПНЫХ МЕСТ (КНИГИ И ГЛАВЫ):
       КНИГИ: \${JSON.stringify(availableContext.books.map(b => ({ id: b.id, name: b.name })))}
       ГЛАВЫ: \${JSON.stringify(availableContext.chapters.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })))}\n\`
    : '';

  const historyPrompt = previousChat && previousChat.length > 0 
    ? \`\\nПРЕДЫДУЩИЙ ДИАЛОГ И ПРАВКИ:
       \${previousChat.map(m => \`\${m.role === 'user' ? 'ПОЛЬЗОВАТЕЛЬ' : 'АГЕНТ'}: \${m.content}\`).join('\\n')}\\n\`
    : '';

  try {
    const ai = await getAi();
    // Stage 1: Planning
    if (onProgress) onProgress('Агент: Планирование структуры (Plan)...');
    const planPrompt = \`Вы — AI архитектор (Planner). Твоя задача: на основе источников и цели составить подробный план будущей статьи.
    РЕЖИМ: \${targetMode === 'create' ? 'СОЗДАНИЕ НОВОЙ СТАТЬИ' : 'ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕЙ'}
    \${contextStr}
    \${historyPrompt}
    ИСТОЧНИКИ:
    \${sources}
    ЦЕЛЬ ЗАДАЧИ:
    \${goal}
    ВЕРНИ ТОЛЬКО JSON с планом (идеями для заголовков), предполагаемой книгой, тегами и кратким обоснованием. ПРИМЕР:
    { "thinking_plan": "...", "outline": ["заголовок 1", "заголовок 2"], "tags": ["tag1"], "estimatedBookName": "..." }\`;
    
    const planResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: planPrompt,
      config: { responseMimeType: "application/json" }
    });
    const planData = extractJson(planResponse.text || "{}");
    const planJsonStr = JSON.stringify(planData, null, 2);

    // Stage 2: Drafting
    if (onProgress) onProgress('Агент: Написание черновика (Exec/Draft)...');
    const draftPrompt = \`Вы — AI Писатель (Executor). Напиши черновик статьи строго следуя плану архитектора. Используй источники для фактов. Не используй разметку кроме Markdown.
    ИСТОЧНИКИ:
    \${sources}
    ПЛАН ОТ АРХИТЕКТОРА:
    \${planJsonStr}
    ЦЕЛЬ:
    \${goal}
    
    Ответь ТОЛЬКО текстом черновика в формате Markdown.\`;
    
    const draftResponse = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: draftPrompt
    });
    const draftMarkdown = draftResponse.text || "";

    // Stage 3: Reflection / Review
    if (onProgress) onProgress('Агент: Анализ черновика (Reflect/Critique)...');
    const reviewPrompt = \`Вы — AI Редактор (Reviewer). Проверь черновик на соответствие цели, отсутствие выдуманных фактов (галлюцинаций) и соответствие формату BookStack (без метаданных в тексте).
    ЦЕЛЬ ПЕРВОНАЧАЛЬНАЯ:
    \${goal}
    ЧЕРНОВИК:
    \${draftMarkdown}
    ВЕРНИ ТОЛЬКО JSON ПРИМЕР: { "critique": "описание недочетов или 'Всё отлично'", "needs_revision": boolean }\`;

    const reviewResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: reviewPrompt,
      config: { responseMimeType: "application/json" }
    });
    const reviewData = extractJson(reviewResponse.text || "{}");
    
    let finalMarkdown = draftMarkdown;
    let finalizeThinking = "Успешный проход Planning -> Exec -> Critique. " + reviewData.critique;

    // Stage 4: Refine (Optional)
    if (reviewData.needs_revision) {
      if (onProgress) onProgress('Агент: Исправление недочетов (Refine)...');
      const refinePrompt = \`Вы — AI Исправитель (Refiner). Исправь черновик, учитывая критику.
      КРИТИКА ОТ РЕДАКТОРА:
      \${reviewData.critique}
      ЧЕРНОВИК:
      \${draftMarkdown}
      Верни ТОЛЬКО улучшенный текст Markdown без лишних слов.\`;

      const refineResponse = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: refinePrompt
      });
      finalMarkdown = refineResponse.text || draftMarkdown;
      finalizeThinking += ". Черновик был переработан после критики.";
    }

    // Stage 5: Finalization
    if (onProgress) onProgress('Агент: Финализация формата (Output Generation)...');
    const finalFormatPrompt = \`Вы — AI Форматтер. Подготовь финальный пакет для интеграции с API Wiki.
    У тебя есть:
    1. ИСТОРИЯ КОНТЕКСТА: \${contextStr}
    2. ПЛАН: \${planJsonStr}
    3. ФИНАЛЬНАЯ СТАТЬЯ: (Я не буду её передавать целиком для экономии, просто учти, что она готова).

    ИНСТРУКЦИИ ДЛЯ СБОРКИ JSON:
    1. Поле "targetBookId" — Числовой ID выбранной книги. Если книги нет — null.
    2. Поле "targetChapterId" — Числовой ID главы или null.
    3. Поле "newBookName" — Название для НОВОЙ книги (если targetBookId == null).
    4. Поле "newChapterName" — Название для НОВОЙ главы (если targetChapterId == null).
    5. Поле "title" — заголовок для страницы.
    6. Поле "tags" — массив тематических меток (strings) - забери из плана.
    7. Поле "description" — краткое описание (до 200 символов).

    ВЕРНИТЕ СТРОГО JSON В УКАЗАННОМ ФОРМАТЕ БЕЗ ПОЛЯ MARKDOWN И THINKING:
    {
      "title": "заголовок",
      "tags": ["метка1", "метка2"],
      "description": "описание",
      "targetBookId": 123,
      "targetChapterId": 456,
      "newBookName": "Название новой книги",
      "newChapterName": "Название новой главы"
    }\`;

    const finalizeResponse = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: finalFormatPrompt,
      config: { responseMimeType: "application/json" }
    });
    
    const finalData = extractJson(finalizeResponse.text || "{}");
    
    return {
      thinking: finalizeThinking,
      title: finalData.title || planData.title || "Новая статья",
      markdown: finalMarkdown,
      tags: finalData.tags || planData.tags || [],
      description: finalData.description || "Создано агентским пайплайном.",
      targetBookId: finalData.targetBookId !== undefined ? finalData.targetBookId : null,
      targetChapterId: finalData.targetChapterId !== undefined ? finalData.targetChapterId : null,
      newBookName: finalData.newBookName,
      newChapterName: finalData.newChapterName
    };

  } catch (error: any) {
    console.error("Agent Critical Error:", error);
    const message = error.message || String(error);
    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Превышена квота запросов к AI. Пожалуйста, подождите немного или попробуйте позже.");
    }
    throw new Error(\`Агент не смог обработать данные: \${message}\`);
  }
}`;

const startIndex = code.indexOf('export async function generateArticleFromSources');
const endIndexStr = 'export async function extractTextFromFile';
let endIndex = code.indexOf(endIndexStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newCode = code.substring(0, startIndex) + newFunc + '\n\n' + code.substring(endIndex);
  fs.writeFileSync('src/services/gemini.ts', newCode, 'utf8');
} else {
  console.log('could not find index');
}
