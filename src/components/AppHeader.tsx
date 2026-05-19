import { MessageSquare, Terminal, Settings } from 'lucide-react';
import { BookStackCredentials } from '../types';

interface AppHeaderProps {
  credentials: BookStackCredentials;
  isChatOpen: boolean;
  setIsChatOpen: (v: boolean) => void;
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  isConfigOpen: boolean;
  setIsConfigOpen: (v: boolean) => void;
}

export function AppHeader({
  credentials,
  isChatOpen, setIsChatOpen,
  isConsoleOpen, setIsConsoleOpen,
  isConfigOpen, setIsConfigOpen
}: AppHeaderProps) {
  return (
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
  );
}
