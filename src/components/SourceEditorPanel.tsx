import { ClipboardList } from 'lucide-react';
import { WorkspacePanel } from './WorkspacePanel';
import { ConfigurationModal } from './ConfigurationModal';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { indexVectorDocument } from '../services/api';
import { GeminiModelId } from '../services/gemini';

interface SourceEditorPanelProps {
  onSaveSettings?: () => void;
  activeSkills: Record<string, boolean>;
  setActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  defaultActiveSkills: Record<string, boolean>;
  setDefaultActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  // Config Modal Props
  isConfigOpen: boolean;
  setIsConfigOpen: (v: boolean) => void;
  systemInstruction: string;
  setSystemInstruction: (v: string) => void;
  dataStructure: string;
  setDataStructure: (v: string) => void;
  searchPrompt: string;
  setSearchPrompt: (v: string) => void;
  duplicatePrompt: string;
  setDuplicatePrompt: (v: string) => void;
  contextPrompt: string;
  setContextPrompt: (v: string) => void;
  workMode: 'auto' | 'review';
  setWorkMode: (v: 'auto' | 'review') => void;
  geminiModel: GeminiModelId;
  setGeminiModel: (v: GeminiModelId) => void;
  credentials: any;
  setCredentials: (v: any) => void;
  omnideskCreds: any;
  setOmnideskCreds: (v: any) => void;
  serverConfig: any;
  handleSpecialFileUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => Promise<void>;
  loadBooks: () => void;
  isLoadingBooks: boolean;

  // Workspace Props
  sources: any[];
  setSources: (v: any) => void;
  processFiles: (files: File[]) => Promise<void>;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  setPreviewSource: (v: any) => void;
  uploadProgress: { percent: number; label: string } | null;
  pdfExtractionMode: 'gemini' | 'markitdown';
  setPdfExtractionMode: (v: 'gemini' | 'markitdown') => void;

  // SourceEditor Props
  executionControl: any;
  instructions: string;
  setInstructions: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  customPresets: any[];
  setCustomPresets: React.Dispatch<React.SetStateAction<any[]>>;
  selectedPreset: string;
  setSelectedPreset: React.Dispatch<React.SetStateAction<string>>;
}

export function SourceEditorPanel(props: SourceEditorPanelProps) {
  return (
    <div className="lg:col-span-8 flex flex-col gap-8">
      <ConfigurationModal
        isOpen={props.isConfigOpen}
        systemInstruction={props.systemInstruction}
        setSystemInstruction={props.setSystemInstruction}
        dataStructure={props.dataStructure}
        setDataStructure={props.setDataStructure}
        searchPrompt={props.searchPrompt}
        setSearchPrompt={props.setSearchPrompt}
        duplicatePrompt={props.duplicatePrompt}
        setDuplicatePrompt={props.setDuplicatePrompt}
        contextPrompt={props.contextPrompt}
        setContextPrompt={props.setContextPrompt}
        workMode={props.workMode}
        setWorkMode={props.setWorkMode}
        geminiModel={props.geminiModel}
        setGeminiModel={props.setGeminiModel}
        credentials={props.credentials}
        setCredentials={props.setCredentials}
        omnideskCreds={props.omnideskCreds}
        setOmnideskCreds={props.setOmnideskCreds}
        serverConfig={props.serverConfig}
        handleSpecialFileUpload={props.handleSpecialFileUpload}
        loadBooks={props.loadBooks}
        isLoadingBooks={props.isLoadingBooks}
        onSave={() => {
          if (props.onSaveSettings) {
            props.onSaveSettings();
          }
          props.setIsConfigOpen(false);
        }}
      />

      <div className="flex flex-col gap-6">
        <WorkspacePanel 
          sources={props.sources}
          setSources={props.setSources}
          processFiles={props.processFiles}
          isDragging={props.isDragging}
          setIsDragging={props.setIsDragging}
          setPreviewSource={props.setPreviewSource}
          uploadProgress={props.uploadProgress}
          pdfExtractionMode={props.pdfExtractionMode}
          setPdfExtractionMode={props.setPdfExtractionMode}
        />

        <div className="flex bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] h-12 overflow-hidden">
          <div className="flex-1 flex items-center px-4 border-r-2 border-editorial-text bg-[#F5F5F3]">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] mr-2 shrink-0">Omnidesk</span>
            <input
              type="text"
              placeholder="ID тикета (напр. 123456)"
              className="w-full bg-transparent outline-none text-sm font-mono placeholder:font-sans"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const target = e.target as HTMLInputElement;
                  if (target.value.trim()) {
                    const ticketId = target.value.trim();
                    if (!props.omnideskCreds.domain || !props.omnideskCreds.email || !props.omnideskCreds.apiKey) {
                      alert('Сначала укажите настройки Omnidesk в Конфигурации агента');
                      return;
                    }
                    props.executionControl.setIsSyncing(true);
                    props.executionControl.setSyncStatus({ type: 'idle', message: 'Загрузка тикета...' });
                    fetch('/api/omnidesk/ticket', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ...props.omnideskCreds, ticketId })
                    }).then(r => r.json()).then(async data => {
                      if (data.error) throw new Error(data.error);
                      props.setSources((prev: any) => [...prev, { name: data.name, content: data.content, attachments: data.attachments || [] }]);
                      
                      try {
                        await indexVectorDocument(`ticket:${ticketId}`, data.content, {
                          name: data.name,
                          type: 'ticket'
                        });
                      } catch (err) {
                        console.error('Failed to index ticket to vector DB', err);
                      }

                      props.executionControl.setSyncStatus({ type: 'success', message: `Тикет ${ticketId} успешно загружен и проиндексирован` });
                      target.value = '';
                    }).catch(err => {
                      props.executionControl.setSyncStatus({ type: 'error', message: err.message });
                    }).finally(() => {
                      props.executionControl.setIsSyncing(false);
                      setTimeout(() => {
                          props.executionControl.setSyncStatus({ type: 'idle', message: '' });
                      }, 5000);
                    });
                  }
                }
              }}
            />
          </div>
          <div className="flex items-center px-4 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest shrink-0">
            Enter для загрузки
          </div>
        </div>

        <AgentSkillsPanel
          activeSkills={props.activeSkills}
          setActiveSkills={props.setActiveSkills}
          defaultActiveSkills={props.defaultActiveSkills}
          setDefaultActiveSkills={props.setDefaultActiveSkills}
          systemInstruction={props.systemInstruction}
          setSystemInstruction={props.setSystemInstruction}
          dataStructure={props.dataStructure}
          setDataStructure={props.setDataStructure}
          geminiModel={props.geminiModel}
          onSaveSettings={props.onSaveSettings || (() => {})}
          customPresets={props.customPresets}
          setCustomPresets={props.setCustomPresets}
          selectedPreset={props.selectedPreset}
          setSelectedPreset={props.setSelectedPreset}
        />

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Цель текущей задачи</label>
          <textarea 
            className="w-full h-32 p-4 bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] focus:ring-0 outline-none text-sm italic"
            placeholder="Например: 'Составь подробное резюме этих заметок, уделив внимание хронологии событий...'"
            value={props.instructions}
            onChange={(e) => props.setInstructions(e.target.value)}
          />
        </div>

        <div className="relative">
          <textarea 
            className="w-full h-[300px] p-8 bg-white border-2 border-editorial-text shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] focus:ring-0 focus:outline-none transition-all resize-none text-sm leading-relaxed"
            placeholder="Вставьте дополнительный текст здесь..."
            value={props.content}
            onChange={(e) => props.setContent(e.target.value)}
            disabled={props.executionControl.isSyncing}
          />
          <div className="absolute top-0 right-0 p-4 opacity-50 pointer-events-none">
            <ClipboardList size={24} />
          </div>
        </div>
      </div>
    </div>
  );
}
