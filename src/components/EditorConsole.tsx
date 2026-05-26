import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X,
  History,
  AlertCircle,
  Eye,
  Loader2,
  Terminal,
  Send,
  User,
  Bot,
  Play,
  Pause,
  Square,
  Brain,
  MessageSquare,
  Info,
  FileText
} from 'lucide-react';
import { AEMarkdown } from './AEMarkdown';
import { ProcessedArticle } from '../types';

interface EditorConsoleProps {
  isConsoleOpen: boolean;
  setIsConsoleOpen: (val: boolean) => void;
  lastResponse: ProcessedArticle | null;
  setLastResponse: (val: ProcessedArticle | null) => void;
  pendingApproval: boolean;
  setPendingApproval: (val: boolean) => void;
  syncStatus: { type: string; message: string; url?: string };
  syncProgress: { step: number; total: number; label: string };
  confirmAndPublish: () => void;
  handleCancel: () => void;
  handlePauseToggle: () => void;
  isPaused: boolean;
  userInput: string;
  setUserInput: (val: string) => void;
  isSyncing: boolean;
  handleRefinement: () => void;
  chatHistory: { role: string; content: string }[];
  sources: { name: string; content: string; selected?: boolean }[];
  setSyncStatus: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error' | 'idle', message: string, url?: string }>>;
  books: any[];
}

export const EditorConsole = React.memo(function EditorConsole({
  isConsoleOpen,
  setIsConsoleOpen,
  lastResponse,
  setLastResponse,
  pendingApproval,
  setPendingApproval,
  syncStatus,
  syncProgress,
  confirmAndPublish,
  handleCancel,
  handlePauseToggle,
  isPaused,
  userInput,
  setUserInput,
  isSyncing,
  handleRefinement,
  chatHistory,
  sources,
  setSyncStatus,
  books
}: EditorConsoleProps) {
  return (
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
                    <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? (isPaused ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 animate-pulse') : 'bg-gray-300'}`} />
                    <p className="text-[9px] uppercase tracking-widest font-bold text-editorial-text/40">
                      {isSyncing ? (isPaused ? 'Агент на паузе' : 'Агент в сети: Обработка') : 'Система в режиме ожидания'}
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
                  <span className="text-[10px] font-mono text-editorial-text">{syncProgress.total ? Math.round((syncProgress.step / syncProgress.total) * 100) : 0}%</span>
                </div>
                <div className="h-4 bg-editorial-accent/20 border-2 border-editorial-text p-0.5 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${syncProgress.total ? (syncProgress.step / syncProgress.total) * 100 : 0}%` }}
                    className="h-full bg-editorial-text flex items-center justify-end px-2"
                  >
                    <div className="w-1 h-2 bg-white/30" />
                  </motion.div>
                </div>
                <p className="mt-2 text-[9px] font-bold italic text-editorial-text/60 text-center uppercase tracking-tighter">
                  {syncProgress.label}...
                </p>
                
                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={handlePauseToggle}
                    className={`flex-1 py-2 flex items-center justify-center gap-1 border-2 border-editorial-text text-[10px] font-bold uppercase tracking-widest transition-colors ${isPaused ? 'bg-editorial-text text-white' : 'bg-editorial-accent text-editorial-text hover:bg-editorial-text hover:text-white'}`}
                  >
                    {isPaused ? <Play size={12} /> : <Pause size={12} />}
                    {isPaused ? 'Возобновить' : 'Пауза'}
                  </button>
                  <button 
                    onClick={handleCancel}
                    className="flex-1 py-2 flex items-center justify-center gap-1 bg-white text-red-500 border-2 border-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <Square size={12} />
                    Отмена
                  </button>
                </div>
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
                      <AEMarkdown>{lastResponse.thinking || "Информация о процессе обработки отсутствует."}</AEMarkdown>
                    </div>
                  </section>

                  {/* Article Draft Preview */}
                  {lastResponse.markdown && (
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <FileText size={16} className="text-editorial-text" />
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-editorial-text">Черновик статьи (с поддержкой Mermaid)</h3>
                      </div>
                      <div className="bg-white border-2 border-editorial-text p-6 max-h-[400px] overflow-y-auto custom-scrollbar text-sm text-gray-900 leading-relaxed font-sans prose prose-sm max-w-none">
                        <AEMarkdown>{lastResponse.markdown}</AEMarkdown>
                      </div>
                    </section>
                  )}

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
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-[8px] uppercase tracking-widest text-gray-400 font-bold">Краткое описание (Meta-Description - 3 предложения)</label>
                            <span className="text-[8px] font-mono text-gray-400">{(lastResponse.description ?? '').length} симв.</span>
                          </div>
                          <textarea 
                            rows={3}
                            className="w-full p-2 bg-gray-50 border border-editorial-text/20 text-xs font-semibold outline-none focus:border-editorial-text resize-none"
                            value={lastResponse.description ?? ''}
                            onChange={(e) => setLastResponse({...lastResponse, description: e.target.value})}
                            placeholder="Автоматически сгенерированное краткое содержание из 3 предложений..."
                          />
                        </div>
                      </div>
                    )}

                    {!pendingApproval && lastResponse.description && (
                      <div className="mb-4 p-4 bg-gray-50 border border-editorial-text/10">
                        <span className="block text-[8px] uppercase tracking-widest text-gray-400 mb-1">Краткое описание (Meta-Description)</span>
                        <p className="text-xs italic text-gray-600 font-serif leading-relaxed">{lastResponse.description}</p>
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
                        {lastResponse.targetBookId && (
                          <div className="mt-1 text-[10px] text-gray-500 font-medium truncate" title={books?.find((b: any) => b.id === lastResponse.targetBookId)?.name}>
                            {books?.find((b: any) => b.id === lastResponse.targetBookId)?.name || 'Книга не найдена'}
                          </div>
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

                    {lastResponse.duplicateLinks && lastResponse.duplicateLinks.length > 0 && (
                      <div className="mt-4 p-4 border-2 border-red-500 bg-red-50">
                        <span className="block text-[10px] uppercase tracking-widest text-red-600 mb-2 font-bold flex items-center gap-2">
                           <AlertCircle size={14} /> Найдены дублирующие статьи в базе
                        </span>
                        <ul className="space-y-2 mt-3">
                          {lastResponse.duplicateLinks.map((link, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className="text-red-500">•</span>
                              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-red-700 hover:text-red-900 hover:underline">
                                {link}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
  );
});
