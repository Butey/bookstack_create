import { ForwardRefExoticComponent, RefAttributes } from 'react';
import { Sparkles, Cpu, Layers, Activity, Eye, Database, Terminal, Heart, ClipboardList, Brain, FileSpreadsheet, CheckCircle } from 'lucide-react';

const iconMap: Record<string, any> = {
  Sparkles,
  Cpu,
  Layers,
  Activity,
  Eye,
  Database,
  Terminal,
  Heart,
  ClipboardList,
  Brain,
  FileSpreadsheet,
  CheckCircle,
};

export interface AgentSkillItem {
  id: string;
  name: string;
  description: string;
  badge: string;
  iconName: string;
}

export function loadAgenticSkills(): AgentSkillItem[] {
  const modules = (import.meta as any).glob('../data/skills/agentic/*.md', { query: '?raw', import: 'default', eager: true });
  
  const skills: AgentSkillItem[] = [];
  
  for (const path in modules) {
    let content = modules[path] as string;
    if (!content) continue;
    
    // Normalize literal escaped "\n" and "\r" strings to real line breaks
    if (content.includes('\\n') || content.includes('\\r')) {
      content = content.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }
    
    // Robust cross-platform frontmatter parsing (LF/CRLF matching)
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
      const lines = match[1].split('\n');
      const data: Record<string, string> = {};
      lines.forEach(line => {
        const cleanedLine = line.replace('\r', '').trim();
        const idx = cleanedLine.indexOf(':');
        if (idx !== -1) {
          const key = cleanedLine.substring(0, idx).trim();
          let value = cleanedLine.substring(idx + 1).trim();
          
          // Remove potential wrapping quotes
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          data[key] = value;
        }
      });
      
      const fileId = path.split('/').pop()?.replace('.md', '') || path;
      
      skills.push({
        id: data.id || fileId,
        name: data.name || fileId,
        description: data.description || '',
        badge: data.badge || 'Навык',
        iconName: data.icon || 'Sparkles',
      });
    } else {
      // Fallback: If no frontmatter is found, strip any leading metadata-like blocks manually
      const fileId = path.split('/').pop()?.replace('.md', '') || path;
      let cleanText = content
        .replace(/^---[\s\S]*?---/g, '') // strip any invalid custom frontmatter if present
        .replace(/^#+.*$/gm, '')        // strip Markdown headers
        .replace(/[#*`\-]/g, '')       // remove Markdown formatting symbols
        .replace(/\s+/g, ' ')          // collapse multiple spaces/newlines
        .trim();
      
      skills.push({
        id: fileId,
        name: fileId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
        description: cleanText.substring(0, 150) + (cleanText.length > 150 ? '...' : ''),
        badge: 'Навык',
        iconName: 'Sparkles',
      });
    }
  }
  
  const MIGRATED_SKILL_IDS = new Set([
    'agents-md',
    'hermes-agent',
    'infinite-gratitude',
    'agent-orchestration-multi-agent-optimize',
    'notebooklm',
    'agent-orchestration-improve-agent',
    'pdf-conversion-router',
    'plan-writing',
    'planning-with-files',
    'professional-proofreader',
    'context-optimization',
    'wiki-page-writer',
    'yes-md',
    'computer-vision-expert'
  ]);

  return skills
    .filter(s => !MIGRATED_SKILL_IDS.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getIconComponent(iconName: string) {
  const Icon = iconMap[iconName] || Sparkles;
  return Icon;
}
