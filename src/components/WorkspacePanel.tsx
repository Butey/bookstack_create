import React from 'react';
import { ExternalLink, Database, Plus, Trash2 } from 'lucide-react';
import { SourceItem } from './SourceItem';
import { Source } from '../types';
import { ProgressBar } from './ProgressBar';
import { AnimatePresence } from 'motion/react';

interface WorkspacePanelProps {
  sources: Source[];
  setSources: React.Dispatch<React.SetStateAction<Source[]>>;
  processFiles: (files: File[]) => Promise<void>;
  isDragging: boolean;
  setIsDragging: (val: boolean) => void;
  setPreviewSource: (val: {name: string, content: string} | null) => void;
  uploadProgress: { percent: number; label: string } | null;
}

export const WorkspacePanel = React.memo(function WorkspacePanel({
  sources,
  setSources,
  processFiles,
  isDragging,
  setIsDragging,
  setPreviewSource,
  uploadProgress
}: WorkspacePanelProps) {

  const totalChars = sources.reduce((acc, s) => s.selected !== false ? acc + (s.content?.length || 0) : acc, 0);

  const toggleSourceSelection = (index: number) => {
    setSources(prev => {
      const next = [...prev];
      next[index].selected = next[index].selected === false ? true : false;
      return next;
    });
  };

  const removeSource = (index: number) => {
    setSources(prev => prev.filter((_, i) => i !== index));
  };

  const selectAllSources = (selected: boolean) => {
    setSources(prev => prev.map(s => ({ ...s, selected })));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      await processFiles(filesArray);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h2 className="font-serif text-3xl italic tracking-tight">Рабочее пространство</h2>
            <p className="text-sm text-gray-500 max-w-lg">Синтез знаний. Перетащите PDF, HTML или текстовые источники ниже.</p>
          </div>
          <label className="flex items-center gap-2 px-4 py-2 border-2 border-editorial-text cursor-pointer hover:bg-[#1A1A1A] hover:text-white transition-all text-[10px] font-bold uppercase tracking-widest">
            <ExternalLink size={12} />
            Добавить источник
            <input 
              type="file" 
              className="hidden" 
              multiple 
              accept=".txt,.md,.pdf,.html"
              onChange={(e) => {
                if (e.target.files) {
                  processFiles(Array.from(e.target.files));
                }
              }} 
            />
          </label>
        </div>

        <div 
          className={`min-h-[200px] border-2 border-dashed transition-all p-6 ${isDragging ? 'border-editorial-text bg-editorial-accent/20 scale-[1.02]' : 'border-gray-200 bg-[#F5F5F3]'}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <AnimatePresence>
            {uploadProgress && (
              <ProgressBar percent={uploadProgress.percent} label={uploadProgress.label} />
            )}
          </AnimatePresence>

          {sources.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-editorial-text/10 pb-2">
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-editorial-text">
                    Источники ({sources.filter(s => s.selected !== false).length}/{sources.length})
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => selectAllSources(true)}
                      className="text-[8px] font-bold uppercase tracking-tight text-editorial-text/60 hover:text-editorial-text"
                    >
                      Выбрать все
                    </button>
                    <button 
                      onClick={() => selectAllSources(false)}
                      className="text-[8px] font-bold uppercase tracking-tight text-editorial-text/60 hover:text-editorial-text"
                    >
                      Снять все
                    </button>
                  </div>
                </div>
                <span className="text-[8px] font-mono text-gray-400">
                  ~{(totalChars / 4).toFixed(0)} токенов
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {sources.map((source, index) => (
                  <SourceItem
                    key={index}
                    name={source.name}
                    content={source.content}
                    metadata={source.metadata}
                    isDuplicate={source.isDuplicate}
                    duplicateReference={source.duplicateReference}
                    selected={source.selected !== false}
                    onToggle={() => toggleSourceSelection(index)}
                    onDelete={() => removeSource(index)}
                    onPreview={() => setPreviewSource(source)}
                  />
                ))}
              </div>
              
              <div className="flex justify-end pt-4 border-t border-gray-200">
                <button 
                  onClick={() => setSources([])}
                  className="w-full py-2 border border-dashed border-red-200 text-[9px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-50 transition-colors"
                >
                  Очистить список
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex flex-col items-center justify-center text-gray-400 gap-4 pointer-events-none">
              <Database size={48} className="text-gray-300" />
              <div className="text-center">
                <p className="text-[12px] font-bold uppercase tracking-widest text-[#1A1A1A]">Drop Zone</p>
                <p className="text-[10px] uppercase tracking-widest mt-1">Отпустите файлы сюда</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
