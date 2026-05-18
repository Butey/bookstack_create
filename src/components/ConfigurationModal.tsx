import { motion, AnimatePresence } from 'motion/react';
import { FileText, Terminal, ClipboardList, Brain, Loader2 } from 'lucide-react';
import { GEMINI_MODELS, GeminiModelId } from '../services/gemini';
import { BookStackCredentials } from '../types';

interface ConfigurationModalProps {
  isOpen: boolean;
  systemInstruction: string;
  setSystemInstruction: (val: string) => void;
  dataStructure: string;
  setDataStructure: (val: string) => void;
  workMode: 'auto' | 'review';
  setWorkMode: (mode: 'auto' | 'review') => void;
  geminiModel: GeminiModelId;
  setGeminiModel: (id: GeminiModelId) => void;
  credentials: BookStackCredentials;
  setCredentials: (creds: BookStackCredentials) => void;
  serverConfig: { hasEnvCredentials: boolean; envBaseUrl: string } | null;
  handleSpecialFileUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => void;
  loadBooks: () => void;
  isLoadingBooks: boolean;
}

export function ConfigurationModal({
  isOpen,
  systemInstruction, setSystemInstruction,
  dataStructure, setDataStructure,
  workMode, setWorkMode,
  geminiModel, setGeminiModel,
  credentials, setCredentials,
  serverConfig,
  handleSpecialFileUpload,
  loadBooks,
  isLoadingBooks
}: ConfigurationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
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
                  onChange={(e) => setSystemInstruction(e.target.value)}
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
                  onChange={(e) => setDataStructure(e.target.value)}
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
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] block">Модель Gemini</label>
                <div className="grid grid-cols-1 gap-2">
                  {GEMINI_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setGeminiModel(m.id)}
                      className={`px-4 py-3 border-2 flex items-start gap-3 text-left transition-all ${geminiModel === m.id ? 'border-editorial-text bg-editorial-accent/10 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                    >
                      <Brain size={14} className={`mt-0.5 shrink-0 ${geminiModel === m.id ? 'text-editorial-text' : ''}`} />
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider leading-tight">{m.label}</div>
                        <div className="text-[9px] mt-0.5 opacity-70">{m.description}</div>
                      </div>
                    </button>
                  ))}
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
                  <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest mt-1">Определено в .env</p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">BookStack Token ID</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm font-mono disabled:opacity-50"
                  value={credentials.tokenId}
                  onChange={(e) => setCredentials({ ...credentials, tokenId: e.target.value })}
                  disabled={serverConfig?.hasEnvCredentials}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">BookStack Token Secret</label>
                <input 
                  type="password" 
                  className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm font-mono disabled:opacity-50"
                  value={credentials.tokenSecret}
                  onChange={(e) => setCredentials({ ...credentials, tokenSecret: e.target.value })}
                  disabled={serverConfig?.hasEnvCredentials}
                />
              </div>
            </div>
            <button 
              onClick={loadBooks}
              className="w-full py-4 bg-editorial-text text-white text-xs uppercase tracking-widest font-bold hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
            >
              {isLoadingBooks ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
              Проверить и Сохранить
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
