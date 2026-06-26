import { MutableRefObject } from 'react';
import { BookStackCredentials, ProcessedArticle, BookStackBook, BookStackChapter, BookStackPage, Source } from '../types';
import { GeminiModelId, generateArticleFromSources, generateMindmap, generateFAQ, generateMermaid } from '../services/gemini';
import { agenticRagWorkflow } from '../services/agent';
import { createBook, fetchBooks, createChapter, createPage, updatePage, indexVectorDocument, fetchPage } from '../services/api';

export function useAgentActions(params: {
  credentials: BookStackCredentials,
  books: BookStackBook[],
  setBooks: any,
  chapters: BookStackChapter[],
  selectedBookId: number | null,
  selectedChapterId: number | null,
  selectedPageId: number | null,
  targetMode: 'create' | 'update',
  setTargetMode: any,
  sources: Source[],
  content: string,
  setContent: any,
  setSources: any,
  customTags: string,
  chatHistory: { role: 'user' | 'model', content: string }[],
  setChatHistory: any,
  lastResponse: ProcessedArticle | null,
  setLastResponse: any,
  workMode: 'auto' | 'review',
  geminiModel: GeminiModelId,
  instructions: string,
  systemInstruction?: string,
  dataStructure?: string,
  searchPrompt: string,
  duplicatePrompt: string,
  contextPrompt: string,
  setPendingApproval: any,
  setIsConsoleOpen: any,
  setRagConfirmation: any,
  setMindmapData: any,
  setMermaidData?: any,
  executionControl: {
    abortControllerRef: MutableRefObject<AbortController | null>;
    checkPauseAndAbort: () => Promise<void>;
    startTask: (steps: { step: number; total: number; label: string }) => void;
    setSyncStatus: any;
    setIsSyncing: any;
    setSyncProgress: any;
  },
  loadChapterPages: any,
  loadChaptersAndPages: any,
  setSelectedBookId: any,
  setSelectedPageId: any,
  activeSkills?: Record<string, boolean>
}) {

  const executePublishing = async (processed: ProcessedArticle) => {
    const {
      credentials, books, setBooks, selectedBookId, selectedChapterId, selectedPageId, targetMode,
      customTags, setContent, setSources, loadChapterPages, loadChaptersAndPages,
      executionControl
    } = params;

    const publishMode = processed.targetPublishMode || targetMode;
    const publishPageId = processed.targetPublishPageId || selectedPageId;
    
    executionControl.setIsSyncing(true);
    try {
      await executionControl.checkPauseAndAbort();
      executionControl.setSyncProgress({ step: 3, total: 3, label: 'Публикация в Wiki' });
      
      let activeBookId = processed.targetPublishBookId || selectedBookId;
      let activeChapterId = selectedChapterId;

      if (publishMode === 'create') {
        if (!processed.targetBookId && processed.newBookName) {
          executionControl.setSyncStatus({ type: 'idle', message: `Создание новой книги: ${processed.newBookName}...` });
          const newBook = await createBook(credentials, processed.newBookName, 'Автоматически создано Агентом');
          activeBookId = newBook.id;
          const updatedBooks = await fetchBooks(credentials);
          setBooks(updatedBooks);
        } else if (processed.targetBookId) {
          activeBookId = Number(processed.targetBookId);
        }

        if (activeBookId && !processed.targetChapterId && processed.newChapterName) {
          executionControl.setSyncStatus({ type: 'idle', message: `Создание новой главы: ${processed.newChapterName}...` });
          const newChapter = await createChapter(credentials, activeBookId, processed.newChapterName, 'Автоматически создано Агентом');
          activeChapterId = newChapter.id;
        } else if (processed.targetChapterId) {
          activeChapterId = Number(processed.targetChapterId);
        }
      }

      // Если целевая книга все еще не найдена/не выбрана при создании, но список доступных книг не пуст
      if (!activeBookId && publishMode === 'create' && books && books.length > 0) {
        activeBookId = books[0].id;
        console.log(`[useAgentActions] Автоматический выбор первой доступной книги в качестве запасного варианта: ID ${activeBookId}`);
      }

      if (!activeBookId && publishMode === 'create') {
        if (books.length === 0) {
          throw new Error('Список книг пуст. Пожалуйста, проверьте настройки подключения к Wiki.');
        }
        throw new Error('Агент не смог автоматически определить или создать целевую книгу. Пожалуйста, выберите её вручную в настройках ниже или уточните инструкции.');
      }

      executionControl.setSyncStatus({ type: 'idle', message: publishMode === 'create' ? `Создание "${processed.title}" в книге ID:${activeBookId}...` : `Обновление статьи...` });

      const userTagsList = customTags.split(',').map(t => t.trim()).filter(Boolean);
      const combinedTags = Array.from(new Set([...(processed.tags || []), ...userTagsList]));
      const finalTags = combinedTags.slice(0, 10);

      let pageUrl = '';
      let indexErrorText = '';

      if (publishMode === 'create') {
        const createRes = await createPage(
          credentials,
          activeBookId!,
          activeChapterId,
          processed.title,
          processed.markdown,
          finalTags,
          processed.description
        );
        pageUrl = createRes?.url || '';
        if (createRes?.id) {
          try {
            await indexVectorDocument(`bookstack:page:${createRes.id}`, processed.markdown, {
              name: processed.title,
              book_id: activeBookId,
              url: pageUrl
            });
          } catch(err: any) {
            console.error('Failed to index to vector DB', err);
            const responseErr = err.response?.data?.error || err.message || '';
            if (responseErr.includes('API_KEY_INVALID')) {
              indexErrorText = ' (Ошибка векторизации ИИ: [API_KEY_INVALID] Неработающий API-ключ Gemini. Проверьте настройки)';
            } else {
              indexErrorText = ` (Ошибка векторизации ИИ: ${responseErr})`;
            }
          }
        }
      } else if (publishPageId) {
        const updateRes = await updatePage(
          credentials,
          publishPageId,
          processed.title,
          processed.markdown,
          finalTags,
          processed.description
        );
        pageUrl = updateRes?.url || '';
        try {
          await indexVectorDocument(`bookstack:page:${publishPageId}`, processed.markdown, {
            name: processed.title,
            book_id: activeBookId,
            url: pageUrl
          });
        } catch(err: any) {
          console.error('Failed to index to vector DB', err);
          const responseErr = err.response?.data?.error || err.message || '';
          if (responseErr.includes('API_KEY_INVALID')) {
            indexErrorText = ' (Ошибка векторизации ИИ: [API_KEY_INVALID] Неработающий API-ключ Gemini. Проверьте настройки)';
          } else {
            indexErrorText = ` (Ошибка векторизации ИИ: ${responseErr})`;
          }
        }
      }

      if (publishMode === 'create') {
        if (indexErrorText) {
          executionControl.setSyncStatus({ 
            type: 'error', 
            message: `"${processed.title}" добавлена в BookStack, но возникла ошибка при векторизации ИИ.${indexErrorText}`,
            url: pageUrl
          });
        } else {
          executionControl.setSyncStatus({ 
            type: 'success', 
            message: `Успех! "${processed.title}" добавлена в BookStack.`,
            url: pageUrl
          });
        }
      } else {
        // update mode or pregenerated mode
        let finalIndexError = ''; // scoped for update error check locally if anyone else needs details
        if (indexErrorText) {
          executionControl.setSyncStatus({ 
            type: 'error', 
            message: `Статья обновлена, но возникла ошибка при векторизации ИИ.${indexErrorText}`,
            url: pageUrl
          });
        } else {
          executionControl.setSyncStatus({ 
            type: 'success', 
            message: `Успех! Статья обновлена.`,
            url: pageUrl
          });
        }
      }
      setContent('');
      setSources([]);
      
      if (selectedChapterId) loadChapterPages(selectedChapterId);
      else if (selectedBookId) loadChaptersAndPages(selectedBookId);
      
    } catch (e: any) {
      console.error(e);
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Рабочий процесс прерван.' });
    } finally {
      executionControl.setIsSyncing(false);
    }
  };

  const processGeneration = async (
    allSourcesText: string, 
    allAttachments: { mimeType: string, data: string, name: string }[],
    currentTargetMode: string, 
    detectedPageId: number | null,
    detectedBookId: number | null,
    forceReview: boolean, 
    ragMsg: string,
    relatedPages?: any[]
  ) => {
    const { 
      credentials, books, chapters, selectedPageId, selectedBookId, instructions, geminiModel,
      workMode, setLastResponse, setPendingApproval, setIsConsoleOpen, executionControl
    } = params;

    let existingContent: string | undefined;
    let originalMarkdownForDiff: string | undefined;
    let originalTitleForDiff: string | undefined;
    if (currentTargetMode === 'update') {
      const pageIdToFetch = detectedPageId || selectedPageId;
      if (pageIdToFetch) {
        
        let allExistingTexts = [];
        // Optional: If we are merging duplicates, fetch all related pages
        if (relatedPages && relatedPages.length > 1) {
          executionControl.setSyncStatus({ type: 'idle', message: 'Сбор содержимого дублирующихся статей для объединения...' });
          for (const rp of relatedPages) {
            try {
              const rpData = await fetchPage(credentials, rp.id);
              const cnt = rpData.markdown || rpData.html || rpData.raw_html || '';
              // Pick the main one as the original for diffing if not set
              if (!originalMarkdownForDiff) {
                originalMarkdownForDiff = cnt;
                originalTitleForDiff = rp.name;
              }
              const pageUrl = rpData.url || `${credentials.baseUrl}/books/${rp.book_id}/page/${rp.id}`;
              allExistingTexts.push(`--- СОДЕРЖИМОЕ СТАТЬИ "${rp.name}" (ID: ${rp.id}, Ссылка: ${pageUrl}) ---\n${cnt}`);
            } catch (e) {
              console.error(`Could not fetch related page ${rp.id}`, e);
            }
          }
          if (allExistingTexts.length > 0) {
            existingContent = `ВНИМАНИЕ РЕДАКТОРУ (ИИ): ОБНАРУЖЕНО НЕСКОЛЬКО СТАТЕЙ-ДУБЛИКАТОВ.\nВАША ЗАДАЧА ОБНОВИТЬ ГЛАВНУЮ И ОБЪЕДИНИТЬ В НЕЕ ПОЛЕЗНЫЕ ФАКТЫ ИЗ ДУБЛИКАТОВ (ЕСЛИ ЕСТЬ), ПЛЮС ИНФОРМАЦИЮ ИЗ НОВЫХ ИСТОЧНИКОВ.\n\n${allExistingTexts.join('\n\n')}`;
          }
        } else {
          try {
            const pageData = await fetchPage(credentials, pageIdToFetch);
            const pageUrl = pageData.url || `${credentials.baseUrl}/books/${pageData.book_id}/page/${pageData.id}`;
            const cnt = pageData.markdown || pageData.html || pageData.raw_html || '';
            originalMarkdownForDiff = cnt;
            originalTitleForDiff = pageData.name;
            existingContent = `--- Ссылка на статью: ${pageUrl} ---\n\n` + cnt;
          } catch (e) {
            console.error("Could not fetch existing page content", e);
          }
        }
      }
    } else if (currentTargetMode === 'create' && relatedPages && relatedPages.length > 0) {
       // if we are creating, but there are related pages, pass them as duplicates info
       const duplicateLines = relatedPages.map(rp => {
          const pageUrl = rp.url || `${credentials.baseUrl}/books/${rp.book_id}/page/${rp.id}`;
          return `- "${rp.name}" (ID: ${rp.id}, Ссылка: ${pageUrl})`;
       });
       existingContent = `Найдены дублирующие статьи:\n${duplicateLines.join('\n')}`;
    }

    await executionControl.checkPauseAndAbort();
    executionControl.setSyncProgress({ step: 2, total: 4, label: 'AI Анализ и синтез статьи' });
    
    const processed = await generateArticleFromSources(
      allSourcesText, 
      params.instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
      currentTargetMode as 'create' | 'update',
      { books: params.books, chapters: params.chapters },
      [],
      params.geminiModel,
      existingContent,
      { 
        signal: params.executionControl.abortControllerRef.current?.signal, 
        checkPause: params.executionControl.checkPauseAndAbort,
        onProgress: (msg) => params.executionControl.setSyncStatus({ type: 'idle', message: msg }),
        systemInstruction: params.systemInstruction,
        dataStructure: params.dataStructure,
        activeSkills: params.activeSkills
      },
      allAttachments
    );

    if (processed.modelUsed && processed.modelUsed !== params.geminiModel) {
      const modelLabel = processed.modelUsed;
      executionControl.setSyncStatus({ 
        type: 'idle', 
        message: `🔄 Переключаюсь на ${modelLabel} (основная модель перегружена)...` 
      });
      processed.thinking = `[ВНИМАНИЕ]: Модель была автоматически переключена на ${processed.modelUsed} из-за временных ограничений квоты (429/503).\n\n` + processed.thinking;
    }
    
    processed.targetPublishMode = currentTargetMode as 'create' | 'update';
    processed.targetPublishPageId = detectedPageId || selectedPageId;
    processed.targetPublishBookId = detectedBookId || selectedBookId;
    processed.originalMarkdown = originalMarkdownForDiff;
    processed.originalTitle = originalTitleForDiff;
    
    if (ragMsg) {
      processed.thinking = ragMsg + processed.thinking;
    }
    
    setLastResponse(processed);

    if (workMode === 'review' || forceReview) {
      setPendingApproval(true);
      executionControl.setIsSyncing(false);
      setIsConsoleOpen(true);
      executionControl.setSyncStatus({ type: 'idle', message: 'Ожидание подтверждения публикации...' });
      return;
    }

    await executePublishing(processed);
  };

  const handleSync = async (pregeneratedContent?: string) => {
    const { 
      targetMode, selectedPageId, selectedBookId, selectedChapterId, customTags,
      sources, content, setLastResponse, workMode, setPendingApproval, setIsConsoleOpen,
      executionControl, setChatHistory, credentials, instructions, geminiModel, setRagConfirmation
    } = params;

    if (typeof pregeneratedContent === 'string' && pregeneratedContent.trim() !== '') {
      const processed = {
        title: 'Новая Статья (из Чата)',
        content: pregeneratedContent,
        thinking: 'Быстрый экспорт из чата. Пожалуйста, укажите необходимую книгу и параметры.',
        targetPublishMode: targetMode,
        targetPublishPageId: selectedPageId,
        targetPublishBookId: selectedBookId,
        targetPublishChapterId: selectedChapterId,
        tags: customTags.split(',').map(t => t.trim()),
      };
      
      setLastResponse(processed);
      if (workMode === 'review') {
         setPendingApproval(true);
         setIsConsoleOpen(true);
         executionControl.setSyncStatus({ type: 'success', message: 'Контент перенесён в консоль и готов к проверке.' });
      } else {
         await executePublishing(processed as ProcessedArticle);
      }
      return;
    }


    if (sources.length === 0 && !content.trim()) {
      executionControl.setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }

    setIsConsoleOpen(true);
    executionControl.startTask({ step: 1, total: 3, label: 'Подготовка данных и структуры' });
    setChatHistory([]); 

    // Clear duplicate/context flags before new analysis
    params.setSources((prev: Source[]) => prev.map(s => ({ ...s, isDuplicate: false, isContext: false, duplicateReference: undefined })));

    try {
      await executionControl.checkPauseAndAbort();
      const selectedSources = sources.filter(s => s.selected !== false);
      if (selectedSources.length === 0 && !content.trim()) {
        throw new Error('Нет выбранных источников или текста для обработки.');
      }

      const allSourcesText = selectedSources.map(s => `SOURCE: ${s.name}\n${s.content}`).join('\n\n') + (content ? `\n\nTEXT:\n${content}` : '');
      const allAttachments = selectedSources.flatMap(s => s.attachments || []);
      
      let currentTargetMode = targetMode;
      let forceReview = false;
      let ragMsg = '';
      let detectedPageId: number | null = null;
      let detectedBookId: number | null = null;
      let analysis: any = null;

      if (!selectedPageId) {
        executionControl.setSyncProgress({ step: 1, total: 4, label: 'Запуск Agentic RAG...' });
        
        analysis = await agenticRagWorkflow(
          allSourcesText, 
          instructions, 
          credentials, 
          geminiModel, 
          (msg) => executionControl.setSyncStatus({ type: 'idle', message: msg }),
          { signal: executionControl.abortControllerRef.current?.signal, checkPause: executionControl.checkPauseAndAbort, searchPrompt: params.searchPrompt, duplicatePrompt: params.duplicatePrompt, contextPrompt: params.contextPrompt }
        );
        
        if (analysis.decision === 'update' && analysis.targetPageId) {
          // Mark sources as potential duplicates if we found a match
          params.setSources((prev: Source[]) => prev.map(s => {
            if (s.selected === false) return s;
            return {
               ...s,
               isDuplicate: true,
               duplicateReference: analysis.targetPageName || 'Существующая статья'
            };
          }));

          setRagConfirmation({
            pageName: analysis.targetPageName || 'Новая статья',
            pageId: analysis.targetPageId || 0,
            bookId: analysis.targetBookId || selectedBookId,
            allSourcesText,
            allAttachments,
            analysis
          });
          executionControl.setIsSyncing(false);
          executionControl.setSyncStatus({ type: 'idle', message: 'Ожидается решение: создание или обновление' });
          return;
        }

        if (analysis.decision === 'create') {
          if (targetMode === 'update') {
            if (analysis.relatedPages && analysis.relatedPages.length > 0) {
              const matchedPage = analysis.relatedPages[0];
              analysis.decision = 'update';
              analysis.targetPageId = matchedPage.id;
              analysis.targetPageName = matchedPage.name;
              analysis.targetBookId = matchedPage.book_id;
              
              params.setSources((prev: Source[]) => prev.map(s => {
                if (s.selected === false) return s;
                return {
                   ...s,
                   isDuplicate: true,
                   duplicateReference: matchedPage.name || 'Существующая статья'
                };
              }));

              setRagConfirmation({
                pageName: matchedPage.name,
                pageId: matchedPage.id,
                bookId: matchedPage.book_id || selectedBookId,
                allSourcesText,
                allAttachments,
                analysis
              });
              executionControl.setIsSyncing(false);
              executionControl.setSyncStatus({ type: 'idle', message: 'Точного дубликата не найдено, предлагается обновить похожую статью.' });
              return;
            } else {
              currentTargetMode = 'create';
              executionControl.setSyncStatus({ type: 'idle', message: 'Статьи для обновления не найдены в BookStack. Переключение в режим создания.' });
            }
          }

          if (currentTargetMode === 'create') {
            detectedBookId = analysis.targetBookId;
            
            // If we found context but no duplicate, mark sources as having context
            if (analysis.retrievedContext && analysis.retrievedContext.length > 0) {
              params.setSources((prev: Source[]) => prev.map(s => {
                if (s.selected === false) return s;
                return {
                   ...s,
                   isContext: true
                };
              }));
            }

            executionControl.setSyncProgress({ step: 2, total: 4, label: 'Генерация новой статьи' });
            executionControl.setSyncStatus({ type: 'success', message: 'Существующих дублей нет (найдено ' + (analysis.retrievedContext?.length || 0) + ' контекстных статей). Начинаем написание статьи...' });
          }
        }
      }

      await processGeneration(allSourcesText, allAttachments, currentTargetMode, detectedPageId, detectedBookId, forceReview, ragMsg, analysis?.relatedPages);
    } catch (e: any) {
      console.error(e);
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Произошла ошибка при генерации.' });
      executionControl.setIsSyncing(false);
    }
  };

  const confirmAndPublish = async () => {
    if (!params.lastResponse) return;
    params.setPendingApproval(false);
    await executePublishing(params.lastResponse);
  };

  const handleRefinement = async (userInput: string) => {
    const { 
      chatHistory, setChatHistory, sources, content, targetMode, books, chapters, geminiModel,
      selectedPageId, selectedBookId, instructions, setLastResponse, executionControl
    } = params;

    if (!userInput.trim()) return;
    
    setChatHistory((prev: any) => [...prev, { role: 'user', content: userInput }]);
    executionControl.startTask({ step: 2, total: 3, label: 'Уточнение статьи по вашему запросу' });

    try {
      await executionControl.checkPauseAndAbort();
      const selectedSources = sources.filter(s => s.selected !== false);
      const allSourcesText = selectedSources.map(s => `ИСТОЧНИК: ${s.name}\n${s.content}`).join('\n\n') + (content ? `\n\nТЕКСТ:\n${content}` : '');
      const allAttachments = selectedSources.flatMap(s => s.attachments || []);
      
      const refined = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        [...chatHistory, { role: 'user', content: userInput }],
        geminiModel,
        undefined,
        { 
          signal: executionControl.abortControllerRef.current?.signal, 
          checkPause: executionControl.checkPauseAndAbort,
          onProgress: (msg) => executionControl.setSyncStatus({ type: 'idle', message: msg }),
          systemInstruction: params.systemInstruction,
          dataStructure: params.dataStructure
        },
        allAttachments
      );

      if (refined.modelUsed && refined.modelUsed !== geminiModel) {
        refined.thinking = `[ВНИМАНИЕ: Авто-переключение на ${refined.modelUsed} из-за квот]\n\n` + refined.thinking;
      }
      
      refined.targetPublishMode = targetMode;
      refined.targetPublishPageId = selectedPageId;
      refined.targetPublishBookId = selectedBookId;
      
      setLastResponse(refined);
      setChatHistory((prev: any) => [...prev, { role: 'model', content: refined.thinking }]);
      executionControl.setSyncStatus({ type: 'success', message: 'Статья обновлена с учетом ваших правок.' });
    } catch (e: any) {
      executionControl.setSyncStatus({ type: 'error', message: 'Не удалось уточнить статью: ' + e.message });
    } finally {
      executionControl.setIsSyncing(false);
    }
  };

  const handleGenerateMindmap = async () => {
    const { sources, content, geminiModel, setMindmapData, executionControl } = params;

    if (sources.length === 0 && !content.trim()) {
      executionControl.setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }
    
    executionControl.startTask({ step: 1, total: 1, label: 'Генерация Mindmap...' });
    
    try {
      const allSourcesText = sources.filter(s => s.selected !== false).map(s => `--- ${s.name} ---\n${s.content}\n\n`).join('');
      const combinedContent = `${allSourcesText}\n\n${content}`;
      
      const md = await generateMindmap(combinedContent, geminiModel, {
        signal: executionControl.abortControllerRef.current?.signal,
        checkPause: executionControl.checkPauseAndAbort
      });
      
      setMindmapData({ md });
      executionControl.setSyncStatus({ type: 'success', message: 'Mindmap готов!' });
    } catch (e: any) {
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Ошибка генерации Mindmap.' });
    } finally {
      executionControl.setIsSyncing(false);
    }
  };

  const handleGenerateFAQ = async () => {
    const { sources, content, geminiModel, executionControl } = params;

    if (sources.length === 0 && !content.trim()) {
      executionControl.setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }
    
    executionControl.startTask({ step: 1, total: 1, label: 'Генерация FAQ...' });
    
    try {
      const allSourcesText = sources.filter(s => s.selected !== false).map(s => `--- ${s.name} ---\n${s.content}\n\n`).join('');
      const combinedContent = `${allSourcesText}\n\n${content}`;
      
      const faqText = await generateFAQ(combinedContent, geminiModel, {
        signal: executionControl.abortControllerRef.current?.signal,
        checkPause: executionControl.checkPauseAndAbort
      });
      
      await handleSync(faqText);
      executionControl.setSyncStatus({ type: 'success', message: 'FAQ готов к проверке!' });
    } catch (e: any) {
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Ошибка генерации FAQ.' });
    } finally {
      executionControl.setIsSyncing(false);
    }
  };

  const handleRagChoice = async (shouldUpdate: boolean, ragConfirmation: any) => {
    const { setRagConfirmation, setTargetMode, setSelectedBookId, setSelectedPageId, executionControl } = params;
    
    if (!ragConfirmation) return;
    
    executionControl.startTask({ step: 2, total: 4, label: 'Принятие решения RAG' });
    setRagConfirmation(null);

    try {
      const { allSourcesText, allAttachments, pageId, bookId, pageName } = ragConfirmation;
      
      let currentTargetMode = 'create';
      let detectedPageId: number | null = null;
      let detectedBookId: number | null = null;
      let forceReview = false;
      let ragMsg = '';

      if (shouldUpdate) {
        currentTargetMode = 'update';
        setTargetMode('update');
        if (bookId) setSelectedBookId(bookId);
        setSelectedPageId(pageId);
        detectedPageId = pageId;
        detectedBookId = bookId || null;
        forceReview = true;
        ragMsg = `Агентский RAG нашел релевантную статью: "${pageName}". Пользователь подтвердил ОБНОВЛЕНИЕ.\n\n`;
        executionControl.setSyncStatus({ type: 'idle', message: `Выбрана стратегия: Обновление статьи "${pageName}"` });
      } else {
        ragMsg = `Агентский RAG нашел релевантную статью: "${pageName}", но пользователь выбрал СОЗДАНИЕ новой статьи.\n\n`;
        executionControl.setSyncStatus({ type: 'idle', message: `Выбрана стратегия: Создание новой статьи` });
      }

      await processGeneration(allSourcesText, allAttachments || [], currentTargetMode, detectedPageId, detectedBookId, forceReview, ragMsg, ragConfirmation.analysis?.relatedPages);
    } catch (e: any) {
      console.error(e);
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Произошла ошибка при генерации.' });
      executionControl.setIsSyncing(false);
    }
  };

  const handleGenerateMermaid = async () => {
    const { sources, content, geminiModel, executionControl, setMermaidData } = params;

    if (sources.length === 0 && !content.trim()) {
      executionControl.setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }
    
    executionControl.startTask({ step: 1, total: 1, label: 'Генерация диаграммы Mermaid...' });
    
    try {
      const allSourcesText = sources.filter(s => s.selected !== false).map(s => `--- ${s.name} ---\n${s.content}\n\n`).join('');
      const combinedContent = `${allSourcesText}\n\n${content}`;
      
      const rawCode = await generateMermaid(combinedContent, geminiModel, {
        signal: executionControl.abortControllerRef.current?.signal,
        checkPause: executionControl.checkPauseAndAbort
      });

      let cleanedCode = rawCode;
      const match = rawCode.match(/```mermaid([\s\S]*?)```/);
      if (match && match[1]) {
        cleanedCode = match[1].trim();
      } else {
        cleanedCode = rawCode.replace(/```mermaid/g, '').replace(/```/g, '').trim();
      }
      
      if (setMermaidData) {
        setMermaidData({ code: cleanedCode });
      }
      executionControl.setSyncStatus({ type: 'success', message: 'Диаграмма Mermaid готова!' });
    } catch (e: any) {
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Ошибка генерации диаграммы.' });
    } finally {
      executionControl.setIsSyncing(false);
    }
  };

  return {
    handleSync,
    confirmAndPublish,
    handleRefinement,
    handleGenerateMindmap,
    handleGenerateFAQ,
    handleGenerateMermaid,
    handleRagChoice
  };
}
