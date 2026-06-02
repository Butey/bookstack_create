import { motion } from 'motion/react';
import { Eye, X, Book, User, Calendar, AlertCircle, Copy } from 'lucide-react';
import { SourceMetadata } from '../types';

interface SourceItemProps {
  name: string;
  content: string;
  selected: boolean;
  metadata?: SourceMetadata;
  isDuplicate?: boolean;
  isContext?: boolean;
  duplicateReference?: string;
  onToggle: () => void;
  onPreview: () => void;
  onDelete: () => void;
}

export function SourceItem({ name, content, selected, metadata, isDuplicate, isContext, duplicateReference, onToggle, onPreview, onDelete }: SourceItemProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`px-3 py-2 border flex items-center justify-between group transition-colors relative ${
        isDuplicate 
          ? 'bg-amber-50/30 border-amber-200' 
          : isContext 
            ? 'bg-blue-50/20 border-blue-100'
            : selected 
              ? 'bg-white border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,0.1)]' 
              : 'bg-gray-50 border-gray-200 opacity-60'
      }`}
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
              {metadata?.title || name}
            </span>
            {selected && !isDuplicate && !isContext && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Источник активен" />
            )}
            {isDuplicate && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-[2px] shadow-sm ml-1" title={duplicateReference ? `Дубликат статьи: ${duplicateReference}` : "Обнаружен дубликат статьи"}>
                <Copy size={8} />
                <span className="text-[7px] font-bold uppercase tracking-wider">Duplicate</span>
              </div>
            )}
            {isContext && !isDuplicate && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-[2px] shadow-sm ml-1" title="Найден релевантный контекст в Wiki">
                <Book size={8} />
                <span className="text-[7px] font-bold uppercase tracking-wider">Context Found</span>
              </div>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            <span className="text-[8px] font-mono text-gray-400 leading-none">
              {(content?.length || 0).toLocaleString()} симв.
            </span>
            
            {metadata && (metadata.author || metadata.creationDate) && (
              <div className="flex items-center gap-2 border-l border-gray-200 pl-3">
                {metadata.author && (
                  <div className="flex items-center gap-1 text-gray-400" title={`Автор: ${metadata.author}`}>
                    <User size={8} />
                    <span className="text-[8px] truncate max-w-[80px]">{metadata.author}</span>
                  </div>
                )}
                {metadata.creationDate && (
                  <div className="flex items-center gap-1 text-gray-400" title={`Создано: ${metadata.creationDate}`}>
                    <Calendar size={8} />
                    <span className="text-[8px]">{metadata.creationDate}</span>
                  </div>
                )}
              </div>
            )}
          </div>
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
