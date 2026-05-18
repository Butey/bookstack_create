/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent, DragEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Book, 
  Settings, 
  Send, 
  CheckCircle, 
  Loader2, 
  BookOpen, 
  Layout, 
  ChevronRight,
  AlertCircle,
  ExternalLink,
  ClipboardList,
  Eye,
  FileText,
  X,
  Terminal,
  Brain,
  History,
  MessageSquare,
  Info
} from 'lucide-react';
import { BookStackCredentials, BookStackBook, BookStackChapter, BookStackPage } from './types';
import { fetchBooks, fetchChaptersAndPages, fetchChapterPages, createPage, updatePage, createBook, createChapter } from './services/api';
import { generateArticleFromSources, extractTextFromFile } from './services/gemini';
import Markdown from 'react-markdown';

export default function App() {
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [sources, setSources] = useState<{ name: string; content: string; selected?: boolean }[]>([]);
  const [workMode, setWorkMode] = useState<'auto' | 'review'>('auto');
  const [syncProgress, setSyncProgress] = useState<{ step: number; total: number; label: string }>({ step: 0, total: 3, label: '' });
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [userInput, setUserInput] = useState('');

  const [credentials, setCredentials] = useState<BookStackCredentials>({ baseUrl: '', tokenId: '', tokenSecret: '' });
  const [serverConfig, setServerConfig] = useState<{ hasEnvCredentials: boolean; envBaseUrl: string } | null>(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(data => {
      setServerConfig(data);
      if (data.hasEnvCredentials) {
        setCredentials(prev => ({
          ...prev,
          baseUrl: data.envBaseUrl || prev.baseUrl,
          tokenId: 'SERVER_MANAGED',
          tokenSecret: 'SERVER_MANAGED'
        }));
      } else {
        setCredentials(prev => {
          if (prev.tokenId === 'SERVER_MANAGED' || prev.tokenSecret === 'SERVER_MANAGED') {
            return { ...prev, tokenId: '', tokenSecret: '' };
          }
          return prev;
        });
      }
    }).catch(console.error);
  }, []);

  const [books, setBooks] = useState<BookStackBook[]>([]);
  const [chapters, setChapters] = useState<BookStackChapter[]>([]);
  const [pages, setPages] = useState<BookStackPage[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  const [targetMode, setTargetMode] = useState<'create' | 'update'>('create');
  const [customTags, setCustomTags] = useState<string>('NotebookLM, Gemini-Refinement');
  
  const [content, setContent] = useState('');
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string, url?: string }>({ type: 'idle', message: '' });
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number, label: string } | null>(null);
  const [previewSource, setPreviewSource] = useState<{ name: string; content: string } | null>(null);

  const [instructions, setInstructions] = useState('');
  const [dataStructure, setDataStructure] = useState('1. Краткий обзор (Summary)\n2. Контекст (Context)\n3. Детальное описание (Detailed Analysis)\n4. Выводы (Conclusion)');
  const [systemInstruction, setSystemInstruction] = useState('Вы — эксперт по техническому письму. Синтезируйте предоставленные источники в понятную и профессиональную статью для базы знаний Wiki.');

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.bookstack_sources) setSources(data.bookstack_sources);
      if (data.agent_work_mode) setWorkMode(data.agent_work_mode);
      if (data.agent_data_structure) setDataStructure(data.agent_data_structure);
      if (data.agent_system_instruction) setSystemInstruction(data.agent_system_instruction);
      if (data.bookstack_creds) {
        // Only set creds if they are not already managed by env, or ensure serverConfig override runs
        setCredentials(data.bookstack_creds);
      }
      setIsSettingsLoaded(true);
    }).catch(err => {
      console.error(err);
      setIsSettingsLoaded(true); // Proceed even on error
    });
  }, []);

  useEffect(() => {
    if (!isSettingsLoaded) return;
    
    const timer = setTimeout(() => {
      const credsToSave = (credentials.tokenId === 'SERVER_MANAGED' || credentials.tokenSecret === 'SERVER_MANAGED') 
        ? { baseUrl: credentials.baseUrl, tokenId: '', tokenSecret: '' } 
        : credentials;

      fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookstack_sources: sources,
          agent_work_mode: workMode,
          agent_data_structure: dataStructure,
          agent_system_instruction: systemInstruction,
          bookstack_creds: credsToSave
        })
      }).catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [sources, workMode, dataStructure, systemInstruction, credentials, isSettingsLoaded]);

  const [isDragging, setIsDragging] = useState(false);

  const totalChars = sources.reduce((acc, s) => s.selected !== false ? acc + (s.content?.length || 0) : acc, 0);

  const toggleSourceSelection = (index: number) => {
    setSources(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const selectAllSources = (selected: boolean) => {
    setSources(prev => prev.map(s => ({ ...s, selected })));
  };

  useEffect(() => {
    if (serverConfig !== null && credentials.baseUrl && credentials.tokenId) {
      // Don't auto-load if we are in the middle of clearing SERVER_MANAGED
      if (!serverConfig.hasEnvCredentials && (credentials.tokenId === 'SERVER_MANAGED' || credentials.tokenSecret === 'SERVER_MANAGED')) {
        return;
      }
      loadBooks();
    }
  }, [serverConfig]); // Run auto-load only after config is resolved

  useEffect(() => {
    const syncData = async () => {
      if (!selectedBookId) {
        setChapters([]);
        setPages([]);
        setSelectedChapterId(null);
        setSelectedPageId(null);
        return;
      }

      if (selectedChapterId) {
        await loadChapterPages(selectedChapterId);
      } else {
        await loadChaptersAndPages(selectedBookId);
      }
    };
    
    syncData();
  }, [selectedBookId, selectedChapterId]);

  const loadBooks = async () => {
    if (!credentials.baseUrl || !credentials.tokenId) return;
    setIsLoadingBooks(true);
    setSyncStatus({ type: 'idle', message: 'Обновление списка книг...' });
    try {
      const data = await fetchBooks(credentials);
      setBooks(data);
      setSyncStatus({ type: 'idle', message: '' });
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.response?.data?.error || 'Ошибка подключения. Проверьте URL и учетные данные.';
      setSyncStatus({ type: 'error', message: errorMsg });
    } finally {
      setIsLoadingBooks(false);
    }
  };

  const loadChaptersAndPages = async (bookId: number) => {
    setIsLoadingChapters(true);
    setIsLoadingPages(true);
    try {
      const { chapters, pages } = await fetchChaptersAndPages(credentials, bookId);
      setChapters(chapters);
      setPages(pages);
    } catch (e: any) {
      setSyncStatus({ type: 'error', message: 'Не удалось загрузить главы и страницы для этой книги.' });
    } finally {
      setIsLoadingChapters(false);
      setIsLoadingPages(false);
    }
  };

  const loadChapterPages = async (chapterId: number) => {
    setIsLoadingPages(true);
    try {
      const data = await fetchChapterPages(credentials, chapterId);
      setPages(data);
    } catch (e: any) {
      setSyncStatus({ type: 'error', message: 'Не удалось загрузить страницы главы.' });
    } finally {
      setIsLoadingPages(false);
    }
  };
  
  // mode update is now handled by the generic layout sync hook

  const confirmAndPublish = async () => {
    if (!lastResponse) return;
    setPendingApproval(false);
    await executePublishing(lastResponse);
  };

  const handleRefinement = async () => {
    if (!userInput.trim()) return;
    
    const newUserMessage = userInput;
    setUserInput('');
    setChatHistory(prev => [...prev, { role: 'user', content: newUserMessage }]);
    setIsSyncing(true);
    setSyncProgress({ step: 2, total: 3, label: 'Уточнение статьи по вашему запросу' });

    try {
      const selectedSources = sources.filter(s => s.selected !== false);
      const allSourcesText = selectedSources.map(s => `ИСТОЧНИК: ${s.name}\n${s.content}`).join('\n\n') + (content ? `\n\nТЕКСТ:\n${content}` : '');
      
      const refined = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        [...chatHistory, { role: 'user', content: newUserMessage }]
      );
      
      setLastResponse(refined);
      setChatHistory(prev => [...prev, { role: 'model', content: refined.thinking }]);
      setSyncStatus({ type: 'idle', message: 'Статья обновлена с учетом ваших правок.' });
    } catch (e: any) {
      setSyncStatus({ type: 'error', message: 'Не удалось уточнить статью: ' + e.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSync = async () => {
    if (targetMode === 'update' && !selectedPageId) {
      setSyncStatus({ type: 'error', message: 'Выберите существующую статью для обновления.' });
      return;
    }
    if (sources.length === 0 && !content.trim()) {
      setSyncStatus({ type: 'error', message: 'Предоставьте хотя бы один источник или текст.' });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ type: 'idle', message: 'Агент анализирует контекст...' });
    setSyncProgress({ step: 1, total: 3, label: 'Подготовка данных и структуры' });
    setChatHistory([]); // Clear previous dialogue

    try {
      const selectedSources = sources.filter(s => s.selected !== false);
      if (selectedSources.length === 0 && !content.trim()) {
        throw new Error('Нет выбранных источников или текста для обработки.');
      }

      const allSourcesText = selectedSources.map(s => `SOURCE: ${s.name}\n${s.content}`).join('\n\n') + (content ? `\n\nTEXT:\n${content}` : '');
      
      // 1. Process with Agent
      setSyncProgress({ step: 2, total: 3, label: 'AI Анализ и синтез статьи' });
      const processed = await generateArticleFromSources(
        allSourcesText, 
        instructions || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode as 'create' | 'update',
        { books, chapters },
        []
      );
      
      console.log("Agent RAW Response:", processed);
      setLastResponse(processed);

      if (workMode === 'review') {
        setPendingApproval(true);
        setIsSyncing(false);
        setIsConsoleOpen(true); // Open console automatically in review mode
        setSyncStatus({ type: 'idle', message: 'Ожидание подтверждения публикации...' });
        return;
      }

      await executePublishing(processed);
    } catch (e: any) {
      console.error(e);
      setSyncStatus({ type: 'error', message: e.message || 'Произошла ошибка при генерации.' });
      setIsSyncing(false);
    }
  };

  const executePublishing = async (processed: any) => {
    setIsSyncing(true);
    try {
      // 2. Prepare publishing
      setSyncProgress({ step: 3, total: 3, label: 'Публикация в Wiki' });
      // Use agent hints if in create mode
      let activeBookId = selectedBookId;
      let activeChapterId = selectedChapterId;

      if (targetMode === 'create') {
        // If agent suggested a NEW book
        if (!processed.targetBookId && processed.newBookName) {
          setSyncStatus({ type: 'idle', message: `Создание новой книги: ${processed.newBookName}...` });
          const newBook = await createBook(credentials, processed.newBookName, 'Автоматически создано Агентом');
          activeBookId = newBook.id;
          // Refresh books list
          const updatedBooks = await fetchBooks(credentials);
          setBooks(updatedBooks);
        } else if (processed.targetBookId) {
          activeBookId = Number(processed.targetBookId);
        }

        // If agent suggested a NEW chapter within the book
        if (activeBookId && !processed.targetChapterId && processed.newChapterName) {
          setSyncStatus({ type: 'idle', message: `Создание новой главы: ${processed.newChapterName}...` });
          const newChapter = await createChapter(credentials, activeBookId, processed.newChapterName, 'Автоматически создано Агентом');
          activeChapterId = newChapter.id;
          // Note: we don't necessarily need to refresh the whole chapters list here as we have the ID
        } else if (processed.targetChapterId) {
          activeChapterId = Number(processed.targetChapterId);
        }
      }

      if (!activeBookId && targetMode === 'create') {
        if (books.length === 0) {
          throw new Error('Список книг пуст. Пожалуйста, проверьте настройки подключения к Wiki.');
        }
        throw new Error('Агент не смог автоматически определить или создать целевую книгу. Пожалуйста, выберите её вручную в настройках ниже или уточните инструкции.');
      }

      setSyncStatus({ type: 'idle', message: targetMode === 'create' ? `Создание "${processed.title}" в книге ID:${activeBookId}...` : `Обновление статьи...` });

      // Combine extracted tags with custom user tags
      const userTagsList = customTags.split(',').map(t => t.trim()).filter(Boolean);
      const combinedTags = Array.from(new Set([...(processed.tags || []), ...userTagsList]));
      const finalTags = combinedTags.slice(0, 10);

      let pageUrl = '';

      // 2. Upload to BookStack
      if (targetMode === 'create') {
        const createRes = await createPage(
          credentials,
          activeBookId!,
          activeChapterId,
          processed.title,
          processed.markdown,
          finalTags
        );
        pageUrl = createRes?.url || '';
      } else if (selectedPageId) {
        const updateRes = await updatePage(
          credentials,
          selectedPageId,
          processed.title,
          processed.markdown,
          finalTags
        );
        pageUrl = updateRes?.url || '';
      }

      setSyncStatus({ 
        type: 'success', 
        message: targetMode === 'create' ? `Успех! "${processed.title}" добавлена в BookStack.` : `Успех! Статья обновлена.`,
        url: pageUrl
      });
      setContent('');
      setSources([]);
      
      // Refresh pages list
      if (selectedChapterId) loadChapterPages(selectedChapterId);
      else if (selectedBookId) loadChaptersAndPages(selectedBookId);
      
    } catch (e: any) {
      console.error(e);
      setSyncStatus({ type: 'error', message: e.message || 'Рабочий процесс прерван.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const processFile = async (file: File) => {
    setSyncStatus({ type: 'idle', message: `Чтение ${file.name}...` });
    setUploadProgress({ percent: 50, label: `Обработка ${file.name}...` });
    
    try {
      const base64Str = await getBase64(file);
      
      setUploadProgress({ percent: 100, label: `Агент извлекает текст...` });
      setSyncStatus({ type: 'idle', message: `Агент извлекает текст из ${file.name}...` });
      
      const extractedText = await extractTextFromFile(base64Str, file.type || 'text/plain');
      setSources(prev => [...prev, { name: file.name, content: extractedText }]);
      
      setSyncStatus({ type: 'success', message: `Источник "${file.name}" добавлен.` });
    } catch (e: any) {
      console.error(e);
      setSyncStatus({ type: 'error', message: `Ошибка при обработке ${file.name}: ${e.message}` });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    files.forEach(file => processFile(file));
  };

  const handleSpecialFileUpload = async (e: ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncStatus({ type: 'idle', message: `Извлечение ${file.name}...` });
    setUploadProgress({ percent: 50, label: `Обработка конфига...` });
    
    try {
      const base64Str = await getBase64(file);
      
      setUploadProgress({ percent: 100, label: `Агент читает файл...` });
      const text = await extractTextFromFile(base64Str, file.type || 'text/plain');

      if (target === 'system') {
        setSystemInstruction(text);
      } else {
        setDataStructure(text);
      }
      
      setSyncStatus({ type: 'success', message: 'Текст успешно импортирован.' });
    } catch (e: any) {
      console.error(e);
      setSyncStatus({ type: 'error', message: `Ошибка импорта: ${e.message}` });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    files.forEach(file => processFile(file));
  };

  return (
    <div className="min-h-screen bg-editorial-bg text-editorial-text font-sans selection:bg-editorial-text selection:text-white pb-12">
      {/* Navigation */}
      <nav className="border-b-2 border-editorial-text sticky top-0 z-10 bg-editorial-bg/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-10 h-20 flex items-baseline justify-between">
          <div className="flex items-baseline gap-4 pt-6">
            <h1 className="font-serif text-4xl font-bold tracking-tight">Bridge.LM</h1>
            <span className="accent-pill">NotebookLM ↔ BookStack</span>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold">
              <span className={`w-2 h-2 rounded-full ${credentials.baseUrl ? 'bg-green-500' : 'bg-red-500'}`}></span>
              {credentials.baseUrl ? 'Соединение активно' : 'Ожидание подключения'}
            </div>
            <button 
              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
              className={`flex items-center gap-2 px-6 py-2 border-2 border-editorial-text text-[10px] uppercase tracking-widest font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all ${isConsoleOpen ? 'bg-editorial-text text-white' : 'bg-white text-editorial-text'}`}
            >
              <Terminal size={14} />
              Логи Агента
            </button>
            <button 
              onClick={() => setIsConfigOpen(!isConfigOpen)}
              className="flex items-center gap-2 px-6 py-2 bg-white border-2 border-editorial-text text-[10px] uppercase tracking-widest font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
            >
              <Settings size={14} className={isConfigOpen ? 'rotate-90' : ''} />
              Настройки
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Form */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            <AnimatePresence>
              {isConfigOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-8 bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex flex-col gap-6">
                    <h2 className="font-serif text-2xl italic tracking-tight">Настройки Агента и Книги</h2>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Системная инструкция агента</label>
                          <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                            <FileText size={10} />
                            Загрузить .md
                            <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleSpecialFileUpload(e, 'system')} />
                          </label>
                        </div>
                        <textarea 
                          className="w-full h-24 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                          placeholder="Опишите поведение и личность агента..."
                          value={systemInstruction}
                          onChange={(e) => {
                            setSystemInstruction(e.target.value);
                          }}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Правила структуры данных</label>
                          <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                            <FileText size={10} />
                            Загрузить .md
                            <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleSpecialFileUpload(e, 'structure')} />
                          </label>
                        </div>
                        <textarea 
                          className="w-full h-32 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                          placeholder="Укажите, как должна быть структурирована статья..."
                          value={dataStructure}
                          onChange={(e) => {
                            setDataStructure(e.target.value);
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] mb-3 block">Режим работы</label>
                        <div className="grid grid-cols-2 gap-4">
                          <button
                            onClick={() => setWorkMode('auto')}
                            className={`p-3 border-2 flex items-center justify-center gap-2 transition-all ${workMode === 'auto' ? 'border-editorial-text bg-editorial-accent/10 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 opacity-60'}`}
                          >
                            <Terminal size={14} />
                            <span className="text-[10px] font-bold uppercase">Автономный</span>
                          </button>
                          <button
                            onClick={() => setWorkMode('review')}
                            className={`p-3 border-2 flex items-center justify-center gap-2 transition-all ${workMode === 'review' ? 'border-editorial-text bg-editorial-accent/10 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 opacity-60'}`}
                          >
                            <ClipboardList size={14} />
                            <span className="text-[10px] font-bold uppercase">С подтверждением</span>
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">URL Инстанса</label>
                        <input 
                          type="text" 
                          placeholder="https://wiki.example.com"
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm disabled:opacity-50"
                          value={credentials.baseUrl}
                          onChange={(e) => setCredentials({ ...credentials, baseUrl: e.target.value })}
                          disabled={serverConfig?.hasEnvCredentials}
                        />
                        {serverConfig?.hasEnvCredentials && (
                          <div className="text-[10px] text-green-600 font-bold uppercase tracking-widest mt-1">
                            Подключение настроено на сервере
                          </div>
                        )}
                      </div>
                      
                      {!serverConfig?.hasEnvCredentials && (
                        <>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">ID Токена</label>
                            <input 
                              type="text" 
                              placeholder="abc..."
                              className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm font-mono"
                              value={credentials.tokenId}
                              onChange={(e) => setCredentials({ ...credentials, tokenId: e.target.value })}
                            />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Секрет Токена</label>
                            <input 
                              type="password" 
                              placeholder="••••••••"
                              className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm font-mono"
                              value={credentials.tokenSecret}
                              onChange={(e) => setCredentials({ ...credentials, tokenSecret: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <button 
                      onClick={loadBooks}
                      className="w-full py-4 bg-editorial-text text-white text-xs uppercase tracking-widest font-bold hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
                    >
                      {isLoadingBooks ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                      Проверить и Сохранить
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <h2 className="font-serif text-3xl italic tracking-tight">Рабочее пространство</h2>
                    <p className="text-sm text-gray-500 max-w-lg">Синтез знаний. Перетащите PDF, HTML или текстовые источники ниже.</p>
                  </div>
                  <label className="flex items-center gap-2 px-4 py-2 border-2 border-editorial-text cursor-pointer hover:bg-[#1A1A1A] hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest">
                    <ExternalLink size={12} />
                    Добавить источник
                    <input type="file" className="hidden" accept=".txt,.md,.pdf,.html" onChange={handleFileUpload} multiple />
                  </label>
                </div>

                <div 
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed transition-all p-4 ${
                    isDragging ? 'border-editorial-text bg-editorial-accent/20' : 'border-gray-200'
                  }`}
                >
                  <AnimatePresence>
                    {uploadProgress && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 space-y-2"
                      >
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-editorial-text">
                          <span>{uploadProgress.label}</span>
                          <span>{uploadProgress.percent}%</span>
                        </div>
                        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-editorial-text"
                            initial={{ width: 0 }}
                            animate={{ width: `${uploadProgress.percent}%` }}
                            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {sources.length > 0 ? (
                    <div className="w-full space-y-4">
                      <div className="flex items-center justify-between border-b border-editorial-text/10 pb-2">
                        <div className="flex items-center gap-4">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-text">
                            Источники ({sources.filter(s => s.selected !== false).length}/{sources.length})
                          </span>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => selectAllSources(true)}
                              className="text-[8px] font-bold uppercase tracking-tight text-editorial-text/60 hover:text-editorial-text"
                            >
                              Выбрать все
                            </button>
                            <button 
                              onClick={() => selectAllSources(false)}
                              className="text-[8px] font-bold uppercase tracking-tight text-editorial-text/60 hover:text-editorial-text"
                            >
                              Снять все
                            </button>
                          </div>
                        </div>
                        <span className="text-[8px] font-mono text-gray-400">
                          ~{(totalChars / 4).toFixed(0)} токенов
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        {sources.map((s, i) => (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={i} 
                            className={`px-3 py-2 border flex items-center justify-between group transition-colors ${s.selected !== false ? 'bg-white border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)]' : 'bg-gray-50 border-gray-200 opacity-60'}`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                              <div className="relative flex items-center">
                                <input 
                                  type="checkbox" 
                                  checked={s.selected !== false}
                                  onChange={() => toggleSourceSelection(i)}
                                  className="w-4 h-4 rounded-none border-editorial-text text-editorial-text focus:ring-0 cursor-pointer appearance-none border-2 checked:bg-editorial-text transition-all"
                                />
                                {s.selected !== false && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white text-[10px] font-bold">✓</div>}
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-widest truncate leading-none">
                                    {s.name}
                                  </span>
                                  {s.selected !== false && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Источник активен" />
                                  )}
                                </div>
                                <span className="text-[8px] font-mono text-gray-400 leading-none mt-1">
                                  {(s.content?.length || 0).toLocaleString()} симв.
                                </span>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0 ml-4">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewSource(s);
                                }}
                                className="p-1.5 hover:bg-editorial-accent/20 rounded transition-colors text-gray-400 hover:text-editorial-text"
                                title="Просмотр"
                              >
                                <Eye size={12} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSources(sources.filter((_, idx) => idx !== i));
                                }}
                                className="p-1.5 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-500"
                                title="Удалить"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {sources.length > 1 && (
                        <button 
                          onClick={() => setSources([])}
                          className="w-full py-2 border border-dashed border-red-200 text-[9px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-50 transition-colors"
                        >
                          Очистить список
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-300 text-center py-2">
                      {isDragging ? 'Отпустите файл для загрузки' : 'Нет загруженных источников'}
                    </p>
                  )}
                </div>
              </div>

<div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Цель текущей задачи</label>
                <textarea 
                  className="w-full h-32 p-4 bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] focus:ring-0 outline-none text-sm italic"
                  placeholder="Например: 'Составь подробное резюме этих заметок, уделив внимание хронологии событий...'"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="relative">
                <textarea 
                  className="w-full h-[300px] p-8 bg-white border-2 border-editorial-text shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] focus:ring-0 focus:outline-none transition-all resize-none text-sm leading-relaxed"
                  placeholder="Вставьте дополнительный текст здесь..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isSyncing}
                />
                <div className="absolute top-0 right-0 p-4 opacity-50 pointer-events-none">
                  <ClipboardList size={24} />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Settings and Sync */}
          <div className="lg:col-span-4 flex flex-col gap-10">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="font-serif text-2xl italic tracking-tight">Конфигурация синхронизации</h2>
                <p className="text-xs text-gray-500 leading-relaxed">Сопоставьте данные с вашей структурой BookStack.</p>
              </div>
              
              <div className="bg-white p-8 border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] space-y-8">
                <div className="space-y-4">
                  <div className="flex gap-2 p-1 bg-gray-100 rounded">
                    <button 
                      onClick={() => setTargetMode('create')}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${targetMode === 'create' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
                    >
                      Создать новую
                    </button>
                    <button 
                      onClick={() => setTargetMode('update')}
                      className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${targetMode === 'update' ? 'bg-white shadow-sm' : 'text-gray-400'}`}
                    >
                      Обновить существующую
                    </button>
                  </div>

                  <div className="space-y-2 border-b border-gray-100 pb-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Целевая Книга (или Авто)</label>
                    <select 
                      className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                      value={selectedBookId || ''}
                      onChange={(e) => {
                        const id = Number(e.target.value) || null;
                        setSelectedBookId(id);
                        setSelectedChapterId(null);
                        setSelectedPageId(null);
                      }}
                      disabled={isLoadingBooks || books.length === 0}
                    >
                      <option value="">{isLoadingBooks ? 'Загрузка книг...' : 'Автоматический выбор...'}</option>
                      {books.map(book => (
                        <option key={book.id} value={book.id}>{book.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 border-b border-gray-100 pb-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Глава (или Авто)</label>
                    <select 
                      className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                      value={selectedChapterId || ''}
                      onChange={(e) => {
                        const id = Number(e.target.value) || null;
                        setSelectedChapterId(id);
                        setSelectedPageId(null);
                      }}
                      disabled={(!selectedBookId && targetMode === 'update') || isLoadingChapters}
                    >
                      <option value="">{isLoadingChapters ? 'Загрузка глав...' : 'Автоматический выбор или корень...'}</option>
                      {chapters.map(chapter => (
                        <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                      ))}
                    </select>
                  </div>

                  {targetMode === 'update' && (
                    <div className="space-y-2 border-b border-gray-100 pb-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Статья для обновления</label>
                      <select 
                        className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                        value={selectedPageId || ''}
                        onChange={(e) => setSelectedPageId(Number(e.target.value) || null)}
                        disabled={!selectedBookId || isLoadingPages || (pages.length === 0 && !isLoadingPages)}
                      >
                        <option value="">{isLoadingPages ? 'Загрузка статей...' : 'Выберите статью...'}</option>
                        {pages.map(page => (
                          <option key={page.id} value={page.id}>{page.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Метки (через запятую)</label>
                    <input 
                      type="text"
                      className="w-full py-2 bg-transparent font-semibold border-b border-gray-200 outline-none text-sm"
                      value={customTags}
                      onChange={(e) => setCustomTags(e.target.value)}
                      placeholder="Например: AI, 2024"
                    />
                  </div>
                </div>

                <div className="relative pt-6">
                  <div className="absolute -top-3 left-0 bg-white pr-2 text-[10px] font-bold uppercase tracking-widest">Автоматизация</div>
                  <button 
                    onClick={handleSync}
                    disabled={isSyncing || (targetMode === 'update' && !selectedBookId) || (sources.length === 0 && !content.trim())}
                    className="w-full py-6 bg-editorial-text disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm uppercase tracking-widest font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Синхронизация...
                      </>
                    ) : (
                      <>
                        <Send size={20} />
                        Запустить агент
                      </>
                    )}
                  </button>
                </div>

                <AnimatePresence>
                  {syncStatus.type !== 'idle' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`p-4 border-2 ${
                        syncStatus.type === 'success' 
                          ? 'bg-green-50 border-green-500 text-green-900' 
                          : 'bg-red-50 border-red-500 text-red-900'
                      }`}
                    >
                      <div className="flex gap-3">
                        {syncStatus.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
                        <div className="flex flex-col gap-1">
                          <p className="text-[11px] font-bold uppercase leading-tight tracking-tight">{syncStatus.message}</p>
                          {syncStatus.url && (
                            <a href={syncStatus.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold uppercase underline hover:opacity-80">
                              Открыть статью
                            </a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="p-8 border-2 border-editorial-text border-dashed bg-white/30">
              <h3 className="font-serif text-xl italic mb-4">Рабочий процесс</h3>
              <div className="space-y-4">
                {[
                  { step: "01", text: "Соберите знания в NotebookLM или файлах" },
                  { step: "02", text: "Загрузите источники в рабочую область" },
                  { step: "03", text: "Укажите цель для агента Bridge.LM" },
                  { step: "04", text: "Синхронизируйте с вашей базой знаний" }
                ].map((item) => (
                  <div key={item.step} className="flex gap-4 items-start">
                    <span className="text-xs font-bold font-serif italic text-gray-400">{item.step}.</span>
                    <p className="text-[11px] font-bold uppercase tracking-widest leading-snug">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Activity Ticker */}
      <footer className="max-w-6xl mx-auto px-10 pt-12">
        <div className="border-t-2 border-editorial-text pt-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-4">
            Активность модуля
            <span className="w-1 h-1 bg-editorial-text rounded-full"></span>
          </div>
          <div className="flex gap-8 overflow-hidden whitespace-nowrap text-[11px] italic text-gray-500">
             <p>Gemini AI Активен</p>
             <p className="opacity-20">•</p>
             <p>BookStack Proxy v1.1.0</p>
             <p className="opacity-20">•</p>
             <p>Secure Token Auth Ready</p>
          </div>
          <div className="text-[10px] font-mono opacity-50 uppercase tracking-tighter">
            v1.1.0-ru
          </div>
        </div>
      </footer>
      {/* Preview Modal */}
      <AnimatePresence>
        {previewSource && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/20 backdrop-blur-sm"
            onClick={() => setPreviewSource(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-2xl max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-editorial-text flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <FileText className="text-editorial-text" size={18} />
                  <h3 className="font-serif font-bold text-gray-900">{previewSource.name}</h3>
                </div>
                <button 
                  onClick={() => setPreviewSource(null)}
                  className="p-2 hover:bg-editorial-accent transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-1 custom-scrollbar">
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {previewSource.content}
                </pre>
              </div>
              <div className="p-4 bg-gray-50 border-t border-editorial-text flex justify-end">
                <button
                  onClick={() => setPreviewSource(null)}
                  className="px-6 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-gray-800 transition-all"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Knowledge Console Sidebar */}
      <AnimatePresence>
        {isConsoleOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConsoleOpen(false)}
              className="fixed inset-0 z-40 bg-editorial-text/10 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white border-l-4 border-editorial-text shadow-[-20px_0px_60px_-15px_rgba(26,26,26,0.3)] flex flex-col"
            >
              <div className="p-6 border-b-2 border-editorial-text bg-editorial-bg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-editorial-text text-white relative">
                    <Terminal size={20} />
                    {isSyncing && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-serif font-bold text-xl leading-none">Консоль знаний</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                      <p className="text-[9px] uppercase tracking-widest font-bold text-editorial-text/40">
                        {isSyncing ? 'Агент в сети: Обработка' : 'Система в режиме ожидания'}
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsConsoleOpen(false)} className="p-2 hover:bg-editorial-accent transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Progress Bar Header */}
              {isSyncing && (
                <div className="bg-white border-b-2 border-editorial-text p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-editorial-text">Статус операции</span>
                    <span className="text-[10px] font-mono text-editorial-text">{Math.round((syncProgress.step / syncProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-4 bg-editorial-accent/20 border-2 border-editorial-text p-0.5 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(syncProgress.step / syncProgress.total) * 100}%` }}
                      className="h-full bg-editorial-text flex items-center justify-end px-2"
                    >
                      <div className="w-1 h-2 bg-white/30" />
                    </motion.div>
                  </div>
                  <p className="mt-2 text-[9px] font-bold italic text-editorial-text/60 text-center uppercase tracking-tighter">
                    {syncProgress.label}...
                  </p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {isSyncing ? (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <Brain size={48} className="text-editorial-text animate-pulse mb-6" />
                    <h3 className="font-serif font-bold animate-bounce">Агент анализирует...</h3>
                    <p className="text-[10px] uppercase tracking-widest text-editorial-text/60 mt-2">Идет процесс сопоставления источников и выбора целевого места в Wiki</p>
                  </div>
                ) : lastResponse ? (
                  <div className="p-8 space-y-10">
                    {/* Thinking/Reasoning */}
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <Brain size={16} className="text-editorial-text" />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Процесс размышления</h3>
                      </div>
                      <div className="bg-editorial-accent/5 border-l-2 border-editorial-text p-4 italic text-sm text-gray-700 leading-relaxed font-serif prose prose-sm max-w-none">
                        <Markdown>{lastResponse.thinking || "Информация о процессе обработки отсутствует."}</Markdown>
                      </div>
                    </section>

                    {/* Dialogue Refinement */}
                    {pendingApproval && (
                      <section className="bg-white border-2 border-editorial-text p-4 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                        <div className="flex items-center gap-2 mb-4">
                          <MessageSquare size={16} className="text-editorial-text" />
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Диалог с Агентом</h3>
                        </div>
                        
                        <div className="space-y-4 mb-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                          {chatHistory.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] p-2 text-[10px] ${msg.role === 'user' ? 'bg-editorial-text text-white font-bold' : 'bg-editorial-accent/20 border border-editorial-text text-editorial-text'}`}>
                                {msg.content}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="Напишите правку: 'поменяй формат', 'добавь таблицу'..."
                            className="flex-1 p-2 border-2 border-editorial-text text-xs outline-none focus:bg-editorial-accent/5"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRefinement()}
                          />
                          <button 
                            onClick={handleRefinement}
                            className="p-2 bg-editorial-text text-white hover:bg-black transition-colors"
                          >
                            <Send size={16} />
                          </button>
                        </div>
                        <p className="text-[8px] text-gray-400 mt-2 uppercase tracking-widest text-center italic">Агент перегенерирует контент на основе ваших слов</p>
                      </section>
                    )}

                    {/* Метаданные */}
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <Info size={16} className="text-editorial-text" />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Технические данные</h3>
                      </div>
                      
                      {pendingApproval && (
                        <div className="mb-4 space-y-4">
                          <div className="space-y-1">
                            <label className="text-[8px] uppercase tracking-widest text-gray-400 font-bold">Заголовок статьи</label>
                            <input 
                              type="text"
                              className="w-full p-2 bg-gray-50 border border-editorial-text/20 font-bold text-xs outline-none focus:border-editorial-text"
                              value={lastResponse.title}
                              onChange={(e) => setLastResponse({...lastResponse, title: e.target.value})}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 border border-editorial-text/10">
                          <span className="block text-[8px] uppercase tracking-widest text-gray-400 mb-1">ID Книги</span>
                          {pendingApproval ? (
                            <input 
                              type="text"
                              className="w-full bg-transparent font-mono text-xs font-bold border-b border-editorial-text/20 outline-none focus:border-editorial-text"
                              value={lastResponse.targetBookId ?? ''}
                              onChange={(e) => setLastResponse({...lastResponse, targetBookId: e.target.value ? Number(e.target.value) : null})}
                              placeholder={lastResponse.newBookName ? 'НОВАЯ: ' + lastResponse.newBookName : 'ID или null'}
                            />
                          ) : (
                            <span className="font-mono text-xs font-bold">{lastResponse.targetBookId ?? (lastResponse.newBookName ? 'НОВАЯ: ' + lastResponse.newBookName : 'Не указан')}</span>
                          )}
                        </div>
                        <div className="p-4 bg-gray-50 border border-editorial-text/10">
                          <span className="block text-[8px] uppercase tracking-widest text-gray-400 mb-1">ID Главы</span>
                          {pendingApproval ? (
                            <input 
                              type="text"
                              className="w-full bg-transparent font-mono text-xs font-bold border-b border-editorial-text/20 outline-none focus:border-editorial-text"
                              value={lastResponse.targetChapterId ?? ''}
                              onChange={(e) => setLastResponse({...lastResponse, targetChapterId: e.target.value ? Number(e.target.value) : null})}
                              placeholder={lastResponse.newChapterName ? 'НОВАЯ: ' + lastResponse.newChapterName : 'ID или null'}
                            />
                          ) : (
                            <span className="font-mono text-xs font-bold">{lastResponse.targetChapterId ?? (lastResponse.newChapterName ? 'НОВАЯ: ' + lastResponse.newChapterName : 'Не указан')}</span>
                          )}
                        </div>
                        <div className="col-span-2 p-4 bg-gray-50 border border-editorial-text/10">
                          <span className="block text-[8px] uppercase tracking-widest text-gray-400 mb-1">Рекомендованные метки</span>
                          {pendingApproval ? (
                            <input 
                              type="text"
                              className="w-full bg-transparent font-bold text-[9px] uppercase tracking-widest border-b border-editorial-text/20 outline-none focus:border-editorial-text mt-2"
                              value={lastResponse.tags?.join(', ') || ''}
                              onChange={(e) => setLastResponse({...lastResponse, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)})}
                            />
                          ) : (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {lastResponse.tags?.map((tag: string, idx: number) => (
                                <span key={idx} className="px-2 py-1 bg-white border border-editorial-text text-[9px] font-bold uppercase">
                                  {tag}
                                </span>
                              )) || <span className="text-[10px] text-gray-300">Метки отсутствуют</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </section>

                    {/* Grounding Sources */}
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <History size={16} className="text-editorial-text" />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Активные источники</h3>
                      </div>
                      <div className="space-y-2">
                        {sources.filter(s => s.selected !== false).map((s, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 border border-editorial-text/5 bg-gray-50/50">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileText size={14} className="text-editorial-text shrink-0" />
                              <span className="text-[10px] font-bold uppercase tracking-widest truncate">{s.name}</span>
                            </div>
                            <span className="text-[8px] font-mono text-gray-400">{s.content?.length || 0} симв.</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* File Repository (History) */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <History size={16} className="text-editorial-text" />
                          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Архив файлов</h3>
                        </div>
                        <span className="text-[8px] font-bold py-1 px-2 bg-editorial-text text-white uppercase">{sources.length} файлов</span>
                      </div>
                      <div className="bg-editorial-accent/5 border border-editorial-text/10 p-2 max-h-60 overflow-y-auto">
                        {sources.length > 0 ? (
                          <div className="divide-y divide-editorial-text/10">
                            {sources.map((s, idx) => (
                              <div key={idx} className="py-2 px-1 flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-bold uppercase truncate max-w-[200px]">{s.name}</span>
                                  <span className="text-[7px] text-gray-400 uppercase tracking-tighter">{(s.content?.length || 0).toLocaleString()} символов</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${s.selected !== false ? 'bg-green-500' : 'bg-gray-200'}`} title={s.selected !== false ? 'Активен' : 'Отключен'} />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-[9px] uppercase text-gray-400">Архив пуст</p>
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                    <Terminal size={48} className="text-gray-200 mb-6" />
                    <h3 className="font-serif font-bold text-gray-400">Данные не собраны</h3>
                    <p className="text-[10px] uppercase tracking-widest text-gray-300 mt-2">Запустите процесс синтеза, чтобы увидеть этапы мышления Агента</p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-editorial-bg border-t-2 border-editorial-text">
                {pendingApproval ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-yellow-50 border border-yellow-200 flex items-start gap-3 mb-4">
                      <div className="p-1 bg-yellow-400 text-white rounded-full">
                        <Info size={12} />
                      </div>
                      <p className="text-[9px] uppercase font-bold text-yellow-800 leading-tight">
                        Внимание: Агент ждет вашего одобрения. Вы можете скорректировать данные выше перед публикацией.
                      </p>
                    </div>
                    <button 
                      onClick={confirmAndPublish}
                      className="w-full py-4 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-black transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,0.1)] active:shadow-none active:translate-x-1 active:translate-y-1 flex items-center justify-center gap-3"
                    >
                      <Eye size={16} />
                      Одобрить и Опубликовать
                    </button>
                    <button 
                      onClick={() => {
                        setPendingApproval(false);
                        setIsConsoleOpen(false);
                        setSyncStatus({ type: 'idle', message: 'Публикация отменена пользователем.' });
                      }}
                      className="w-full py-2 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50"
                    >
                      Отменить операцию
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsConsoleOpen(false)}
                    className="w-full py-3 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-[0.3em] hover:bg-gray-800 transition-all shadow-[6px_6px_0px_0px_rgba(26,26,26,0.1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                  >
                    Вернуться к редактору
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

