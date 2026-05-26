import { useState } from 'react';
import { motion } from 'motion/react';
import { GitBranch, X, Code, Copy, Check, Download, Send } from 'lucide-react';
import { MermaidRenderer } from './MermaidRenderer';

interface MermaidModalProps {
  mermaidData: { code: string };
  setMermaidData: (v: null) => void;
  handleSync: (md?: string) => void;
  onInsertToPage?: (md: string) => void;
}

export function MermaidModal({ mermaidData, setMermaidData, handleSync, onInsertToPage }: MermaidModalProps) {
  const [code, setCode] = useState(mermaidData.code);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSVG = () => {
    // We can extract the rendered SVG inside the preview window
    const svgElement = document.querySelector('.mermaid-modal-viewer svg');
    if (svgElement) {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = 'mermaid_diagram.svg';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } else {
      alert('Пожалуйста, подождите рендеринга диаграммы для скачивания SVG.');
    }
  };

  const wrapInMarkdownBlock = (raw: string) => {
    return `\n\n### Схема / Диаграмма процесса\n\n\`\`\`mermaid\n${raw.trim()}\n\`\`\`\n`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/20 backdrop-blur-sm"
      onClick={() => setMermaidData(null)}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-5xl h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-editorial-text flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="text-editorial-text" size={18} />
            <h3 className="font-serif font-bold text-gray-900">Интерактивный редактор Mermaid-схем</h3>
          </div>
          <button 
            onClick={() => setMermaidData(null)}
            className="p-2 hover:bg-editorial-accent transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-editorial-text/20 overflow-hidden bg-gray-50">
          {/* Left panel: Code Editor */}
          <div className="w-full md:w-5/12 flex flex-col h-1/2 md:h-full bg-white">
            <div className="p-3 border-b border-editorial-text/10 bg-gray-50 flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] flex items-center gap-1.5">
                <Code size={12} /> Код диаграммы (Mermaid.js)
              </span>
              <button
                onClick={handleCopy}
                className="p-1 px-2 border border-editorial-text/20 hover:border-editorial-text/50 rounded flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-gray-600 transition-all active:scale-95"
              >
                {copied ? <Check size={10} className="text-green-600" /> : <Copy size={10} />}
                {copied ? 'Скопировано!' : 'Копировать'}
              </button>
            </div>
            <textarea
              className="flex-1 p-4 font-mono text-xs text-gray-800 focus:outline-none resize-none leading-relaxed bg-gray-50/20"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Введите код Mermaid.js здесь..."
            />
          </div>

          {/* Right panel: Live Rendered Output */}
          <div className="w-full md:w-7/12 flex flex-col h-1/2 md:h-full bg-[#FAF9F6] relative">
            <div className="p-3 border-b border-editorial-text/10 bg-gray-50 flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">
                Живой предпросмотр схемы
              </span>
              <button
                onClick={handleDownloadSVG}
                className="p-1 px-2 border border-editorial-text/20 hover:border-editorial-text/50 rounded flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-gray-600 transition-all active:scale-95"
              >
                <Download size={10} />
                Скачать SVG
              </button>
            </div>
            <div className="flex-1 p-6 overflow-auto custom-scrollbar flex items-center justify-center mermaid-modal-viewer">
              {code.trim() ? (
                <MermaidRenderer code={code} />
              ) : (
                <span className="text-xs text-gray-400 font-mono">Код схемы пуст...</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-white border-t border-editorial-text flex flex-wrap justify-end gap-2 shrink-0">
          <button
            onClick={() => setMermaidData(null)}
            className="px-6 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-gray-100 transition-all"
          >
            Закрыть
          </button>
          
          {onInsertToPage && (
            <button
              onClick={() => {
                onInsertToPage(wrapInMarkdownBlock(code));
                setMermaidData(null);
              }}
              className="px-6 py-2 bg-white border-2 border-editorial-text text-editorial-text text-[10px] font-bold uppercase tracking-widest hover:bg-editorial-accent transition-all"
            >
              Вставить в черновик
            </button>
          )}

          <button
            onClick={() => {
              handleSync(wrapInMarkdownBlock(code));
              setMermaidData(null);
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
