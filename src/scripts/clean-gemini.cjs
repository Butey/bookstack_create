const fs = require('fs');
const path = require('path');

let code = fs.readFileSync('src/services/gemini.ts', 'utf8');

const devSkillsToRemove = [
  'MCP-BUILDER',
  'MCP-TOOL-DEVELOPER',
  'WIKI-ONBOARDING',
  'MICROSERVICES-PATTERNS',
  'CONTEXT-DEGRADATION',
  'DOCS-ARCHITECT',
  'MULTI-AGENT-PATTERNS',
  'PARALLEL-AGENTS',
  'CHAT-WIDGET',
  'AI-AGENT-DEVELOPMENT',
  'DATABASE',
  'DATA-STRUCTURE-PROTOCOL',
  'DATABASE-ARCHITECT',
  'DOCUMENTATION-GENERATION-DOC-GENERATE',
  'LANGCHAIN-ARCHITECTURE',
  'LLM-APPLICATION-DEV-LANGCHAIN-AGENT',
  'LLM-APPLICATION-DEV-AI-ASSISTANT',
  'LLM-APPLICATION-DEV-PROMPT-OPTIMIZE',
  'LLM-OPS',
  'NOT-HUMAN-SEARCH-MCP',
  'PROMPT-ENGINEERING-PATTERNS',
  'RAG-ENGINEER',
  'RAG-IMPLEMENTATION',
  'SIMILARITY-SEARCH-PATTERNS',
  'VECTOR-INDEX-TUNING',
  'MCP-BUILDER-MS',
  'NODEJS-BACKEND-PATTERNS',
  'WIKI-ARCHITECT',
  'MAKE-AUTOMATION'
];

devSkillsToRemove.forEach(skillTag => {
  const marker = "// --- SKILL: " + skillTag + " ---";
  const startIdx = code.indexOf(marker);
  if (startIdx !== -1) {
    let nextMarker = code.indexOf("// --- SKILL:", startIdx + 1);
    let draftIdx = code.indexOf("let draft;", startIdx + 1);
    
    let endIdx = -1;
    if (nextMarker !== -1 && draftIdx !== -1) {
      endIdx = Math.min(nextMarker, draftIdx);
    } else if (nextMarker !== -1) {
      endIdx = nextMarker;
    } else if (draftIdx !== -1) {
      endIdx = draftIdx;
    }
    
    if (endIdx !== -1) {
       code = code.substring(0, startIdx) + code.substring(endIdx);
    }
  }
});

fs.writeFileSync('src/services/gemini.ts', code);
console.log("Cleanup finished.");
