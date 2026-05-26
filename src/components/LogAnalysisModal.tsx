import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, X, Copy, Check, FileDown, Plus } from 'lucide-react';
import { AEMarkdown } from './AEMarkdown';

interface LogAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: string | null;
  logName: string;
  onInsertToDraft?: (markdown: string) => void;
}

export function LogAnalysisModal({ isOpen, onClose, report, logName, onInsertToDraft }: LogAnalysisModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/20 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-4xl h-[85vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-editorial-text flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="text-red-500 animate-pulse" size={18} />
              <div className="flex flex-col">
                <h3 className="font-serif font-bold text-gray-900 text-lg leading-none">Экспресс-анализ логов</h3>
                <span className="text-[9px] font-mono text-gray-400 mt-1 uppercase tracking-wider">Файл: {logName}</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-editorial-accent transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Report Content */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-[#FAF9F6]">
            <article className="prose prose-sm max-w-none text-gray-800 leading-relaxed AEMarkdown-content">
              <AEMarkdown>{report}</AEMarkdown>
            </article>
          </div>

          {/* Footer Controls */}
          <div className="p-4 bg-white border-t border-editorial-text flex flex-wrap justify-between gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="px-4 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center gap-2"
            >
              {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
              {copied ? 'Скопировано!' : 'Скопировать отчет'}
            </button>

            <div className="flex gap-2">
              {onInsertToDraft && (
                <button
                  onClick={() => {
                    const wrapText = `\n\n## Результаты анализа логов (${logName})\n\n${report}\n`;
                    onInsertToDraft(wrapText);
                    onClose();
                  }}
                  className="px-6 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-editorial-accent transition-all flex items-center gap-2"
                >
                  <Plus size={14} />
                  Вставить в черновик
                </button>
              )}
              
              <button
                onClick={onClose}
                className="px-6 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all"
              >
                Закрыть
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
