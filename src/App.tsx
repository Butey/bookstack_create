/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, DragEvent } from 'react';
import { BookStackCredentials, OmnideskCredentials, ProcessedArticle } from './types';
import { GEMINI_MODELS, DEFAULT_MODEL, GeminiModelId } from './services/gemini';
import { ChatWindow } from './components/ChatWindow';
import { EditorConsole } from './components/EditorConsole';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { PreviewModal } from './components/PreviewModal';
import { MindmapModal } from './components/MindmapModal';
import { RagConfirmationModal } from './components/RagConfirmationModal';
import { SourceEditorPanel } from './components/SourceEditorPanel';
import { KnowledgeSyncPanel } from './components/KnowledgeSyncPanel';
import { useExecutionControl } from './hooks/useExecutionControl';
import { useFileUpload } from './hooks/useFileUpload';
import { useAgentActions } from './hooks/useAgentActions';
import { useBookStackSync } from './hooks/useBookStackSync';

export default function App() {
  const executionControl = useExecutionControl();
  
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [sources, setSources] = useState<{ name: string; content: string; selected?: boolean; attachments?: { mimeType: string; data: string; name: string }[] }[]>([]);
  const [workMode, setWorkMode] = useState<'auto' | 'review'>('auto');
  const [pendingApproval, setPendingApproval] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model', content: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [ragConfirmation, setRagConfirmation] = useState<{
    pageName: string;
    pageId: number;
    bookId: number;
    allSourcesText: string;
    allAttachments?: { mimeType: string; data: string; name: string }[];
    analysis: any;
  } | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mindmapData, setMindmapData] = useState<{ md: string } | null>(null);

  const [credentials, setCredentials] = useState<BookStackCredentials>({ baseUrl: '', tokenId: '', tokenSecret: '' });
  const [omnideskCreds, setOmnideskCreds] = useState<OmnideskCredentials>({ domain: '', email: '', apiKey: '' });
  const [serverConfig, setServerConfig] = useState<{ 
    bookstack: { hasEnv: boolean; envBaseUrl: string };
    omnidesk: { hasEnv: boolean; envDomain: string };
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/config').then(r => r.json()),
      fetch('/api/settings').then(r => r.json())
    ]).then(([configData, settingsData]) => {
      setServerConfig(configData);

      let bookstackCredsToSet = { baseUrl: '', tokenId: '', tokenSecret: '' };
      if (settingsData.bookstack_creds || settingsData.bookstack) {
        bookstackCredsToSet = { ...bookstackCredsToSet, ...(settingsData.bookstack_creds || settingsData.bookstack) };
      }
      if (configData.bookstack?.hasEnv) {
        bookstackCredsToSet = {
          ...bookstackCredsToSet,
          baseUrl: configData.bookstack.envBaseUrl || bookstackCredsToSet.baseUrl,
          tokenId: 'SERVER_MANAGED',
          tokenSecret: 'SERVER_MANAGED'
        };
      }
      setCredentials(bookstackCredsToSet);

      let omnideskCredsToSet = { domain: '', email: '', apiKey: '' };
      if (settingsData.omnidesk_creds || settingsData.omnidesk) {
        omnideskCredsToSet = { ...omnideskCredsToSet, ...(settingsData.omnidesk_creds || settingsData.omnidesk) };
      }
      if (configData.omnidesk?.hasEnv) {
        omnideskCredsToSet = {
          ...omnideskCredsToSet,
          domain: configData.omnidesk.envDomain || omnideskCredsToSet.domain,
          email: 'SERVER_MANAGED',
          apiKey: 'SERVER_MANAGED'
        };
      }
      setOmnideskCreds(omnideskCredsToSet);

      if (settingsData.bookstack_sources) setSources(settingsData.bookstack_sources);
      if (settingsData.agent_work_mode) setWorkMode(settingsData.agent_work_mode);
      if (settingsData.agent_data_structure) setDataStructure(settingsData.agent_data_structure);
      if (settingsData.agent_system_instruction) setSystemInstruction(settingsData.agent_system_instruction);
      if (settingsData.agent_search_prompt) setSearchPrompt(settingsData.agent_search_prompt);
      if (settingsData.agent_duplicate_prompt) setDuplicatePrompt(settingsData.agent_duplicate_prompt);
      if (settingsData.agent_context_prompt) setContextPrompt(settingsData.agent_context_prompt);
      if (settingsData.agent_gemini_model) {
        const validIds = GEMINI_MODELS.map(m => m.id) as string[];
        setGeminiModel(validIds.includes(settingsData.agent_gemini_model) ? settingsData.agent_gemini_model : DEFAULT_MODEL);
      }
      
      setIsSettingsLoaded(true);
    }).catch(err => {
      console.error(err);
      setIsSettingsLoaded(true);
    });
  }, []);

  const {
    books, setBooks,
    chapters, setChapters,
    pages, setPages,
    selectedBookId, setSelectedBookId,
    selectedChapterId, setSelectedChapterId,
    selectedPageId, setSelectedPageId,
    isLoadingBooks,
    isLoadingChapters,
    isLoadingPages,
    loadBooks,
    loadChaptersAndPages,
    loadChapterPages
  } = useBookStackSync(credentials, executionControl.setSyncStatus);

  const [targetMode, setTargetMode] = useState<'create' | 'update'>('create');
  const [customTags, setCustomTags] = useState<string>('NotebookLM, Gemini-Refinement');
  
  const [content, setContent] = useState('');
  const [lastResponse, setLastResponse] = useState<ProcessedArticle | null>(null);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState<{ name: string; content: string } | null>(null);

  const [instructions, setInstructions] = useState('');
  const [dataStructure, setDataStructure] = useState('1. Краткий обзор (Summary)\n2. Контекст (Context)\n3. Детальное описание (Detailed Analysis)\n4. Выводы (Conclusion)');
  const [systemInstruction, setSystemInstruction] = useState('Вы — эксперт по техническому письму. Синтезируйте предоставленные источники в понятную и профессиональную статью для базы знаний Wiki.');
  const [searchPrompt, setSearchPrompt] = useState('Основываясь на задаче: "{goal}" и кратком содержании источников:\n\n{sources}\n\nТвоя задача — сгенерировать 5 узких поисковых запросов для поиска существующих статей-дублей в wiki-базе (BookStack).\nНам нужно найти статьи ИМЕННО ОБ ЭТОМ процессе, или ИМЕННО ОБ ЭТОЙ ошибке, а не просто смежные материалы.\nСформулируй запросы по правилам:\n1-2. Точное название конкретного модуля, функции или кода ошибки (самое специфичное).\n3. Главное действие, которое описывает материал.\n4-5. Уникальные термины, аббревиатуры или идентификаторы из текста.\n\nЗАПРОСЫ ДОЛЖНЫ БЫТЬ УЗКИМИ И КОРОТКИМИ (1-3 слова). Возвращай СТРОГО JSON массив строк, например: ["vpn error 504", "setup mikrotik ipsec", "payment gateway"].');
  const [duplicatePrompt, setDuplicatePrompt] = useState(`Вы — строгий аналитик базы знаний. Цель пользователя: "{goal}".\nНовый материал: \n---\n{sources}\n---\n\nНайденные статьи:\n{retrievedPages}\n\nОцени каждую статью ТОЛЬКО на предмет того, является ли она ДУБЛЕМ (статьей, которую нужно обновить).\nИНСТРУКЦИЯ ПО ОЦЕНКЕ ДУБЛЕЙ:\n- Статья является дублем ТОЛЬКО если она описывает ИМЕННО ТУ ЖЕ функцию, ТОТ ЖЕ процесс или ТУ ЖЕ инструкцию.\n- Если сомневаетесь, ставьте isDuplicate: false.\n\nВерни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему", "isDuplicate": boolean }] }`);
  const [contextPrompt, setContextPrompt] = useState(`Вы — аналитик базы знаний. У пользователя есть цель: "{goal}".\nТакже исходный собираемый материал пользователя:\n---\n{sources}\n---\nМы нашли следующие существующие статьи в Wiki:\n{retrievedPages}\nОцени каждую найденную статью на полезность как КОНТЕКСТ для написания новой.\nИНСТРУКЦИЯ ПО ОЦЕНКЕ КОНТЕКСТА:\n- Статья полезна, если она описывает общую систему, в которую внедряется инструкция, или содержит связанные термины и архитектуру.\n\nВерни СТРОГО JSON: { "evaluatedPages": [{ "id": number, "reason": "почему такое решение", "isContext": boolean }] }`);
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(DEFAULT_MODEL);

  const { uploadProgress, isDragging, setIsDragging, processFiles, handleSpecialFileUpload } = useFileUpload(
    geminiModel,
    setSources,
    setSystemInstruction,
    setDataStructure,
    executionControl
  );

  const { handleSync, confirmAndPublish, handleRefinement, handleGenerateMindmap, handleGenerateFAQ, handleRagChoice } = useAgentActions({
    credentials,
    books,
    setBooks,
    chapters,
    selectedBookId,
    selectedChapterId,
    selectedPageId,
    targetMode,
    setTargetMode,
    sources,
    content,
    setContent,
    setSources,
    customTags,
    chatHistory,
    setChatHistory,
    lastResponse,
    setLastResponse,
    workMode,
    geminiModel,
    instructions,
    systemInstruction,
    dataStructure,
    searchPrompt,
    duplicatePrompt,
    contextPrompt,
    setPendingApproval,
    setIsConsoleOpen,
    setRagConfirmation,
    setMindmapData,
    executionControl,
    loadChapterPages,
    loadChaptersAndPages,
    setSelectedBookId,
    setSelectedPageId
  });

  useEffect(() => {
    if (credentials.baseUrl && (credentials.tokenId || credentials.tokenId === 'SERVER_MANAGED')) {
      loadBooks();
    }
  }, [credentials.baseUrl, credentials.tokenId, loadBooks]);



  useEffect(() => {
    if (!isSettingsLoaded) return;
    
    const timer = setTimeout(() => {
      fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bookstack_sources: sources,
          agent_work_mode: workMode,
          agent_data_structure: dataStructure,
          agent_system_instruction: systemInstruction,
          agent_search_prompt: searchPrompt,
          agent_duplicate_prompt: duplicatePrompt,
          agent_context_prompt: contextPrompt,
          agent_gemini_model: geminiModel
        })
      }).catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [sources, workMode, dataStructure, systemInstruction, searchPrompt, duplicatePrompt, contextPrompt, geminiModel, isSettingsLoaded]);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []) as File[];
    await processFiles(files);
  };

  return (
    <div 
      className="min-h-screen bg-editorial-bg text-editorial-text font-sans selection:bg-editorial-text selection:text-white pb-12"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AppHeader 
        credentials={credentials}
        isChatOpen={isChatOpen}
        setIsChatOpen={setIsChatOpen}
        isConsoleOpen={isConsoleOpen}
        setIsConsoleOpen={setIsConsoleOpen}
        isConfigOpen={isConfigOpen}
        setIsConfigOpen={setIsConfigOpen}
      />

      <main className="max-w-6xl mx-auto px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <SourceEditorPanel
            isConfigOpen={isConfigOpen}
            setIsConfigOpen={setIsConfigOpen}
            systemInstruction={systemInstruction}
            setSystemInstruction={setSystemInstruction}
            dataStructure={dataStructure}
            setDataStructure={setDataStructure}
            searchPrompt={searchPrompt}
            setSearchPrompt={setSearchPrompt}
            duplicatePrompt={duplicatePrompt}
            setDuplicatePrompt={setDuplicatePrompt}
            contextPrompt={contextPrompt}
            setContextPrompt={setContextPrompt}
            workMode={workMode}
            setWorkMode={setWorkMode}
            geminiModel={geminiModel}
            setGeminiModel={setGeminiModel}
            credentials={credentials}
            setCredentials={setCredentials}
            omnideskCreds={omnideskCreds}
            setOmnideskCreds={setOmnideskCreds}
            serverConfig={serverConfig}
            handleSpecialFileUpload={handleSpecialFileUpload}
            loadBooks={loadBooks}
            isLoadingBooks={isLoadingBooks}
            sources={sources}
            setSources={setSources}
            processFiles={processFiles}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            setPreviewSource={setPreviewSource}
            uploadProgress={uploadProgress}
            executionControl={executionControl}
            instructions={instructions}
            setInstructions={setInstructions}
            content={content}
            setContent={setContent}
          />

          <KnowledgeSyncPanel
            targetMode={targetMode}
            setTargetMode={setTargetMode}
            selectedBookId={selectedBookId}
            setSelectedBookId={setSelectedBookId}
            selectedChapterId={selectedChapterId}
            setSelectedChapterId={setSelectedChapterId}
            selectedPageId={selectedPageId}
            setSelectedPageId={setSelectedPageId}
            customTags={customTags}
            setCustomTags={setCustomTags}
            books={books}
            chapters={chapters}
            pages={pages}
            isLoadingBooks={isLoadingBooks}
            isLoadingChapters={isLoadingChapters}
            isLoadingPages={isLoadingPages}
            handleSync={handleSync}
            executionControl={executionControl}
            sourcesLength={sources.length}
            contentLength={content.trim().length}
            handleGenerateMindmap={handleGenerateMindmap}
            handleGenerateFAQ={handleGenerateFAQ}
            setIsConfigOpen={setIsConfigOpen}
          />
        </div>
      </main>

      <AppFooter />

      {previewSource && (
        <PreviewModal previewSource={previewSource} setPreviewSource={setPreviewSource} />
      )}

      {mindmapData && (
        <MindmapModal mindmapData={mindmapData} setMindmapData={setMindmapData} handleSync={handleSync} />
      )}

      {ragConfirmation && (
        <RagConfirmationModal 
          ragConfirmation={ragConfirmation} 
          setRagConfirmation={setRagConfirmation} 
          handleRagChoice={handleRagChoice} 
          executionControl={executionControl} 
          baseUrl={credentials.baseUrl} 
        />
      )}

      <EditorConsole
        isConsoleOpen={isConsoleOpen}
        setIsConsoleOpen={setIsConsoleOpen}
        lastResponse={lastResponse}
        setLastResponse={setLastResponse}
        pendingApproval={pendingApproval}
        setPendingApproval={setPendingApproval}
        syncStatus={executionControl.syncStatus}
        syncProgress={executionControl.syncProgress}
        confirmAndPublish={confirmAndPublish}
        handleCancel={executionControl.handleCancel}
        handlePauseToggle={executionControl.handlePauseToggle}
        isPaused={executionControl.isPaused}
        userInput={userInput}
        setUserInput={setUserInput}
        isSyncing={executionControl.isSyncing}
        handleRefinement={() => {
          handleRefinement(userInput);
          setUserInput('');
        }}
        chatHistory={chatHistory}
        sources={sources}
        setSyncStatus={executionControl.setSyncStatus}
        books={books}
      />
      
      <ChatWindow
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        sources={sources}
        model={geminiModel}
        onGenerateArticle={handleSync}
        onFileUpload={processFiles}
        isUploading={uploadProgress !== null}
      />
    </div>
  );
}
