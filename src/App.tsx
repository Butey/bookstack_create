/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, ChangeEvent, DragEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Send, 
  CheckCircle, 
  Loader2, 
  AlertCircle,
  ClipboardList,
  FileText,
  X,
  Terminal,
  Brain,
  MessageSquare,
} from 'lucide-react';
import { BookStackCredentials, BookStackBook, BookStackChapter, BookStackPage, ProcessedArticle } from './types';
import { GEMINI_MODELS, DEFAULT_MODEL, GeminiModelId } from './services/gemini';
import { ChatWindow } from './components/ChatWindow';
import { InteractiveMindmap, parseMarkdownListToTree } from './components/InteractiveMindmap';
import { ConfigurationModal } from './components/ConfigurationModal';
import { WorkspacePanel } from './components/WorkspacePanel';
import { EditorConsole } from './components/EditorConsole';
import { useExecutionControl } from './hooks/useExecutionControl';
import { useFileUpload } from './hooks/useFileUpload';
import { useAgentActions } from './hooks/useAgentActions';
import { useBookStackSync } from './hooks/useBookStackSync';

export default function App() {
  const executionControl = useExecutionControl();
  
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [sources, setSources] = useState<{ name: string; content: string; selected?: boolean }[]>([]);
  const [workMode, setWorkMode] = useState<'auto' | 'review'>('auto');
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [ragConfirmation, setRagConfirmation] = useState<{
    pageName: string;
    pageId: number;
    bookId: number;
    allSourcesText: string;
    analysis: any;
  } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mindmapData, setMindmapData] = useState<{ md: string } | null>(null);

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

  const {
    books, setBooks,
    chapters, setChapters,
    pages, setPages,
    selectedBookId, setSelectedBookId,
    selectedChapterId, setSelectedChapterId,
    selectedPageId, setSelectedPageId,
    isLoadingBooks,
    isLoadingChapters,
    isLoadingPages,
    loadBooks,
    loadChaptersAndPages,
    loadChapterPages
  } = useBookStackSync(credentials, executionControl.setSyncStatus);

  const [targetMode, setTargetMode] = useState<'create' | 'update'>('create');
  const [customTags, setCustomTags] = useState<string>('NotebookLM, Gemini-Refinement');
  
  const [content, setContent] = useState('');
  const [lastResponse, setLastResponse] = useState<ProcessedArticle | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<{ name: string; content: string } | null>(null);

  const [instructions, setInstructions] = useState('');
  const [dataStructure, setDataStructure] = useState('1. Краткий обзор (Summary)\n2. Контекст (Context)\n3. Детальное описание (Detailed Analysis)\n4. Выводы (Conclusion)');
  const [systemInstruction, setSystemInstruction] = useState('Вы — эксперт по техническому письму. Синтезируйте предоставленные источники в понятную и профессиональную статью для базы знаний Wiki.');
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(DEFAULT_MODEL);

  const { uploadProgress, isDragging, setIsDragging, processFiles, handleSpecialFileUpload } = useFileUpload(
    geminiModel,
    setSources,
    setSystemInstruction,
    setDataStructure,
    executionControl
  );

  const { handleSync, confirmAndPublish, handleRefinement, handleGenerateMindmap, handleGenerateFAQ, handleRagChoice } = useAgentActions({
    credentials,
    books,
    setBooks,
    chapters,
    selectedBookId,
    selectedChapterId,
    selectedPageId,
    targetMode,
    setTargetMode,
    sources,
    content,
    setContent,
    setSources,
    customTags,
    chatHistory,
    setChatHistory,
    lastResponse,
    setLastResponse,
    workMode,
    geminiModel,
    instructions,
    setPendingApproval,
    setIsConsoleOpen,
    setRagConfirmation,
    setMindmapData,
    executionControl,
    loadChapterPages,
    loadChaptersAndPages,
    setSelectedBookId,
    setSelectedPageId
  });

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.bookstack_sources) setSources(data.bookstack_sources);
      if (data.agent_work_mode) setWorkMode(data.agent_work_mode);
      if (data.agent_data_structure) setDataStructure(data.agent_data_structure);
      if (data.agent_system_instruction) setSystemInstruction(data.agent_system_instruction);
      if (data.agent_gemini_model) {
        const validIds = GEMINI_MODELS.map(m => m.id) as string[];
        setGeminiModel(validIds.includes(data.agent_gemini_model) ? data.agent_gemini_model : DEFAULT_MODEL);
      }
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
          agent_gemini_model: geminiModel,
          bookstack_creds: credsToSave
        })
      }).catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [sources, workMode, dataStructure, systemInstruction, geminiModel, credentials, isSettingsLoaded]);

  const totalChars = sources.reduce((acc, s) => s.selected !== false ? acc + (s.content?.length || 0) : acc, 0);

  const toggleSourceSelection = (index: number) => {
    setSources(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const selectAllSources = (selected: boolean) => {
    setSources(prev => prev.map(s => ({ ...s, selected })));
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    await processFiles(files);
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    await processFiles(files);
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
            <button
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-editorial-text hover:text-gray-500 transition-colors"
            >
              <MessageSquare size={16} />
              Чат с агентом
            </button>
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
            <ConfigurationModal
              isOpen={isConfigOpen}
              systemInstruction={systemInstruction}
              setSystemInstruction={setSystemInstruction}
              dataStructure={dataStructure}
              setDataStructure={setDataStructure}
              workMode={workMode}
              setWorkMode={setWorkMode}
              geminiModel={geminiModel}
              setGeminiModel={setGeminiModel}
              credentials={credentials}
              setCredentials={setCredentials}
              serverConfig={serverConfig}
              handleSpecialFileUpload={handleSpecialFileUpload}
              loadBooks={loadBooks}
              isLoadingBooks={isLoadingBooks}
            />

            <div className="flex flex-col gap-6">
              <WorkspacePanel 
                sources={sources}
                setSources={setSources}
                processFiles={processFiles}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                setPreviewSource={setPreviewSource}
                uploadProgress={uploadProgress}
              />

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
                  disabled={executionControl.isSyncing}
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
                    onClick={() => handleSync()}
                    disabled={executionControl.isSyncing || (targetMode === 'update' && !selectedBookId) || (sources.length === 0 && !content.trim())}
                    className="w-full py-6 bg-editorial-text disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm uppercase tracking-widest font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {executionControl.isSyncing ? (
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
                  {executionControl.syncStatus.type !== 'idle' && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`p-4 border-2 ${
                        executionControl.syncStatus.type === 'success' 
                          ? 'bg-green-50 border-green-500 text-green-900' 
                          : 'bg-red-50 border-red-500 text-red-900'
                      }`}
                    >
                      <div className="flex gap-3">
                        {executionControl.syncStatus.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
                        <div className="flex flex-col gap-1">
                          <p className="text-[11px] font-bold uppercase leading-tight tracking-tight">{executionControl.syncStatus.message}</p>
                          {executionControl.syncStatus.url && (
                            <a href={executionControl.syncStatus.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold uppercase underline hover:opacity-80">
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

            <div className="flex gap-2">
              <button
                onClick={handleGenerateMindmap}
                disabled={executionControl.isSyncing || (sources.length === 0 && !content.trim())}
                className="flex-1 py-3 bg-white border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-[10px] uppercase font-bold text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Создать Mindmap
              </button>
              <button
                onClick={handleGenerateFAQ}
                disabled={executionControl.isSyncing || (sources.length === 0 && !content.trim())}
                className="flex-1 py-3 bg-white border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-[10px] uppercase font-bold text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Сгенерировать FAQ
              </button>
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
      {/* Mindmap Preview Modal */}
      <AnimatePresence>
        {mindmapData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/20 backdrop-blur-sm"
            onClick={() => setMindmapData(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-4xl h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-4 border-b border-editorial-text flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <Brain className="text-editorial-text" size={18} />
                  <h3 className="font-serif font-bold text-gray-900">Интерактивный Mindmap</h3>
                </div>
                <button 
                  onClick={() => setMindmapData(null)}
                  className="p-2 hover:bg-editorial-accent transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 bg-gray-50 overflow-hidden relative">
                <InteractiveMindmap data={parseMarkdownListToTree(mindmapData.md)} />
              </div>
              <div className="p-4 bg-white border-t border-editorial-text flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setMindmapData(null)}
                  className="px-6 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-gray-100 transition-all"
                >
                  Закрыть
                </button>
                <button
                  onClick={() => {
                    handleSync(mindmapData.md);
                    setMindmapData(null);
                  }}
                  className="px-6 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
                >
                  <Send size={14} />
                  В BookStack
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RAG Confirmation Modal */}
      <AnimatePresence>
        {ragConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-xl flex flex-col"
            >
              <div className="flex justify-between items-center p-4 border-b-2 border-editorial-text bg-editorial-bg">
                <div className="flex items-center gap-2">
                  <Brain size={18} className="text-editorial-text" />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-editorial-text">Релевантная статья найдена</h3>
                </div>
                <button 
                  onClick={() => { setRagConfirmation(null); executionControl.setIsSyncing(false); executionControl.setSyncStatus({ type: 'idle', message: 'Операция отменена' }); }}
                  className="p-1 hover:bg-gray-100 text-gray-500"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-8 pb-10">
                <p className="text-sm mb-4 leading-relaxed">
                  Агент проанализировал ваши источники и обнаружил в Wiki существующую статью по этой теме:
                </p>
                
                <div className="p-4 bg-editorial-accent/10 border-l-4 border-editorial-text mb-6">
                  <p className="font-bold text-lg mb-2">{ragConfirmation.pageName}</p>
                  
                  {ragConfirmation.analysis?.retrievedContext?.find((p: any) => p.id === ragConfirmation.pageId)?.snippet && (
                    <div className="mt-4 pt-4 border-t border-editorial-text/20">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Обнаруженный контекст:</p>
                      <div 
                        className="text-xs text-gray-700 italic prose prose-sm max-h-32 overflow-y-auto custom-scrollbar pr-2"
                        dangerouslySetInnerHTML={{ 
                          __html: (() => {
                            const snippet = ragConfirmation.analysis.retrievedContext.find((p: any) => p.id === ragConfirmation.pageId)?.snippet;
                            return (typeof snippet === 'object' && snippet !== null) ? (snippet.content || snippet.text || JSON.stringify(snippet)) : String(snippet || '');
                          })()
                        }}
                      />
                    </div>
                  )}
                </div>

                <p className="text-sm mb-6 font-serif italic text-gray-600">
                  Вы хотите обновить/дополнить эту статью вашей новой информацией, или всё равно создать совершенно новую статью?
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleRagChoice(true, ragConfirmation)}
                    className="flex-1 py-4 bg-editorial-text text-white font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors"
                  >
                    Обновить эту статью
                  </button>
                  <button
                    onClick={() => handleRagChoice(false, ragConfirmation)}
                    className="flex-1 py-4 bg-white border-2 border-editorial-text text-editorial-text font-bold uppercase tracking-widest text-xs hover:bg-gray-50 transition-colors"
                  >
                    Создать новую
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Knowledge Console Sidebar */}
      <EditorConsole
        isConsoleOpen={isConsoleOpen}
        setIsConsoleOpen={setIsConsoleOpen}
        lastResponse={lastResponse}
        setLastResponse={setLastResponse}
        pendingApproval={pendingApproval}
        setPendingApproval={setPendingApproval}
        syncStatus={executionControl.syncStatus}
        syncProgress={executionControl.syncProgress}
        confirmAndPublish={confirmAndPublish}
        handleCancel={executionControl.handleCancel}
        handlePauseToggle={executionControl.handlePauseToggle}
        isPaused={executionControl.isPaused}
        userInput={userInput}
        setUserInput={setUserInput}
        isSyncing={executionControl.isSyncing}
        handleRefinement={() => {
          handleRefinement(userInput);
          setUserInput('');
        }}
        chatHistory={chatHistory}
        sources={sources}
        setSyncStatus={executionControl.setSyncStatus}
      />
      
      <ChatWindow
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        sources={sources}
        model={geminiModel}
        onGenerateArticle={handleSync}
        onFileUpload={processFiles}
        isUploading={uploadProgress !== null}
      />
    </div>
  );
}

