import { motion } from 'motion/react';
import { Brain, X, Send } from 'lucide-react';
import { InteractiveMindmap, parseMarkdownListToTree } from './InteractiveMindmap';

interface MindmapModalProps {
  mindmapData: { md: string };
  setMindmapData: (v: null) => void;
  handleSync: (md?: string) => void;
}

export function MindmapModal({ mindmapData, setMindmapData, handleSync }: MindmapModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/20 backdrop-blur-sm"
      onClick={() => setMindmapData(null)}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-4xl h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-editorial-text flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <Brain className="text-editorial-text" size={18} />
            <h3 className="font-serif font-bold text-gray-900">Интерактивный Mindmap</h3>
          </div>
          <button 
            onClick={() => setMindmapData(null)}
            className="p-2 hover:bg-editorial-accent transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 bg-gray-50 overflow-hidden relative">
          <InteractiveMindmap data={parseMarkdownListToTree(mindmapData.md)} />
        </div>
        <div className="p-4 bg-white border-t border-editorial-text flex justify-end gap-2 shrink-0">
          <button
            onClick={() => setMindmapData(null)}
            className="px-6 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-gray-100 transition-all"
          >
            Закрыть
          </button>
          <button
            onClick={() => {
              handleSync(mindmapData.md);
              setMindmapData(null);
            }}
            className="px-6 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2"
          >
            <Send size={14} />
            В BookStack
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
