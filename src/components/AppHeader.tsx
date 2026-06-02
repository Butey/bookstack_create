import { MessageSquare, Terminal, Settings, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BookStackCredentials } from '../types';

interface AppHeaderProps {
  credentials: BookStackCredentials;
  isChatOpen: boolean;
  setIsChatOpen: (v: boolean) => void;
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  isConfigOpen: boolean;
  setIsConfigOpen: (v: boolean) => void;
  isSyncing?: boolean;
  syncProgress?: { step: number; total: number; label: string };
}

export function AppHeader({
  credentials,
  isChatOpen, setIsChatOpen,
  isConsoleOpen, setIsConsoleOpen,
  isConfigOpen, setIsConfigOpen,
  isSyncing,
  syncProgress
}: AppHeaderProps) {
  const percent = (syncProgress && syncProgress.total > 0) 
    ? Math.round((syncProgress.step / syncProgress.total) * 100) 
    : 0;

  return (
    <nav className="border-b-2 border-editorial-text sticky top-0 z-10 bg-editorial-bg/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-10 h-20 flex items-baseline justify-between overflow-hidden">
        <div className="flex items-baseline gap-4 pt-6">
          <h1 className="font-serif text-4xl font-bold tracking-tight">Bridge.LM</h1>
          <span className="accent-pill">NotebookLM ↔ BookStack</span>
        </div>
        
        <div className="flex items-center gap-6">
          <AnimatePresence>
            {isSyncing && syncProgress && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-full"
              >
                <Loader2 size={12} className="animate-spin text-editorial-text" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-tight text-gray-400">Статус Агента</span>
                  <span className="text-[10px] font-bold text-editorial-text truncate max-w-[200px]">
                    {syncProgress.label || 'Обработка...'}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200">
                  <span className="text-[10px] font-mono font-bold text-editorial-text">{percent}%</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-editorial-text hover:text-gray-500 transition-colors"
          >
            <MessageSquare size={16} />
            Чат с агентом
          </button>
          <div className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold">
            <span className={`w-2 h-2 rounded-full ${credentials.baseUrl ? 'bg-green-500' : 'bg-red-500'}`}></span>
            {credentials.baseUrl ? 'Соединение' : 'Ожидание'}
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

        {/* Global Progress Line Bar */}
        <AnimatePresence>
          {isSyncing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: '4px', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="absolute bottom-[-2px] left-0 right-0 bg-gray-100 z-20 pointer-events-none"
            >
              <motion.div
                className="h-full bg-editorial-text relative"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
              >
                {/* Moving shine effect */}
                <motion.div
                  className="absolute top-0 bottom-0 w-32 bg-white/40 blur-md"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
