const fs = require('fs');
const path = require('path');

const allSkills = [
  { id: 'plan-writing', name: 'Plan-Writing (Планирование шагов)', badge: 'Планирование', icon: 'Terminal', desc: 'Агент создает детализированный многошаговый план структуры статьи в Stage 1 перед написанием черновика.' },
  { id: 'planning-with-files', name: 'Planning-with-Files (Кросс-файловый анализ)', badge: 'Мультифайлы', icon: 'Layers', desc: 'Строит карту связей между всеми загруженными источниками, выявляет конфликты и координирует структуру.' },
  { id: 'notebooklm', name: 'NotebookLM Key Insights (Инсайты}', badge: 'Аналитика', icon: 'Brain', desc: 'Добавляет в конец статьи специальный раздел с ключевыми концептами, терминами и саммари а-ля NotebookLM.' },
  { id: 'context-optimization', name: 'Token-Guard (Сжатие контекста)', badge: 'Контекст', icon: 'Database', desc: 'Интеллектуальная фильтрация избыточных логов или дампов для предотвращения переполнения контекстного окна ИИ.' },
  { id: 'computer-vision-expert', name: 'Computer-Vision (Анализ скриншотов)', badge: 'Зрение', icon: 'Eye', desc: 'Gemini извлекает OCR-текст, ошибки и схемы из приложенных графических файлов и интегрирует их в статью.' },
  { id: 'agents-md', name: 'Agents Consensus (Мульти-Агентная критика)', badge: 'Мультиагент', icon: 'Cpu', desc: 'Запускает дополнительный внутренний цикл: Критик оценивает черновик, а Редактор вносит правки на Stage 3.' },
  { id: 'pdf-conversion-router', name: 'PDF Official Router (Высокая четкость PDF)', badge: 'PDF', icon: 'FileSpreadsheet', desc: 'Специальная высокоточная разметка PDF таблиц и официальных заголовков во избежание съезжания форматирования.' },
  { id: 'infinite-gratitude', name: 'Infinite Gratitude (Мотивационный стимул)', badge: 'Промптинг', icon: 'Heart', desc: 'Интегрирует в промпты когнитивный усилитель внимания, гарантирующий максимальное следование структуре.' },
  { id: 'mcp-builder', name: 'MCP Schemas (Опережающее моделирование)', badge: 'Интеграции', icon: 'Sparkles', desc: 'Интегрирует семантическое описание MCP инструментов для автоматического вызова проверочных процедур.' },
  { id: 'mcp-tool-developer', name: 'MCP Tool Developer', badge: 'Спецификации', icon: 'Terminal', desc: 'Автоматически разрабатывает и специфицирует новые инструменты MCP (Model Context Protocol).' },
  { id: 'mermaid-expert', name: 'Mermaid Expert (Визуализация)', badge: 'Схемы', icon: 'Sparkles', desc: 'Генерирует сложные Mermaid.js диаграммы: архитектурные графы, Sequence и State графики для отображения процессов.' },
  { id: 'wiki-onboarding', name: 'Wiki Onboarding (Адаптация новичков)', badge: 'Обучение', icon: 'Brain', desc: 'Создает мягкий вложенный гайд для онбординга новых сотрудников поверх сложных технологических концепций.' },
  { id: 'wiki-page-writer', name: 'Wiki Page Writer (Идеальная Разметка)', badge: 'Форматирование', icon: 'FileSpreadsheet', desc: 'Специализированный навык форматирования контента строго под BookStack стандарты с Callouts и панелями.' },
  { id: 'microservices-patterns', name: 'Microservices (Разбор Архитектуры)', badge: 'Архитектура', icon: 'Cpu', desc: 'Навык глубокого анализа распределенных систем для создания подробных wiki-статей о микросевисах.' },
  { id: 'agent-orchestration-improve-agent', name: 'Orchestration Improve', badge: 'Оркестрация', icon: 'RefreshCw', desc: 'Автоматически оптимизирует конфигурацию агентов на основе логов ошибок.' },
  { id: 'agent-orchestration-multi-agent-optimize', name: 'Multi-Agent Optimizer', badge: 'Оркестрация', icon: 'Layers', desc: 'Динамически распределяет задачи между пулом агентов для повышения качества черновика.' },
  { id: 'hermes-agent', name: 'Hermes Agent', badge: 'Скорость', icon: 'Terminal', desc: 'Высокоскоростной нейронный агент для молниеносной пред-фильтрации сырых данных перед сборкой Markdown.' },
  { id: 'context-degradation', name: 'Context Degradation', badge: 'Код', icon: 'Brain', desc: 'Защита от деградации контекста LLM при длинных сессиях.' },
  { id: 'docs-architect', name: 'Docs Architect', badge: 'Код', icon: 'FileSpreadsheet', desc: 'Выстраивание строгой информационной архитектуры в документации.' },
  { id: 'multi-agent-patterns', name: 'Multi-Agent Patterns', badge: 'Код', icon: 'Cpu', desc: 'Применение паттернов кооперации нескольких LLM-агентов.' },
  { id: 'parallel-agents', name: 'Parallel Agents', badge: 'Код', icon: 'Layers', desc: 'Управление параллельным исполнением агентов.' },
  { id: 'chat-widget', name: 'Chat Widget', badge: 'Код', icon: 'Terminal', desc: 'Генерация спецификации встраиваемого виджета чата.' },
  { id: 'ai-agent-development', name: 'AI Gen. Agent', badge: 'Код', icon: 'Sparkles', desc: 'Паттерны проектирования автономных AI агентов.' },
  { id: 'database', name: 'Database', badge: 'Код', icon: 'Database', desc: 'Базовые практики проектирования хранилищ данных.' },
  { id: 'data-structure-protocol', name: 'Data Protocol', badge: 'Код', icon: 'RefreshCw', desc: 'Обеспечение соблюдения выбранного протокола струтур.' },
  { id: 'database-architect', name: 'DB Architect', badge: 'Код', icon: 'Network', desc: 'Глубокое архитектурное проектирование баз данных.' },
  { id: 'documentation-generation-doc-generate', name: 'Doc Gen', badge: 'Код', icon: 'FileText', desc: 'Автоматическая генерация документации на лету.' },
  { id: 'langchain-architecture', name: 'LangChain Arch', badge: 'Код', icon: 'Link', desc: 'Архитектурные принципы популярного фреймворка LangChain.' },
  { id: 'llm-application-dev-langchain-agent', name: 'LangChain Agent', badge: 'Код', icon: 'Box', desc: 'Разработка агента на базе экосистемы LangChain.' },
  { id: 'llm-application-dev-ai-assistant', name: 'AI Assistant Core', badge: 'Код', icon: 'Cpu', desc: 'Разработка ядра интеллектуального ассистента.' },
  { id: 'llm-application-dev-prompt-optimize', name: 'Prompt Optimize', badge: 'Код', icon: 'Settings', desc: 'Оптимизация и тонкая настройка промптов.' },
  { id: 'llm-ops', name: 'LLM Ops', badge: 'Код', icon: 'Activity', desc: 'Применение практик MLOps в управлении LLM приложениями.' },
  { id: 'not-human-search-mcp', name: 'Machine Search', badge: 'Код', icon: 'Search', desc: 'Интеграция Machine-to-Machine поисковых протоколов.' },
  { id: 'prompt-engineering-patterns', name: 'Prompt Patterns', badge: 'Код', icon: 'PenTool', desc: 'Высокоуровневые паттерны промпт инжиниринга.' },
  { id: 'rag-engineer', name: 'RAG Engineer', badge: 'Код', icon: 'Layers', desc: 'Интеграция лучших практик Retrieval-Augmented Generation.' },
  { id: 'rag-implementation', name: 'RAG Implementation', badge: 'Код', icon: 'Layers', desc: 'Глубокое внедрение алгоритмов RAG.' },
  { id: 'similarity-search-patterns', name: 'Similarity Search', badge: 'Код', icon: 'Search', desc: 'Паттерны векторного (Similarity) поиска в базах данных.' },
  { id: 'vector-index-tuning', name: 'Vector Tuning', badge: 'Код', icon: 'Settings', desc: 'Оптимизация параметров векторных индексов.' },
  { id: 'yes-md', name: 'Yes Markdown', badge: 'Код', icon: 'FileSpreadsheet', desc: 'Форсированное и исключительно чистое MD-форматирование.' },
  { id: 'mcp-builder-ms', name: 'MCP Microservices', badge: 'Код', icon: 'Cpu', desc: 'Проектирование микросервисной архитектуры на протоколе MCP.' },
  { id: 'nodejs-backend-patterns', name: 'Node.js Backend', badge: 'Код', icon: 'Terminal', desc: 'Интеграция паттернов разработки бэкенда на Node.js.' },
  { id: 'professional-proofreader', name: 'Professional Proofreader', badge: 'Код', icon: 'CheckCircle', desc: 'Профессиональная вычитка и корректура текстов уровня издательства.' },
  { id: 'wiki-architect', name: 'Wiki Architect', badge: 'Код', icon: 'Network', desc: 'Глубокое архитектурное проектирование структуры Wiki (разделы, связи).' },
  { id: 'make-automation', name: 'Make.com Automation', badge: 'Код', icon: 'Cpu', desc: 'Спецификация интеграций и сценариев для Make.com.' }
];

const agenticIds = [
  'plan-writing',
  'planning-with-files',
  'notebooklm',
  'context-optimization',
  'computer-vision-expert',
  'agents-md',
  'pdf-conversion-router',
  'infinite-gratitude',
  'mermaid-expert',
  'wiki-page-writer',
  'agent-orchestration-improve-agent',
  'agent-orchestration-multi-agent-optimize',
  'hermes-agent',
  'professional-proofreader',
  'yes-md' 
];

const baseDirAgentic = path.join(process.cwd(), 'src/data/skills/agentic');
const baseDirDev = path.join(process.cwd(), 'src/data/skills/development');

fs.mkdirSync(baseDirAgentic, { recursive: true });
fs.mkdirSync(baseDirDev, { recursive: true });

allSkills.forEach(s => {
  const isAgentic = agenticIds.includes(s.id);
  const dir = isAgentic ? baseDirAgentic : baseDirDev;
  const content = "---\\n" +
"id: " + s.id + "\\n" +
"name: " + s.name + "\\n" +
"description: " + s.desc + "\\n" +
"badge: " + s.badge + "\\n" +
"icon: " + s.icon + "\\n" +
"---\\n\\n" +
"# " + s.name + "\\n\\n" +
s.desc + "\\n";
  fs.writeFileSync(path.join(dir, s.id + '.md'), content);
});

console.log("Skill matching finished. Files created.");
