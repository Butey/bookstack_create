import { motion } from 'motion/react';
import { Brain, X } from 'lucide-react';

interface RagConfirmationModalProps {
  ragConfirmation: any; // { pageName, pageId, bookId, allSourcesText, analysis }
  setRagConfirmation: (v: null) => void;
  handleRagChoice: (choice: boolean, config: any) => void;
  executionControl: any;
  baseUrl: string;
}

export function RagConfirmationModal({
  ragConfirmation, setRagConfirmation, handleRagChoice, executionControl, baseUrl
}: RagConfirmationModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-text/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border-2 border-editorial-text shadow-[12px_12px_0px_0px_rgba(26,26,26,1)] w-full max-w-xl flex flex-col"
      >
        <div className="flex justify-between items-center p-4 border-b-2 border-editorial-text bg-editorial-bg">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-editorial-text" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-editorial-text">Релевантная статья найдена</h3>
          </div>
          <button 
            onClick={() => { setRagConfirmation(null); executionControl.setIsSyncing(false); executionControl.setSyncStatus({ type: 'idle', message: 'Операция отменена' }); }}
            className="p-1 hover:bg-gray-100 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-8 pb-10">
          <p className="text-sm mb-4 leading-relaxed">
            {ragConfirmation.analysis?.decision === 'update' 
              ? 'Агент проанализировал ваши источники и обнаружил в Wiki релевантную статью для обновления:'
              : 'Агент предлагает создать новую статью, но нашел в Wiki похожие или косвенно связанные статьи:'}
          </p>
          
          {ragConfirmation.analysis?.decision === 'update' && (
            <div className="p-4 bg-editorial-accent/10 border-l-4 border-editorial-text mb-6">
              <p className="font-bold text-lg mb-2">
                <a href={ragConfirmation.analysis?.retrievedContext?.find((p: any) => p.id === ragConfirmation.pageId)?.url || `${baseUrl}/books/${ragConfirmation.bookId}/page/${ragConfirmation.pageId}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {ragConfirmation.pageName}
                </a>
              </p>
              
              {ragConfirmation.analysis?.retrievedContext?.find((p: any) => p.id === ragConfirmation.pageId)?.snippet && (
                <div className="mt-4 pt-4 border-t border-editorial-text/20">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Обнаруженный контекст:</p>
                  <div 
                    className="text-xs text-gray-700 italic prose prose-sm max-h-32 overflow-y-auto custom-scrollbar pr-2"
                    dangerouslySetInnerHTML={{ 
                      __html: (() => {
                        const snippet = ragConfirmation.analysis.retrievedContext.find((p: any) => p.id === ragConfirmation.pageId)?.snippet;
                        return (typeof snippet === 'object' && snippet !== null) ? (snippet.content || snippet.text || JSON.stringify(snippet)) : String(snippet || '');
                      })()
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {ragConfirmation.analysis?.relatedPages && ragConfirmation.analysis.relatedPages.filter((p: any) => p.id !== ragConfirmation.pageId).length > 0 && (
            <div className="mb-6 p-4 border border-editorial-text/20 bg-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                 Найдены возможные дубликаты ({ragConfirmation.analysis.relatedPages.filter((p: any) => p.id !== ragConfirmation.pageId).length}):
              </p>
              <ul className="text-sm list-none font-medium flex flex-col gap-2">
                 {ragConfirmation.analysis.relatedPages.filter((p: any) => p.id !== ragConfirmation.pageId).map((page: any) => (
                     <li key={page.id} className="flex gap-2 items-center">
                        <span className="text-editorial-text">•</span>
                        <a href={page.url || `${baseUrl}/books/${page.book_id}/page/${page.id}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                           {page.name}
                        </a>
                     </li>
                 ))}
              </ul>
            </div>
          )}

          <p className="text-sm mb-6 font-serif italic text-gray-600">
            Вы хотите обновить/дополнить основную статью вашей новой информацией (и объединить туда данные при множестве дубликатов), или всё равно создать совершенно новую статью?
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => handleRagChoice(true, ragConfirmation)}
              className="flex-1 py-4 bg-editorial-text text-white font-bold uppercase tracking-widest text-xs hover:bg-black transition-colors"
            >
              Обновить эту статью
            </button>
            <button
              onClick={() => handleRagChoice(false, ragConfirmation)}
              className="flex-1 py-4 bg-white border-2 border-editorial-text text-editorial-text font-bold uppercase tracking-widest text-xs hover:bg-gray-50 transition-colors"
            >
              Создать новую
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
