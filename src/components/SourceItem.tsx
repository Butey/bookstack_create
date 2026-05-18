import { motion } from 'motion/react';
import { Eye, X } from 'lucide-react';

interface SourceItemProps {
  name: string;
  content: string;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onDelete: () => void;
}

export function SourceItem({ name, content, selected, onToggle, onPreview, onDelete }: SourceItemProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`px-3 py-2 border flex items-center justify-between group transition-colors ${selected ? 'bg-white border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)]' : 'bg-gray-50 border-gray-200 opacity-60'}`}
    >
      <div className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer" onClick={onToggle}>
        <div className="relative flex items-center">
          <input 
            type="checkbox" 
            checked={selected}
            onChange={onToggle}
            className="w-4 h-4 rounded-none border-editorial-text text-editorial-text focus:ring-0 cursor-pointer appearance-none border-2 checked:bg-editorial-text transition-all"
            onClick={(e) => e.stopPropagation()}
          />
          {selected && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white text-[10px] font-bold">✓</div>}
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest truncate leading-none">
              {name}
            </span>
            {selected && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Источник активен" />
            )}
          </div>
          <span className="text-[8px] font-mono text-gray-400 leading-none mt-1">
            {(content?.length || 0).toLocaleString()} симв.
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-1 shrink-0 ml-4">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="p-1.5 hover:bg-editorial-accent/20 rounded transition-colors text-gray-400 hover:text-editorial-text"
          title="Просмотр"
        >
          <Eye size={12} />
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-500"
          title="Удалить"
        >
          <X size={12} />
        </button>
      </div>
    </motion.div>
  );
}
