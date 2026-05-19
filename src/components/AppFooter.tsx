export function AppFooter() {
  return (
    <footer className="max-w-6xl mx-auto px-10 pt-12">
      <div className="border-t-2 border-editorial-text pt-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-4">
          Активность модуля
          <span className="w-1 h-1 bg-editorial-text rounded-full"></span>
        </div>
        <div className="flex gap-8 overflow-hidden whitespace-nowrap text-[11px] italic text-gray-500">
           <p>Gemini AI Активен</p>
           <p className="opacity-20">•</p>
           <p>BookStack Proxy v1.1.0</p>
           <p className="opacity-20">•</p>
           <p>Secure Token Auth Ready</p>
        </div>
        <div className="text-[10px] font-mono opacity-50 uppercase tracking-tighter">
          v1.1.0-ru
        </div>
      </div>
    </footer>
  );
}
