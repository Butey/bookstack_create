import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { Send, X, Bot, User, Loader2, Sparkles, Paperclip, CheckSquare, Layers, BookOpen, FileText, Brain, HelpCircle, Workflow } from 'lucide-react';
import { callGemini, GeminiModelId } from '../services/gemini';
import { AEMarkdown } from './AEMarkdown';

interface ActionDescriptor {
  type: string;
  label: string;
  param?: string;
  triggered?: boolean;
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  actions?: ActionDescriptor[];
}

interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  sources: { name: string; content: string; selected?: boolean }[];
  model: GeminiModelId;
  onGenerateArticle: (content?: string) => void;
  onRefineArticle: (instruction: string) => void;
  onGenerateMindmap: () => void;
  onGenerateFAQ: () => void;
  onGenerateMermaid: () => void;
  onSelectBook: (id: number | null) => void;
  onSelectChapter: (id: number | null) => void;
  onToggleSource: (name: string, selected: boolean) => void;
  books: any[];
  chapters: any[];
  selectedBookId: number | null;
  selectedChapterId: number | null;
  onFileUpload: (files: File[]) => void;
  isUploading?: boolean;
}

export const ChatWindow = React.memo(function ChatWindow({ 
  isOpen, 
  onClose, 
  sources, 
  model, 
  onGenerateArticle, 
  onRefineArticle,
  onGenerateMindmap,
  onGenerateFAQ,
  onGenerateMermaid,
  onSelectBook,
  onSelectChapter,
  onToggleSource,
  books,
  chapters,
  selectedBookId,
  selectedChapterId,
  onFileUpload, 
  isUploading 
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeChatModel, setActiveChatModel] = useState<GeminiModelId>(model || 'gemini-3.1-flash-lite');
  const [chatbotRole, setChatbotRole] = useState<'assistant' | 'architect' | 'critic' | 'devops'>('assistant');
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);
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
        
      const selectedRolePrompt = chatbotRole === 'architect' 
        ? 'Вы — опытный System Architect и Technical Writer. Пишите строгие спецификации, UML-структуры и архитектурные решения.'
        : chatbotRole === 'critic'
        ? 'Вы — жесткий и профессиональный технический рецензент. Ищите логические неувязки в логах, ошибки, неточности и подвергайте все сомнению.'
        : chatbotRole === 'devops'
        ? 'Вы — эксперт по анализу системных логов и DevOps. Выуживайте из логов системные сбои, трассировки стека, метрики и предлагайте решения.'
        : 'Вы — интерактивный ИИ-Агент и интеллектуальный Ассистент-Организатор знаний в проекте Bridge.LM.';
        
      const systemPrompt = `Вы — ${selectedRolePrompt}
Ваша задача — помогать пользователю работать с документами, генерировать структурированные статьи, FAQ, ментальные карты (Mindmaps), Mermaid диаграммы и осуществлять публикацию в базу знаний BookStack Wiki.

Вы обладаете полной интеграцией с основным сервисом веб-интерфейса! Вы можете напрямую управлять элементами управления, переключать источники, выбирать целевые книги и автоматически инициировать генерацию или редактирование статей.
Для этого ОБЯЗАТЕЛЬНО добавляйте в конец вашего текстового ответа (на новых строках) специальные маркеры команд. Наша система автоматически распознает их и мгновенно выполнит запрошенные вами действия!

ИНСТРУКЦИИ ПО ТРИГГЕРАМ И КОМАНДАМ (вы можете вызывать одну или одновременно несколько команд):
1. Запуск синтеза/генерации основной статьи в Wiki на основе активных источников:
   [[CMD:GENERATE_ARTICLE]] или [[CMD:GENERATE_ARTICLE|любые уточнения пользователя по цели статьи]]
2. Инициация раунда уточнения, правок или детальных изменений в текущую сгенерированную/активную статью:
   [[CMD:REFINE_ARTICLE|четкие инструкции ИИ о том, какие правки внести]]
3. Создание интерактивной ментальной карты (Mindmap) по текущей теме:
   [[CMD:GENERATE_MINDMAP]]
4. Подготовка структурированного блока "Часто задаваемые вопросы" (FAQ):
   [[CMD:GENERATE_FAQ]]
5. Построение технической визуализации связей или процессов через диаграмму Mermaid (Mermaid схема):
   [[CMD:GENERATE_MERMAID]]
6. Переключение целевой книги BookStack для публикации текущего материала:
   [[CMD:SELECT_BOOK|ID_книги]] (id должен быть строго числовым из списка ниже)
7. Выбор определенной главы в выбранной книге для публикации:
   [[CMD:SELECT_CHAPTER|ID_главы]] (id должен быть строго числовым из списка ниже)
8. Переключение статуса источника (отключение/включение мешающих документов или логов):
   [[CMD:TOGGLE_SOURCE|Точное имя источника|true или false]]

ДОСТУПНЫЕ КНИГИ в BookStack (для команды SELECT_BOOK):
${books.map((b: any) => `- Книга: "${b.name}" (ID: ${b.id})`).join('\n') || '- Книг на сервере BookStack пока не обнаружено.'}

ДОСТУПНЫЕ ГЛАВЫ в выбранной книге (для команды SELECT_CHAPTER):
${chapters.map((c: any) => `- Глава: "${c.name}" (ID: ${c.id})`).join('\n') || '- В выбранной книге нет глав или книга не выбрана.'}

АКТИВНЫЕ ИСТОЧНИКИ (ВАША СВЕРХТОЧНАЯ БАЗА ЗНАНИЙ):
${contextPrefix}

ТЕКУЩЕЕ СОСТОЯНИЕ ВЫБОЯ:
Целевая книга ID: ${selectedBookId || 'Не выбрана'}
Целевая глава ID: ${selectedChapterId || 'Не выбрана'}

ПРАВИЛА ОТВЕТОВ:
- Отвечайте строго на русском языке в авторитетном, вежливом и структурированном стиле.
- Старайтесь быть максимально проактивным: если пользователь просит вас сделать какую-то работу по синтезу знаний ("напиши статью", "поправь это в статье", "сделай схему", "выключи лог-файл и сделай FAQ"), сразу же пишите развернутый ответ и ОБЯЗАТЕЛЬНО возвращайте нужный маркер [[CMD:...]], чтобы веб-интерфейс сразу отобразил процесс и результат!`;

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

      const callConfig: any = { signal: controller.signal };
      if (isThinkingEnabled && activeChatModel === 'gemini-3.1-pro-preview') {
        callConfig.thinkingConfig = { thinkingLevel: 'HIGH' };
      }

      const response = await callGemini(activeChatModel, fullMessages, callConfig);
      clearTimeout(timeoutId);

      // Парсинг команд прямо из потока ответа ИИ
      const rawText = response.text || '';
      const actions: ActionDescriptor[] = [];
      const cmdRegex = /\[\[CMD:([^\]]+)\]\]/g;
      let match;
      let cleanText = rawText;

      while ((match = cmdRegex.exec(rawText)) !== null) {
        const fullCmd = match[1];
        const parts = fullCmd.split('|');
        const actionType = parts[0].trim();
        
        try {
          if (actionType === 'GENERATE_ARTICLE') {
            const goal = parts[1] ? parts[1].trim() : '';
            actions.push({ type: 'GENERATE_ARTICLE', label: 'Запуск генерации основной статьи', param: goal });
            onGenerateArticle(goal || undefined);
          } else if (actionType === 'REFINE_ARTICLE') {
            const instruction = parts[1] ? parts[1].trim() : '';
            actions.push({ type: 'REFINE_ARTICLE', label: 'Запуск уточнения / редактирования статьи', param: instruction });
            onRefineArticle(instruction);
          } else if (actionType === 'GENERATE_MINDMAP') {
            actions.push({ type: 'GENERATE_MINDMAP', label: 'Синтез интерактивной ментальной карты (Mindmap)' });
            onGenerateMindmap();
          } else if (actionType === 'GENERATE_FAQ') {
            actions.push({ type: 'GENERATE_FAQ', label: 'Подготовка блока вопросов и ответов (FAQ)' });
            onGenerateFAQ();
          } else if (actionType === 'GENERATE_MERMAID') {
            actions.push({ type: 'GENERATE_MERMAID', label: 'Отрисовка технической Mermaid-схемы' });
            onGenerateMermaid();
          } else if (actionType === 'SELECT_BOOK') {
            const bookIdStr = parts[1] ? parts[1].trim() : '';
            const bookId = bookIdStr ? Number(bookIdStr) : null;
            if (!isNaN(bookId as any)) {
              const bookName = books.find((b: any) => b.id === bookId)?.name || `ID ${bookId}`;
              actions.push({ type: 'SELECT_BOOK', label: `Установка целевой книги: "${bookName}"`, param: bookIdStr });
              onSelectBook(bookId);
            }
          } else if (actionType === 'SELECT_CHAPTER') {
            const chapIdStr = parts[1] ? parts[1].trim() : '';
            const chapId = chapIdStr ? Number(chapIdStr) : null;
            if (!isNaN(chapId as any)) {
              const chapName = chapters.find((c: any) => c.id === chapId)?.name || `ID ${chapId}`;
              actions.push({ type: 'SELECT_CHAPTER', label: `Установка целевой главы: "${chapName}"`, param: chapIdStr });
              onSelectChapter(chapId);
            }
          } else if (actionType === 'TOGGLE_SOURCE') {
            const sourceName = parts[1] ? parts[1].trim() : '';
            const statusVal = parts[2] ? parts[2].trim().toLowerCase() === 'true' : true;
            actions.push({ type: 'TOGGLE_SOURCE', label: `${statusVal ? 'Включение' : 'Выключение'} источника "${sourceName}"`, param: sourceName });
            onToggleSource(sourceName, statusVal);
          }
        } catch (dispatchErr) {
          console.error('[Action Dispatch Error]', dispatchErr);
        }
      }

      // Удаляем маркеры команд из текста во избежание визуального мусора
      cleanText = cleanText.replace(/\[\[CMD:[^\]]+\]\]/g, '').trim();

      setMessages((prev) => [...prev, { role: 'model', content: cleanText, actions }]);
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

          {/* Chat Setup Bar */}
          <div className="bg-white border-b-2 border-editorial-text p-2.5 flex flex-col gap-2 shrink-0">
            {/* Model & Thinking Selector */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">ИИ Модель:</span>
                <select
                  value={activeChatModel}
                  onChange={(e) => {
                    const selected = e.target.value as GeminiModelId;
                    setActiveChatModel(selected);
                    if (selected !== 'gemini-3.1-pro-preview') {
                      setIsThinkingEnabled(false);
                    }
                  }}
                  className="text-[10px] font-bold uppercase bg-gray-100 border border-gray-305 py-0.5 px-1.5 focus:outline-none focus:ring-1 focus:ring-editorial-text rounded-none text-editorial-text"
                >
                  <option value="gemini-3.1-flash-lite">Быстрая (Flash-Lite)</option>
                  <option value="gemini-3.5-flash">Общая (3.5 Flash)</option>
                  <option value="gemini-3.1-pro-preview">Глубокая (Pro Preview)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isThinkingEnabled}
                    disabled={activeChatModel !== 'gemini-3.1-pro-preview'}
                    onChange={(e) => setIsThinkingEnabled(e.target.checked)}
                    className="w-3.5 h-3.5 border-2 border-editorial-text text-editorial-text rounded-none focus:ring-0 cursor-pointer accent-editorial-text"
                  />
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${activeChatModel !== 'gemini-3.1-pro-preview' ? 'text-gray-300' : 'text-editorial-text font-bold'}`} title="Режим глубоких рассуждений доступен только для Pro Preview">
                    Рассуждения 🧠
                  </span>
                </label>
              </div>
            </div>

            {/* Chatbot Role Selection */}
            <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-100 pt-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Роль ИИ:</span>
              <div className="flex gap-1 flex-wrap">
                {(['assistant', 'architect', 'critic', 'devops'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setChatbotRole(role)}
                    className={`px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tight transition-all border ${
                      chatbotRole === role 
                        ? 'border-editorial-text bg-editorial-accent/30 text-editorial-text shadow-sm' 
                        : 'border-gray-200 text-gray-450 hover:border-editorial-text bg-gray-50'
                    }`}
                  >
                    {role === 'assistant' ? 'Ассистент' :
                     role === 'architect' ? 'Архитектор' :
                     role === 'critic' ? 'Рецензент' : 'DevOps'}
                  </button>
                ))}
              </div>
            </div>
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
                
                {/* Системные действия ИИ-Агента */}
                {msg.role === 'model' && msg.actions && msg.actions.length > 0 && (
                  <div className="ml-11 flex flex-col gap-1.5 max-w-[80%] my-1 w-full sm:w-auto">
                    <div className="text-[9px] uppercase tracking-wider font-mono font-bold text-gray-400">
                      ⚡ Команды ИИ-Агента:
                    </div>
                    <div className="flex flex-col gap-1 bg-yellow-50/40 border border-yellow-200/60 rounded p-2.5">
                      {msg.actions.map((act, actIdx) => {
                        let Icon = CheckSquare;
                        if (act.type.includes('ARTICLE')) Icon = FileText;
                        else if (act.type.includes('MINDMAP')) Icon = Brain;
                        else if (act.type.includes('FAQ')) Icon = HelpCircle;
                        else if (act.type.includes('MERMAID')) Icon = Workflow;
                        else if (act.type.includes('BOOK') || act.type.includes('CHAPTER')) Icon = BookOpen;
                        else if (act.type.includes('SOURCE')) Icon = Layers;

                        return (
                          <div 
                            key={actIdx} 
                            className="flex items-center gap-2 text-[11px] text-gray-700 py-1 border-b border-gray-100 last:border-0 last:pb-0 first:pt-0"
                          >
                            <Icon size={12} className="text-editorial-text shrink-0" />
                            <span className="font-semibold text-editorial-text">{act.label}</span>
                            {act.param && (
                              <span className="text-gray-500 truncate italic max-w-[120px] sm:max-w-xs" title={act.param}>
                                ({act.param})
                              </span>
                            )}
                            <span className="ml-auto text-[8px] uppercase font-bold tracking-wider text-green-600 bg-green-50 px-1 rounded border border-green-200 shrink-0">
                              Выполнено
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                  accept=".pdf,.txt,.md,.html,.png,.jpg,.jpeg,.webp,.gif" 
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
