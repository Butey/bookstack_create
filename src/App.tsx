/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, DragEvent, useMemo } from 'react';
import axios from 'axios';
import { BookStackCredentials, OmnideskCredentials, ProcessedArticle, Source } from './types';
import { GEMINI_MODELS, DEFAULT_MODEL, GeminiModelId, analyzeLogsDirectly } from './services/gemini';
import { ChatWindow } from './components/ChatWindow';
import { EditorConsole } from './components/EditorConsole';
import { AppHeader } from './components/AppHeader';
import { AppFooter } from './components/AppFooter';
import { PreviewModal } from './components/PreviewModal';
import { MindmapModal } from './components/MindmapModal';
import { MermaidModal } from './components/MermaidModal';
import { RagConfirmationModal } from './components/RagConfirmationModal';
import { SourceEditorPanel } from './components/SourceEditorPanel';
import { LogAnalysisModal } from './components/LogAnalysisModal';
import { KnowledgeSyncPanel } from './components/KnowledgeSyncPanel';
import { useExecutionControl } from './hooks/useExecutionControl';
import { useFileUpload } from './hooks/useFileUpload';
import { useAgentActions } from './hooks/useAgentActions';
import { useBookStackSync } from './hooks/useBookStackSync';

export default function App() {
  const executionControl = useExecutionControl();
  
  // Generate a transient session ID that resets on page refresh
  const sessionId = useMemo(() => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), []);

  useEffect(() => {
    // Set session ID header for all outgoing requests
    axios.defaults.headers.common['X-Session-Id'] = sessionId;
  }, [sessionId]);

  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
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
  const [mermaidData, setMermaidData] = useState<{ code: string } | null>(null);

  const [credentials, setCredentials] = useState<BookStackCredentials>({ baseUrl: '', tokenId: '', tokenSecret: '' });
  const [omnideskCreds, setOmnideskCreds] = useState<OmnideskCredentials>({ domain: '', email: '', apiKey: '' });
  const [serverConfig, setServerConfig] = useState<{ 
    bookstack: { hasEnv: boolean; envBaseUrl: string };
    omnidesk: { hasEnv: boolean; envDomain: string };
  } | null>(null);
  const [activeSkills, setActiveSkills] = useState<Record<string, boolean>>({
    'prompt-engineer': false,
    'mermaid-expert': false,
    'log-analyzer': true,
    'analyzing-logs': true,
  });
  const [customPresets, setCustomPresets] = useState<any[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('general-kbae');

  const [defaultActiveSkills, setDefaultActiveSkills] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('bridge_lm_default_active_skills');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return {
      'prompt-engineer': false,
      'mermaid-expert': false,
      'log-analyzer': true,
      'analyzing-logs': true,
    };
  });

  useEffect(() => {
    localStorage.setItem('bridge_lm_default_active_skills', JSON.stringify(defaultActiveSkills));
  }, [defaultActiveSkills]);

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

      // We do NOT load bookstack_sources from server because they should be reset on refresh
      // if (settingsData.bookstack_sources) setSources(settingsData.bookstack_sources);
      
      if (settingsData.agent_work_mode) setWorkMode(settingsData.agent_work_mode);
      if (settingsData.agent_data_structure) setDataStructure(settingsData.agent_data_structure);
      if (settingsData.agent_system_instruction) setSystemInstruction(settingsData.agent_system_instruction);
      if (settingsData.agent_search_prompt) setSearchPrompt(settingsData.agent_search_prompt);
      if (settingsData.agent_duplicate_prompt) setDuplicatePrompt(settingsData.agent_duplicate_prompt);
      if (settingsData.agent_context_prompt) setContextPrompt(settingsData.agent_context_prompt);
      if (settingsData.agent_active_skills) setActiveSkills(settingsData.agent_active_skills);
      if (settingsData.agent_default_active_skills) setDefaultActiveSkills(settingsData.agent_default_active_skills);
      if (settingsData.agent_custom_presets) setCustomPresets(settingsData.agent_custom_presets);
      if (settingsData.agent_selected_preset) setSelectedPreset(settingsData.agent_selected_preset);
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
  const [previewSource, setPreviewSource] = useState<Source | null>(null);

  const [logAnalysisResult, setLogAnalysisResult] = useState<string | null>(null);
  const [logAnalysisName, setLogAnalysisName] = useState<string>('');
  const [isAnalyzingLogs, setIsAnalyzingLogs] = useState(false);

  const handleAnalyzeLogs = async (sourceContent: string, sourceName: string) => {
    setIsAnalyzingLogs(true);
    setLogAnalysisName(sourceName);
    executionControl.setSyncStatus({ type: 'idle', message: 'Анализ логов DevOps-агентом...' });
    try {
      const result = await analyzeLogsDirectly(sourceContent, sourceName, activeSkills);
      setLogAnalysisResult(result);
      setPreviewSource(null); // Close the preview modal to open the analysis report
      executionControl.setSyncStatus({ type: 'success', message: 'Анализ логов успешно завершен' });
    } catch (err: any) {
      console.error(err);
      executionControl.setSyncStatus({ type: 'error', message: `Ошибка анализа логов: ${err.message || String(err)}` });
    } finally {
      setIsAnalyzingLogs(false);
      setTimeout(() => {
        executionControl.setSyncStatus({ type: 'idle', message: '' });
      }, 5000);
    }
  };

  const handleInsertLogAnalysisToDraft = (logMd: string) => {
    if (lastResponse) {
      setLastResponse({
        ...lastResponse,
        markdown: lastResponse.markdown + logMd
      });
      executionControl.setSyncStatus({ type: 'success', message: 'Анализ логов добавлен в черновик статьи!' });
    } else {
      setContent((prev: string) => prev + logMd);
      executionControl.setSyncStatus({ type: 'success', message: 'Анализ логов вставлен в текстовое поле!' });
    }
  };

  const [instructions, setInstructions] = useState('');
  const [dataStructure, setDataStructure] = useState(`Template: Bookstack Knowledge Base Article v3.0

---
target_book: "[Автоматическое определение]"
target_chapter: "[Автоматическое определение]"
tags: [tag1, tag2]
priority: "[Low/Medium/High/Critical]"
root_cause_category: "[Category]"
---

## 1. Метаданные и Экспресс-диагностика
* **Тип обращения:** [Напр. Инцидент / Сбой отображения]
* **Симптом:** [Краткое описание того, что видит пользователь]
* **Статус объекта:** [ПНР / Эксплуатация / Тесты]
* **Критичность:** [Влияние на бизнес-процессы или доверие клиента]

## 2. Описание проблемы (Context)
[1-2 абзаца: детальное описание ситуации на основе тикета. Условия возникновения, повторяемость].

## 3. Diagnostic Mapping (Symptom → Cause)
| Визуальный симптом / Ошибка в логах | Вероятная причина | Обязательные данные для сбора |
| :--- | :--- | :--- |
| [Текст ошибки] | [Что это значит] | [Логи, конфиги, дампы] |

## 4. Официальное решение (Root Cause Fix)
[Пошаговая инструкция по полному устранению первопричины].
1. Шаг один...
2. Шаг два...

## 5. Технический Workaround / Smart Filter
[Если применимо: временное решение или программный алгоритм фильтрации аномалий].
* **Логика:** [Описание алгоритма]
* **Пример кода:** [Блок кода, если есть]

## 6. Шаблон ответа клиенту (Copy/Paste)
### RU
[Готовый текст для Omnidesk на русском]

### EN (if applicable)
[Готовый текст на английском]

## 7. Критерии эскалации на L2/Dev
* [Условие 1]
* [Условие 2]

## 8. Ограничения и Безопасность
* **Запрещено:** [Действие]
* **Важно:** [Риск/Последствие]

## 9. Справочные материалы
* [Ссылка на dev.iridi.com]
* [Внутренние регламенты]

## 10. История изменений
| Дата | Версия | Изменения | Автор |
| :--- | :--- | :--- | :--- |
| 2026-04-29 | 1.0 | Initial Generation | KBAE Assistant |`);
  const [systemInstruction, setSystemInstruction] = useState(`# System Prompt: Knowledge Base Automation Engine (KBAE) v3.0

## ROLE
Ты — Senior Fullstack Developer, эксперт технической поддержки и ведущий системный аналитик iRidium Ltd. Твоя задача: профессиональная трансформация диалогов из тикет-системы (Omnidesk) в структурированные статьи базы знаний (Bookstack) на русском языке. Ты выступаешь в роли интеллектуального фильтра, отделяющего симптомы от истинных причин.

## BOOKSTACK ROUTING & METADATA LOGIC
Перед генерацией текста определи параметры размещения и заполни YAML Frontmatter в самом верху статьи:
1. target_book: Основная категория (iRidium Pro, i3 lite, Hardware, Cloud).
2. target_chapter: Технический компонент (Server, Scripting, KNX, Licensing и т.д.).
3. tags: Ключевые слова проблемы и задействованные технологии.
4. priority: Приоритет решения (Low, Medium, High, Critical).
5. root_cause_category: Категория первопричины (напр., Configuration Conflict, Bug, Documentation Error).

## ALGORITHM: STEP-BY-STEP ANALYSIS
1. Многофакторный анализ (Chain of Thought):
   - Разбей тикет на факты: симптомы клиента vs ответы поддержки.
   - Идентифицируй "ложные корреляции" (когда сначала подозревали одно, а причиной оказалось другое).
2. Верификация (Grounding):
   - Сверь технические утверждения с технической документацией.
   - Если решение является временным (Workaround), обязательно пометь его соответствующим образом.
3. Формулировка и Стиль:
   - Тон: Максимально лаконичный, авторитетный и деловой.
   - Структура: Обязательно используй таблицы для сопоставления симптомов и причин.
   - Запреты: Никакой воды и неуверенных формулировок («мы постараемся»).

## EXPORT REQUIREMENTS
- Формат: Исключительно чистый Markdown (.md).
- Обязательное наличие YAML Frontmatter в самом начале файла.
- Краткое описание (description) должно представлять собой содержательное резюме статьи, состоящее ровно из 3 полноценных предложений.`);
  const [searchPrompt, setSearchPrompt] = useState(`Основываясь на задаче: "{goal}" и содержании источников:
{sources}

ЦЕЛЬ: Сгенерировать ровно 5 узких поисковых запросов для BookStack Wiki, чтобы найти:
1. ТОЧНЫЕ ДУБЛИКАКТЫ создаваемой статьи (когда описывается тот же объект, то же действие в той же системе).
2. ПОЛЕЗНЫЙ КОНТЕКСТ (смежные процессы, предварительные шаги, зависимые компоненты, похожие ошибки).

---
ИНСТРУКЦИЯ ПО ГЕНЕРАЦИИ ЗАПРОСОВ:

ШАГ 1 — Извлечение точных идентификаторов (для дубликатов):
- Ищи коды ошибок, артикулы оборудования, точные версии ПО или названия модулей (напр., "RouterOS 7.3", "ERR_1042", "LDAP Bitrix24").
- Сформируй 2-3 специфичных запроса на их основе длиной 1-3 слова.

ШАГ 2 — Определение смысловых слоев (для контекста):
- Проанализируй платформу, зависимости (что нужно настроить "до" или "после"), роль пользователя и категорию проблемы (интеграция, сброс и т.д.).
- Сформируй 2 запроса шире, чем для дублей, но строго в контексте системы (длина 2-5 слов).

ОГРАНИЧЕНИЯ:
❌ Запрещено использовать общие бесполезные слова в одиночку: "настройка", "ошибка", "сервер", "авторизация".
✅ Используй конкретные пары: "ipsec xauth timeout", "ldap error 49", "exchange autodiscover", "настройка ldap bitrix".

---
Верни СТРОГО JSON-массив из 5 строк без Markdown-разметки и пояснений:
["запрос1", "запрос2", "запрос3", "запрос4", "запрос5"]`);
  const [duplicatePrompt, setDuplicatePrompt] = useState(`Вы — строгий системный аналитик базы знаний BookStack класса Senior.
Цель пользователя: "{goal}".
Новый материал: 
---
{sources}
---

Найденные статьи в Wiki:
{retrievedPages}

ЦЕЛЬ: Оценить каждую найденную статью строго на предмет того, является ли она ТОЧНЫМ ДУБЛИКАТОМ (статьей, которую нужно полностью обновить и заменить новым материалом).

ПРАВИЛА ОЦЕНКИ:
- Дубль = статья описывает ТОТ ЖЕ объект + ТО ЖЕ действие + В ТОЙ ЖЕ системе (например, "Сброс 2FA в Mikrotik" и "Mikrotik: сбросить двухфакторную аутентификацию" - это дубли).
- НЕ дубль = смежная статья или статья о другой ошибке в той же системе (например, настройка VPN в Mikrotik - это контекст, но не дубль).
- Если есть малейшие сомнения, ставьте "isDuplicate": false.

Верни СТРОГО структурированный JSON:
{
  "evaluatedPages": [
    {
      "id": number,
      "reason": "краткое четкое обоснование сходства процессов на русском языке",
      "isDuplicate": boolean
    }
  ]
}`);
  const [contextPrompt, setContextPrompt] = useState(`Вы — ведущий архитектор базы знаний BookStack.
Цель пользователя: "{goal}".
Новый материал:
---
{sources}
---

Ранее найденные статьи в Wiki:
{retrievedPages}

ЦЕЛЬ: Оценить каждую статью на полезность в качестве технического КОНТЕКСТА или справочного материала для создаваемой статьи.

ПРАВИЛА ОЦЕНКИ:
- Статья полезна как контекст, если она описывает общую систему, в которую внедряется инструкция, смежные компоненты, требования безопасности, prerequisites (предварительные условия), или содержит общие разделы, которые помогут сделать статью полнее.
- Пишите честное обоснование для каждой статьи.

Верни СТРОГО структурированный JSON:
{
  "evaluatedPages": [
    {
      "id": number,
      "reason": "почему эта статья полезна как контекст или prerequisite на русском языке",
      "isContext": boolean
    }
  ]
}`);
  const [geminiModel, setGeminiModel] = useState<GeminiModelId>(DEFAULT_MODEL);
  const [pdfExtractionMode, setPdfExtractionMode] = useState<'gemini' | 'markitdown'>('markitdown');

  const { uploadProgress, isDragging, setIsDragging, processFiles, handleSpecialFileUpload } = useFileUpload(
    geminiModel,
    setSources,
    setSystemInstruction,
    setDataStructure,
    executionControl,
    activeSkills,
    pdfExtractionMode
  );

  const { handleSync, confirmAndPublish, handleRefinement, handleGenerateMindmap, handleGenerateFAQ, handleGenerateMermaid, handleRagChoice } = useAgentActions({
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
    setMermaidData,
    executionControl,
    loadChapterPages,
    loadChaptersAndPages,
    setSelectedBookId,
    setSelectedPageId,
    activeSkills
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
          'Content-Type': 'application/json',
          'X-Session-Id': sessionId // Ensure header is present even for fetch
        },
        body: JSON.stringify({
          // bookstack_sources is intentionally omitted for isolation and reset requirement
          agent_work_mode: workMode,
          agent_data_structure: dataStructure,
          agent_system_instruction: systemInstruction,
          agent_search_prompt: searchPrompt,
          agent_duplicate_prompt: duplicatePrompt,
          agent_context_prompt: contextPrompt,
          agent_active_skills: activeSkills,
          agent_default_active_skills: defaultActiveSkills,
          agent_gemini_model: geminiModel,
          agent_custom_presets: customPresets,
          agent_selected_preset: selectedPreset
        })
      }).catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [sources, workMode, dataStructure, systemInstruction, searchPrompt, duplicatePrompt, contextPrompt, activeSkills, defaultActiveSkills, geminiModel, customPresets, selectedPreset, isSettingsLoaded, sessionId]);

  const forceSaveSettings = () => {
    fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId
      },
      body: JSON.stringify({
        // bookstack_sources is intentionally omitted
        agent_work_mode: workMode,
        agent_data_structure: dataStructure,
        agent_system_instruction: systemInstruction,
        agent_search_prompt: searchPrompt,
        agent_duplicate_prompt: duplicatePrompt,
        agent_context_prompt: contextPrompt,
        agent_active_skills: activeSkills,
        agent_default_active_skills: defaultActiveSkills,
        agent_gemini_model: geminiModel,
        agent_custom_presets: customPresets,
        agent_selected_preset: selectedPreset
      })
    })
    .then(r => r.json())
    .then(() => {
      console.log('Settings successfully persisted on server');
    })
    .catch(console.error);
  };

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
        isSyncing={executionControl.isSyncing}
        syncProgress={executionControl.syncProgress}
      />

      <main className="max-w-6xl mx-auto px-10 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <SourceEditorPanel
            onSaveSettings={forceSaveSettings}
            isConfigOpen={isConfigOpen}
            setIsConfigOpen={setIsConfigOpen}
            pdfExtractionMode={pdfExtractionMode}
            setPdfExtractionMode={setPdfExtractionMode}
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
            activeSkills={activeSkills}
            setActiveSkills={setActiveSkills}
            defaultActiveSkills={defaultActiveSkills}
            setDefaultActiveSkills={setDefaultActiveSkills}
            customPresets={customPresets}
            setCustomPresets={setCustomPresets}
            selectedPreset={selectedPreset}
            setSelectedPreset={setSelectedPreset}
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
            loadChaptersAndPages={loadChaptersAndPages}
            loadChapterPages={loadChapterPages}
            executionControl={executionControl}
            sourcesLength={sources.length}
            contentLength={content.trim().length}
            handleGenerateMindmap={handleGenerateMindmap}
            handleGenerateFAQ={handleGenerateFAQ}
            handleGenerateMermaid={handleGenerateMermaid}
            setIsConfigOpen={setIsConfigOpen}
          />
        </div>
      </main>

      <AppFooter />

      {previewSource && (
        <PreviewModal 
          previewSource={previewSource} 
          setPreviewSource={setPreviewSource} 
          onAnalyzeLogs={handleAnalyzeLogs}
        />
      )}

      {logAnalysisResult && (
        <LogAnalysisModal
          isOpen={!!logAnalysisResult}
          onClose={() => setLogAnalysisResult(null)}
          report={logAnalysisResult}
          logName={logAnalysisName}
          onInsertToDraft={handleInsertLogAnalysisToDraft}
        />
      )}

      {mindmapData && (
        <MindmapModal mindmapData={mindmapData} setMindmapData={setMindmapData} handleSync={handleSync} />
      )}

      {mermaidData && (
        <MermaidModal 
          mermaidData={mermaidData} 
          setMermaidData={setMermaidData} 
          handleSync={handleSync} 
          onInsertToPage={(mermaidMd) => {
            if (lastResponse) {
              setLastResponse({
                ...lastResponse,
                markdown: lastResponse.markdown + mermaidMd
              });
              executionControl.setSyncStatus({ type: 'success', message: 'Схема Mermaid добавлена в черновик статьи!' });
            } else {
              setContent((prev: string) => prev + mermaidMd);
              executionControl.setSyncStatus({ type: 'success', message: 'Схема Mermaid вставлена в текстовое поле!' });
            }
          }}
        />
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
