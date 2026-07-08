/**
 * Утилита для динамической загрузки тяжелых библиотек из CDN.
 * Это позволяет полностью исключить их из процесса сборки Vite,
 * экономя до 90% оперативной памяти (ОЗУ) на слабых серверах (OOM Prevention).
 */

export function loadScript(url: string, globalName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any)[globalName]) {
      resolve((window as any)[globalName]);
      return;
    }

    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      const handleLoad = () => resolve((window as any)[globalName]);
      const handleError = (e: any) => reject(e);
      existing.addEventListener('load', handleLoad);
      existing.addEventListener('error', handleError);
      return;
    }

    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => {
      resolve((window as any)[globalName]);
    };
    script.onerror = (e) => {
      reject(new Error(`Failed to load external dependency from CDN: ${url}`));
    };
    document.head.appendChild(script);
  });
}

export async function loadMermaid(): Promise<any> {
  // Загружаем mermaid.js из надежного CDN jsDelivr
  return loadScript('https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js', 'mermaid');
}

export async function loadD3(): Promise<any> {
  // Загружаем d3.js из надежного CDN jsDelivr
  return loadScript('https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js', 'd3');
}
