import { motion } from 'motion/react';
import { FileText, X, Terminal, User, Calendar, Book } from 'lucide-react';
import { Source } from '../types';

interface PreviewModalProps {
  previewSource: Source;
  setPreviewSource: (v: null) => void;
  onAnalyzeLogs?: (content: string, name: string) => void;
}

export function PreviewModal({ previewSource, setPreviewSource, onAnalyzeLogs }: PreviewModalProps) {
  return (
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
          <div className="flex flex-col gap-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <FileText className="text-editorial-text" size={18} />
              <h3 className="font-serif font-bold text-gray-900 truncate">{previewSource.metadata?.title || previewSource.name}</h3>
            </div>
            {previewSource.metadata && (previewSource.metadata.author || previewSource.metadata.creationDate) && (
              <div className="flex items-center gap-4 text-[9px] text-gray-400 uppercase tracking-widest pl-6">
                {previewSource.metadata.author && (
                  <div className="flex items-center gap-1">
                    <User size={10} />
                    <span>{previewSource.metadata.author}</span>
                  </div>
                )}
                {previewSource.metadata.creationDate && (
                  <div className="flex items-center gap-1">
                    <Calendar size={10} />
                    <span>{previewSource.metadata.creationDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <button 
            onClick={() => setPreviewSource(null)}
            className="p-2 hover:bg-editorial-accent transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar min-h-0">
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words leading-relaxed select-text">
            {previewSource.content}
          </pre>
        </div>
        <div className="p-4 bg-gray-50 border-t border-editorial-text flex justify-between items-center gap-2">
          {onAnalyzeLogs ? (
            <button
              onClick={() => onAnalyzeLogs(previewSource.content, previewSource.name)}
              className="px-4 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-100 hover:text-red-600 transition-all flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            >
              <Terminal size={14} className="text-red-500" />
              Анализировать как лог
            </button>
          ) : <div />}
          
          <button
            onClick={() => setPreviewSource(null)}
            className="px-6 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-gray-800 transition-all shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
          >
            Закрыть
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
