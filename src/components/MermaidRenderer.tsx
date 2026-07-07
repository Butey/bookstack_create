import { useEffect, useRef, useState } from 'react';

interface MermaidRendererProps {
  code: string;
}

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    
    let isMounted = true;
    const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
    
    const renderDiagram = async () => {
      try {
        setError(null);
        const cleanCode = code.trim();
        
        // Dynamically load mermaid to prevent heavy static import analysis during Vite build
        const { default: mermaid } = await import('mermaid');
        
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'Inter, system-ui, sans-serif'
        });

        const { svg: renderedSvg } = await mermaid.render(uniqueId, cleanCode);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        console.error('Failed to render mermaid diagram:', err);
        if (isMounted) {
          setError(err.message || String(err));
          const badElement = document.getElementById(uniqueId);
          if (badElement) {
            badElement.remove();
          }
        }
      }
    };

    renderDiagram();
    
    return () => {
      isMounted = false;
    };
  }, [code]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-mono rounded whitespace-pre-wrap overflow-x-auto">
        <p className="font-bold mb-1">Ошибка рендеринга Mermaid:</p>
        <p className="opacity-80 leading-relaxed">{error}</p>
        <pre className="mt-2 p-2 bg-red-100/50 text-[10px] text-red-900 border border-red-200">{code}</pre>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="w-full flex justify-center bg-white border border-gray-100 p-4 overflow-x-auto custom-scrollbar"
      dangerouslySetInnerHTML={{ __html: svg || '<div class="text-xs text-gray-400 animate-pulse py-4 font-mono">Рендеринг диаграммы...</div>' }}
    />
  );
}
