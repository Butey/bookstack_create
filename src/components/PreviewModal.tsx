import { motion } from 'motion/react';
import { FileText, X } from 'lucide-react';

interface PreviewModalProps {
  previewSource: { name: string; content: string };
  setPreviewSource: (v: null) => void;
}

export function PreviewModal({ previewSource, setPreviewSource }: PreviewModalProps) {
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
        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar min-h-0">
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words leading-relaxed select-text">
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
  );
}
