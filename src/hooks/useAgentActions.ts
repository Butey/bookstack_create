import { MutableRefObject } from 'react';
import { BookStackCredentials, ProcessedArticle, BookStackBook, BookStackChapter, BookStackPage } from '../types';
import { GeminiModelId, generateArticleFromSources } from '../services/gemini';
import { createBook, fetchBooks, createChapter, createPage, updatePage } from '../services/api';

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
  sources: { name: string; content: string; selected?: boolean }[],
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
  setPendingApproval: any,
  setIsConsoleOpen: any,
  setRagConfirmation: any,
  setMindmapData: any,
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
  setSelectedPageId: any
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

      if (publishMode === 'create') {
        const createRes = await createPage(
          credentials,
          activeBookId!,
          activeChapterId,
          processed.title,
          processed.markdown,
          finalTags
        );
        pageUrl = createRes?.url || '';
      } else if (publishPageId) {
        const updateRes = await updatePage(
          credentials,
          publishPageId,
          processed.title,
          processed.markdown,
          finalTags
        );
        pageUrl = updateRes?.url || '';
      }

      executionControl.setSyncStatus({ 
        type: 'success', 
        message: publishMode === 'create' ? `Успех! "${processed.title}" добавлена в BookStack.` : `Успех! Статья обновлена.`,
        url: pageUrl
      });
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
    currentTargetMode: string, 
    detectedPageId: number | null,
    detectedBookId: number | null,
    forceReview: boolean, 
    ragMsg: string
  ) => {
    const { 
      credentials, books, chapters, selectedPageId, selectedBookId, instructions, geminiModel,
      workMode, setLastResponse, setPendingApproval, setIsConsoleOpen, executionControl
    } = params;

    let existingContent: string | undefined;
    if (currentTargetMode === 'update') {
      const pageIdToFetch = detectedPageId || selectedPageId;
      if (pageIdToFetch) {
        const { fetchPage } = await import('../services/api');
        try {
          const pageData = await fetchPage(credentials, pageIdToFetch);
          existingContent = pageData.markdown || pageData.html || pageData.raw_html || '';
        } catch (e) {
          console.error("Could not fetch existing page content", e);
        }
      }
    }

    await executionControl.checkPauseAndAbort();
    executionControl.setSyncProgress({ step: 2, total: 4, label: 'AI Анализ и синтез статьи' });
    
    const processed = await generateArticleFromSources(
      allSourcesText, 
      instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
      currentTargetMode as 'create' | 'update',
      { books, chapters },
      [],
      geminiModel,
      existingContent,
      { 
        signal: executionControl.abortControllerRef.current?.signal, 
        checkPause: executionControl.checkPauseAndAbort,
        onProgress: (msg) => executionControl.setSyncStatus({ type: 'idle', message: msg }) 
      }
    );
    
    processed.targetPublishMode = currentTargetMode as 'create' | 'update';
    processed.targetPublishPageId = detectedPageId || selectedPageId;
    processed.targetPublishBookId = detectedBookId || selectedBookId;
    
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

    if (targetMode === 'update' && !selectedPageId) {
      executionControl.setSyncStatus({ type: 'error', message: 'Выберите существующую статью для обновления.' });
      return;
    }
    if (sources.length === 0 && !content.trim()) {
      executionControl.setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }

    executionControl.startTask({ step: 1, total: 3, label: 'Подготовка данных и структуры' });
    setChatHistory([]); 

    try {
      await executionControl.checkPauseAndAbort();
      const selectedSources = sources.filter(s => s.selected !== false);
      if (selectedSources.length === 0 && !content.trim()) {
        throw new Error('Нет выбранных источников или текста для обработки.');
      }

      const allSourcesText = selectedSources.map(s => `SOURCE: ${s.name}\n${s.content}`).join('\n\n') + (content ? `\n\nTEXT:\n${content}` : '');
      
      let currentTargetMode = targetMode;
      let forceReview = false;
      let ragMsg = '';
      let detectedPageId: number | null = null;

      if (targetMode === 'create') {
        executionControl.setSyncProgress({ step: 1, total: 4, label: 'Запуск Agentic RAG...' });
        const { agenticRagWorkflow } = await import('../services/agent');
        
        const analysis = await agenticRagWorkflow(
          allSourcesText, 
          instructions, 
          credentials, 
          geminiModel, 
          (msg) => executionControl.setSyncStatus({ type: 'idle', message: msg }),
          { signal: executionControl.abortControllerRef.current?.signal, checkPause: executionControl.checkPauseAndAbort }
        );
        
        if (analysis.decision === 'update' && analysis.targetPageId) {
          setRagConfirmation({
            pageName: analysis.targetPageName,
            pageId: analysis.targetPageId,
            bookId: analysis.targetBookId,
            allSourcesText,
            analysis
          });
          executionControl.setIsSyncing(false);
          executionControl.setSyncStatus({ type: 'idle', message: 'Ожидается решение: создание или обновление' });
          return;
        }
      }

      await processGeneration(allSourcesText, currentTargetMode, detectedPageId, null, forceReview, ragMsg);
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
          onProgress: (msg) => executionControl.setSyncStatus({ type: 'idle', message: msg })
        }
      );
      
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
      
      const { generateMindmap } = await import('../services/gemini');
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
      
      const { generateFAQ } = await import('../services/gemini');
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
      const { allSourcesText, pageId, bookId, pageName } = ragConfirmation;
      
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

      await processGeneration(allSourcesText, currentTargetMode, detectedPageId, detectedBookId, forceReview, ragMsg);
    } catch (e: any) {
      console.error(e);
      executionControl.setSyncStatus({ type: 'error', message: e.message || 'Произошла ошибка при генерации.' });
      executionControl.setIsSyncing(false);
    }
  };

  return {
    handleSync,
    confirmAndPublish,
    handleRefinement,
    handleGenerateMindmap,
    handleGenerateFAQ,
    handleRagChoice
  };
}
