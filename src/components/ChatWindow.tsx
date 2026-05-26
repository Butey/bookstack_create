import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Send, X, Bot, User, Loader2, Sparkles, Paperclip } from 'lucide-react';
import { callGemini, GeminiModelId } from '../services/gemini';
import { AEMarkdown } from './AEMarkdown';

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sources: { name: string; content: string; selected?: boolean }[];
  model: GeminiModelId;
  onGenerateArticle: (content?: string) => void;
  onFileUpload: (files: File[]) => void;
  isUploading?: boolean;
}

export const ChatWindow = React.memo(function ChatWindow({ isOpen, onClose, sources, model, onGenerateArticle, onFileUpload, isUploading }: ChatWindowProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const abortControllerRef = useRef<AbortController | null>(null);

  const activeSources = sources.filter((s) => s.selected !== false);

  useEffect(() => {
    // Безопасная очистка аборт-контроллера при размонтировании
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    // Безопасная прокрутка с защитой от зависаний в контейнерах iframe
    const timer = setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length, isLoading]);

  const handleSend = async (overrideInput?: string) => {
    const userMessage = overrideInput || input.trim();
    if (!userMessage || isLoading) return;

    if (!overrideInput) {
      setInput('');
    }
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    // Перехват прямого запроса на создание или обновление статьи
    const lowercaseMsg = userMessage.toLowerCase();
    const isDirectSyncRequest = 
      lowercaseMsg.includes('создай статью') ||
      lowercaseMsg.includes('создать статью') ||
      lowercaseMsg.includes('обнови статью') ||
      lowercaseMsg.includes('обновить статью') ||
      lowercaseMsg.includes('синтезируй статью') ||
      lowercaseMsg.includes('синтезировать статью') ||
      lowercaseMsg.includes('запусти генерацию') ||
      lowercaseMsg.includes('запустить генерацию') ||
      lowercaseMsg.includes('сгенерируй статью') ||
      lowercaseMsg.includes('сгенерировать статью') ||
      lowercaseMsg.includes('опубликуй статью') ||
      lowercaseMsg.includes('опубликовать статью') ||
      lowercaseMsg.includes('агент, запусти') ||
      lowercaseMsg.includes('запусти синхронизацию') ||
      lowercaseMsg.includes('запустить синхронизацию');

    if (isDirectSyncRequest) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { 
          role: 'model', 
          content: '🤖 *Обнаружен прямой запрос на генерацию статьи в Wiki. Запускаю ИИ-агента и процесс интеллектуального синтеза знаний на основе активных источников...*' 
        }]);
        setIsLoading(false);
        
        // Запускаем синхронизацию
        onGenerateArticle();
        // Закрываем окно чата, чтобы показать пользователю консоль выполнения
        onClose();
      }, 800);
      return;
    }

    // Инициализация AbortController для текущего запроса
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Автоматический таймаут на 30 секунд
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 30000);

    try {
      // Безопасная фильтрация и обрезка контекста источников во избежание перегрузки ИИ и зависания
      const contextPrefix = activeSources.length > 0
        ? `АКТИВНЫЕ ИСТОЧНИКИ ДЛЯ КОНТЕКСТА:\n${activeSources.map(s => {
            const truncatedContent = s.content.length > 15000
              ? s.content.substring(0, 15000) + '\n... [Контент статьи принудительно усечен для повышения стабильности чата] ...'
              : s.content;
            return `--- ${s.name} ---\n${truncatedContent}`;
          }).join('\n\n')}\n\n`
        : 'У вас пока нет загруженных источников, действуйте на основе своих общих знаний.\n\n';
        
      const systemPrompt = `Вы — Ассистент NotebookLM. Ваша задача — отвечать на вопросы пользователя на основе предоставленных 'Активных источников' (документов).\nЕсли ответа нет в источниках, скажите об этом, но вы также можете использовать свои знания, если это уместно.\n\n${contextPrefix}`;

      const history = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const fullMessages = [
        ...history,
        { role: 'user', parts: [{ text: (history.length === 0 ? systemPrompt : 'ИНСТРУКЦИИ/ИСТОЧНИКИ ВЫШЕ. ТЕКУЩИЙ ВОПРОС: ') + userMessage }] }
      ] as any;

      if (history.length > 0) {
        fullMessages[0].parts[0].text = systemPrompt + ' ВОПРОС: ' + fullMessages[0].parts[0].text;
      }

      const response = await callGemini(model, fullMessages, { signal: controller.signal });
      clearTimeout(timeoutId);
      setMessages((prev) => [...prev, { role: 'model', content: response }]);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(error);
      
      if (error.name === 'AbortError') {
        setMessages((prev) => [...prev, { 
          role: 'model', 
          content: '⏱️ **Операция отменена.** Превышено время ожидания ответа ИИ (30 секунд) или вы прервали обработку вручную. Попробуйте отключить часть активных источников информации.' 
        }]);
      } else {
        setMessages((prev) => [...prev, { role: 'model', content: `**Ошибка:** ${error.message || 'Не удалось получить ответ'}` }]);
      }
    } finally {
      setIsLoading(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          className="fixed bottom-0 right-0 z-50 w-full sm:w-[450px] sm:right-10 h-[600px] max-h-[80vh] bg-white border-2 border-editorial-text shadow-[-8px_-8px_0px_0px_rgba(26,26,26,0.1)] flex flex-col"
        >
          {/* Header */}
          <div 
            onPointerDown={(e) => dragControls.start(e)} 
            className="flex items-center justify-between p-4 border-b-2 border-editorial-text bg-editorial-text text-white cursor-grab active:cursor-grabbing select-none shrink-0"
          >
            <div className="flex items-center gap-3">
              <Sparkles size={18} className="text-yellow-400" />
              <div>
                <h3 className="font-serif font-bold text-sm tracking-wider uppercase">Чат с источниками</h3>
                <p className="text-[10px] text-gray-300 font-mono">
                  {activeSources.length > 0 ? `${activeSources.length} активных документов` : 'Нет документов'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 hover:bg-white/20 rounded transition-colors text-white"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/50">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4">
                <Bot size={48} />
                <div className="space-y-1">
                  <p className="font-bold uppercase tracking-widest text-xs">Я готов к вопросам</p>
                  <p className="text-[10px] max-w-[250px]">Спросите меня о чем-угодно на основе загруженных источников.</p>
                </div>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-editorial-text text-white'}`}>
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`rounded p-3 ${msg.role === 'user' ? 'bg-gray-200 text-gray-900' : 'bg-white border border-gray-200 shadow-sm text-gray-800'}`}>
                    <div className="text-[13px] leading-relaxed markdown-body">
                      <AEMarkdown>{msg.content}</AEMarkdown>
                    </div>
                  </div>
                </div>
                {msg.role === 'model' && (
                  <div className="ml-11 flex gap-2">
                    <button
                      onClick={() => onGenerateArticle(msg.content)}
                      className="text-[10px] uppercase font-bold text-gray-500 hover:text-editorial-text transition-colors flex items-center gap-1"
                      title="Экспорт в BookStack"
                    >
                      <Sparkles size={10} />
                      в BookStack
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 flex-row items-start">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-editorial-text text-white">
                  <Bot size={14} />
                </div>
                <div className="max-w-[80%] rounded p-3 bg-white border border-gray-200 shadow-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-editorial-text" />
                    <span className="text-xs text-gray-500 font-serif italic">Агент пишет ответ...</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (abortControllerRef.current) {
                        abortControllerRef.current.abort();
                      }
                    }}
                    className="self-start text-[9px] uppercase font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-wider"
                  >
                    Прервать
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          <div className="px-3 pt-3 pb-2 bg-white flex justify-center flex-wrap gap-2 border-t border-gray-200">
            <button
              onClick={() => {
                onGenerateArticle();
                onClose();
              }}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors flex items-center gap-1"
            >
              Сгенерировать статью в BookStack
            </button>
            <button
              onClick={() => handleSend('Создай Mindmap по загруженным источникам. Используй форматирование Markdown (вложенные списки) для представления структуры связей.')}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors flex items-center gap-1"
            >
              Создать Mindmap
            </button>
            <button
              onClick={() => handleSend('Составь подробный FAQ (Часто задаваемые вопросы) на основе загруженных источников.')}
              className="px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors flex items-center gap-1"
            >
              Сгенерировать FAQ
            </button>
          </div>

          {/* Input */}
          <div className="p-3 bg-white">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-2"
            >
              <label 
                className={`h-[44px] px-3 bg-gray-100 flex items-center justify-center transition-colors shrink-0 ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200 cursor-pointer text-gray-600'}`}
                title="Прикрепить источник"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
                <input 
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept=".pdf,.txt,.md,.html" 
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      onFileUpload(files);
                      e.target.value = '';
                    }
                  }} 
                  disabled={isUploading}
                />
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Задайте вопрос по материалам..."
                className="flex-1 max-h-32 min-h-[44px] p-3 text-sm bg-gray-100 border-none outline-none focus:ring-1 focus:ring-editorial-text resize-none rounded-none custom-scrollbar"
                rows={1}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-[44px] px-4 bg-editorial-text text-white flex items-center justify-center hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
