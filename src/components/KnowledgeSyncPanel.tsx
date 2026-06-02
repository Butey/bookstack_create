import { AnimatePresence, motion } from 'motion/react';
import { Send, Loader2, CheckCircle, AlertCircle, HelpCircle, Book, Layers, ChevronRight } from 'lucide-react';
import { BookStackBook, BookStackChapter, BookStackPage } from '../types';

interface KnowledgeSyncPanelProps {
  // Config & State
  targetMode: 'create' | 'update';
  setTargetMode: (mode: 'create' | 'update') => void;
  selectedBookId: number | null;
  setSelectedBookId: (id: number | null) => void;
  selectedChapterId: number | null;
  setSelectedChapterId: (id: number | null) => void;
  selectedPageId: number | null;
  setSelectedPageId: (id: number | null) => void;
  customTags: string;
  setCustomTags: (tags: string) => void;
  
  // Data Source
  books: BookStackBook[];
  chapters: BookStackChapter[];
  pages: BookStackPage[];
  isLoadingBooks: boolean;
  isLoadingChapters: boolean;
  isLoadingPages: boolean;

  // Actions
  handleSync: () => void;
  loadChaptersAndPages: (id: number) => Promise<void>;
  loadChapterPages: (id: number) => Promise<void>;
  executionControl: any;
  sourcesLength: number;
  contentLength: number;
  handleGenerateMindmap: () => void;
  handleGenerateFAQ: () => void;
  handleGenerateMermaid: () => void;
  setIsConfigOpen: (v: boolean) => void;
}

export function KnowledgeSyncPanel({
  targetMode, setTargetMode,
  selectedBookId, setSelectedBookId,
  selectedChapterId, setSelectedChapterId,
  selectedPageId, setSelectedPageId,
  customTags, setCustomTags,
  books, chapters, pages,
  isLoadingBooks, isLoadingChapters, isLoadingPages,
  handleSync, loadChaptersAndPages, loadChapterPages,
  executionControl, sourcesLength, contentLength,
  handleGenerateMindmap, handleGenerateFAQ, handleGenerateMermaid, setIsConfigOpen
}: KnowledgeSyncPanelProps) {
  const bookName = selectedBookId 
    ? books.find(b => b.id === selectedBookId)?.name 
    : 'Автоматический выбор';
    
  const chapterName = selectedChapterId 
    ? chapters.find(c => c.id === selectedChapterId)?.name 
    : (selectedBookId ? 'Корень книги' : null);
    
  const pageName = selectedPageId 
    ? pages.find(p => p.id === selectedPageId)?.name 
    : (targetMode === 'update' ? null : null);

  return (
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
                  if (id) {
                    loadChaptersAndPages(id);
                  } else {
                    setSelectedBookId(null);
                    setSelectedChapterId(null);
                    setSelectedPageId(null);
                  }
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
                  if (id) {
                    loadChapterPages(id);
                  } else {
                    setSelectedChapterId(null);
                    setSelectedPageId(null);
                  }
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

          <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-[2px] transition-all">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
              <Layers size={10} />
              Маршрут публикации
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight leading-tight">
              <span className="text-editorial-text truncate max-w-[120px]" title={bookName}>{bookName}</span>
              <ChevronRight size={10} className="text-gray-300" />
              {chapterName && (
                <>
                  <span className="text-editorial-text truncate max-w-[120px]" title={chapterName}>{chapterName}</span>
                  <ChevronRight size={10} className="text-gray-300" />
                </>
              )}
              <span className={targetMode === 'create' ? 'text-green-600' : 'text-blue-600'}>
                {targetMode === 'create' ? 'Новая статья' : (pageName || 'Статья не выбрана')}
              </span>
            </div>
          </div>

          <div className="relative pt-6">
            <div className="absolute -top-3 left-0 bg-white pr-2 text-[10px] font-bold uppercase tracking-widest">Автоматизация</div>
            <button 
              onClick={() => handleSync()}
              disabled={executionControl.isSyncing || (targetMode === 'update' && !selectedBookId) || (sourcesLength === 0 && contentLength === 0)}
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
                    <p className="text-[11px] font-bold uppercase leading-tight tracking-tight">
                      {executionControl.syncStatus.message.replace('[QUOTA_EXCEEDED]', '').replace('[INVALID_MODEL]', '').trim()}
                    </p>
                    {executionControl.syncStatus.url && (
                      <a href={executionControl.syncStatus.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold uppercase underline hover:opacity-80">
                        Открыть статью
                      </a>
                    )}
                    {(executionControl.syncStatus.message.includes('[QUOTA_EXCEEDED]') || executionControl.syncStatus.message.includes('[INVALID_MODEL]')) && (
                      <button
                        onClick={() => setIsConfigOpen(true)}
                        className="mt-2 text-left self-start px-3 py-2 bg-red-600 text-white text-[10px] whitespace-nowrap font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                      >
                        Сменить модель ИИ
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleGenerateMindmap}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-3 bg-white border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-[9px] uppercase font-bold text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          title="Создать Mindmap"
        >
          Mindmap
        </button>
        <button
          onClick={handleGenerateFAQ}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-3 bg-white border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-[9px] uppercase font-bold text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          title="Сгенерировать FAQ"
        >
          FAQ
        </button>
        <button
          onClick={handleGenerateMermaid}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-3 bg-white border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-[9px] uppercase font-bold text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-center px-1"
          title="Сгенерировать схему Mermaid"
        >
          Схема Mermaid
        </button>
      </div>

      {/* Справка Mindmap vs Mermaid */}
      <div className="bg-[#FAF9F6] border-2 border-editorial-text p-4 text-[10.5px] space-y-2.5 leading-relaxed shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-editorial-text mb-1">
          <HelpCircle size={14} className="text-editorial-text shrink-0" />
          Разница: Mindmap vs Mermaid
        </div>
        <p className="text-gray-700">
          <strong>Mindmap (Интеллект-карта)</strong> — это древовидная или радиальная схема ассоциаций. Она организует ключевые сущности, темы и понятия из источников вокруг единой центральной идеи. Идеально подходит для конспектирования, структурирования сложных понятий и брейншторминга.
        </p>
        <p className="text-gray-700">
          <strong>Схема Mermaid</strong> — это структурированная блок-схема процесса, алгоритма или последовательности логических шагов. Позволяет графически запечатлеть связи вида «Объект A ➔ Направление / Решение ➔ Объект Б». Идеально для технического моделирования, инструкций поддержки (Symptom ➔ Fix) и системных архитектур.
        </p>
      </div>

      <div className="p-8 border-2 border-editorial-text border-dashed bg-white/30">
        <h3 className="font-serif text-xl italic mb-4">Рабочий процесс</h3>
        <div className="space-y-4">
          {[
            { step: "01", text: "Соберите знания в NotebookLM или файлах" },
            { step: "02", text: "Загрузите источники в рабочую область" },
            { step: "03", text: "Укажите цель для агента Bridge.LM" },
            { step: "04", text: "Синхронизируйте с вашей базы знаний" }
          ].map((item) => (
            <div key={item.step} className="flex gap-4 items-start">
              <span className="text-xs font-bold font-serif italic text-gray-400">{item.step}.</span>
              <p className="text-[11px] font-bold uppercase tracking-widest leading-snug">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
