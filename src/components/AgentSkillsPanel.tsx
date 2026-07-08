import { useState } from 'react';
import { motion } from 'motion/react';
import { Brain, Check, RefreshCw, Wand2, Save, Undo2, Star, Plus, Trash2, Lock, Unlock, Pencil } from 'lucide-react';
import { PROMPT_PRESETS, PromptPreset } from '../services/promptLibrary';
import { callGemini, GeminiModelId } from '../services/gemini';
import { loadAgenticSkills, getIconComponent, AgentSkillItem } from '../utils/skillLoader';

export const AGENT_SKILLS_LIST = loadAgenticSkills();

interface AgentSkillsPanelProps {
  activeSkills: Record<string, boolean>;
  setActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  defaultActiveSkills: Record<string, boolean>;
  setDefaultActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  systemInstruction: string;
  setSystemInstruction: (v: string) => void;
  dataStructure: string;
  setDataStructure: (v: string) => void;
  geminiModel: GeminiModelId;
  onSaveSettings: () => void;
  customPresets: any[];
  setCustomPresets: React.Dispatch<React.SetStateAction<any[]>>;
  selectedPreset: string;
  setSelectedPreset: React.Dispatch<React.SetStateAction<string>>;
  customSkills?: AgentSkillItem[];
  setCustomSkills?: React.Dispatch<React.SetStateAction<AgentSkillItem[]>>;
}

export function AgentSkillsPanel({
  activeSkills,
  setActiveSkills,
  defaultActiveSkills,
  setDefaultActiveSkills,
  systemInstruction,
  setSystemInstruction,
  dataStructure,
  setDataStructure,
  geminiModel,
  onSaveSettings,
  customPresets = [],
  setCustomPresets,
  selectedPreset,
  setSelectedPreset,
  customSkills = [],
  setCustomSkills
}: AgentSkillsPanelProps) {
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [optimizeMessage, setOptimizeMessage] = useState('');
  const [isSavingNewPreset, setIsSavingNewPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [isSavingNewSkill, setIsSavingNewSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillBadge, setNewSkillBadge] = useState('');
  const [newSkillIcon, setNewSkillIcon] = useState('Brain');

  // Admin password states
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => {
    return sessionStorage.getItem('bridge_lm_skills_admin_unlocked') === 'true';
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordActionType, setPasswordActionType] = useState<'create' | 'edit' | 'delete' | 'import' | null>(null);
  const [pendingActionData, setPendingActionData] = useState<any>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  // Skill import states
  const [isImportingSkill, setIsImportingSkill] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importRawText, setImportRawText] = useState('');
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importedSkillsPreview, setImportedSkillsPreview] = useState<AgentSkillItem[]>([]);
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<Record<string, boolean>>({});

  const handleVerifyPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    try {
      const res = await fetch('/api/admin/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAdminUnlocked(true);
        sessionStorage.setItem('bridge_lm_skills_admin_unlocked', 'true');
        sessionStorage.setItem('bridge_lm_skills_admin_password', adminPasswordInput);
        setShowPasswordPrompt(false);
        setAdminPasswordInput('');
        setOptimizeMessage('Режим администратора успешно активирован');
        setTimeout(() => setOptimizeMessage(''), 3000);
        
        // Resume pending action
        if (passwordActionType === 'create') {
          setIsSavingNewSkill(true);
          setEditingSkillId(null);
          setIsImportingSkill(false);
        } else if (passwordActionType === 'import') {
          setIsImportingSkill(true);
          setIsSavingNewSkill(false);
          setImportUrl('');
          setImportRawText('');
          setImportError('');
          setImportedSkillsPreview([]);
        } else if (passwordActionType === 'edit' && pendingActionData) {
          const skill = pendingActionData;
          setEditingSkillId(skill.id);
          setNewSkillName(skill.name);
          setNewSkillDesc(skill.description);
          setNewSkillBadge(skill.badge || '');
          setNewSkillIcon(skill.iconName || 'Brain');
          setIsSavingNewSkill(true);
          setIsImportingSkill(false);
        } else if (passwordActionType === 'delete' && pendingActionData) {
          executeDeleteCustomSkill(pendingActionData);
        }
        
        setPasswordActionType(null);
        setPendingActionData(null);
      } else {
        setPasswordError(data.error || 'Неверный пароль администратора');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Ошибка связи с сервером');
    }
  };

  const handleLockAdmin = () => {
    setIsAdminUnlocked(false);
    sessionStorage.removeItem('bridge_lm_skills_admin_unlocked');
    sessionStorage.removeItem('bridge_lm_skills_admin_password');
    setOptimizeMessage('Режим администратора отключен');
    setTimeout(() => setOptimizeMessage(''), 3000);
    setIsSavingNewSkill(false);
    setIsImportingSkill(false);
    setEditingSkillId(null);
  };

  const handleEditCustomSkill = (e: React.MouseEvent, skill: AgentSkillItem) => {
    e.stopPropagation();
    if (!isAdminUnlocked) {
      setPendingActionData(skill);
      setPasswordActionType('edit');
      setShowPasswordPrompt(true);
      return;
    }
    setEditingSkillId(skill.id);
    setNewSkillName(skill.name);
    setNewSkillDesc(skill.description);
    setNewSkillBadge(skill.badge || '');
    setNewSkillIcon(skill.iconName || 'Brain');
    setIsSavingNewSkill(true);
    setIsImportingSkill(false);
  };

  const handleAddSkillClick = () => {
    if (!isAdminUnlocked) {
      setPasswordActionType('create');
      setShowPasswordPrompt(true);
      return;
    }
    
    if (!isSavingNewSkill) {
      setNewSkillName('');
      setNewSkillDesc('');
      setNewSkillBadge('');
      setNewSkillIcon('Brain');
      setEditingSkillId(null);
    }
    setIsSavingNewSkill(prev => !prev);
    setIsImportingSkill(false);
    setIsSavingNewPreset(false);
  };

  const handleImportSkillClick = () => {
    if (!isAdminUnlocked) {
      setPasswordActionType('import');
      setShowPasswordPrompt(true);
      return;
    }

    setIsImportingSkill(prev => !prev);
    setIsSavingNewSkill(false);
    setIsSavingNewPreset(false);
    setImportUrl('');
    setImportRawText('');
    setImportError('');
    setImportedSkillsPreview([]);
  };

  const combinedSkills = [...AGENT_SKILLS_LIST, ...customSkills];

  const allPresets = [
    ...PROMPT_PRESETS.map(bp => {
      const customOverride = customPresets.find(cp => cp.id === bp.id);
      return customOverride ? { ...bp, ...customOverride, isCustom: true } : bp;
    }),
    ...customPresets.filter(cp => !PROMPT_PRESETS.some(bp => bp.id === cp.id))
  ];
  const currentPresetObj = allPresets.find(p => p.id === selectedPreset);
  const currentIsCustom = !!(currentPresetObj as any)?.isCustom;
  const isOverride = PROMPT_PRESETS.some(bp => bp.id === selectedPreset);

  const toggleSkill = (skillId: string) => {
    setActiveSkills(prev => {
      const updated = { ...prev, [skillId]: !prev[skillId] };
      return updated;
    });
  };

  const toggleDefaultSkill = (skillId: string) => {
    setDefaultActiveSkills(prev => {
      const updated = { ...prev, [skillId]: !prev[skillId] };
      return updated;
    });
    setOptimizeMessage('Значение по умолчанию изменено!');
    setTimeout(() => setOptimizeMessage(''), 3000);
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = allPresets.find(p => p.id === presetId);
    if (preset) {
      setSystemInstruction(preset.systemInstruction);
      setDataStructure(preset.dataStructure);
      setActiveSkills(preset.activeSkills || {});
      setOptimizeMessage(`Применен профиль: ${preset.name}`);
      setTimeout(() => setOptimizeMessage(''), 4000);
    }
  };

  const handleSaveCurrentAsDefault = () => {
    setDefaultActiveSkills({ ...activeSkills });
    setOptimizeMessage('Выбранный набор навыков сохранен как настройки по умолчанию!');
    setTimeout(() => setOptimizeMessage(''), 4000);
  };

  const handleResetToDefault = () => {
    setActiveSkills({ ...defaultActiveSkills });
    setOptimizeMessage('Текущие навыки сброшены к архивным настройкам по умолчанию!');
    setTimeout(() => setOptimizeMessage(''), 4000);
  };

  const handleUpdateCurrentPreset = () => {
    const existingIndex = customPresets.findIndex(p => p.id === selectedPreset);
    if (existingIndex >= 0) {
      const updatedPresets = [...customPresets];
      updatedPresets[existingIndex] = {
        ...updatedPresets[existingIndex],
        systemInstruction,
        dataStructure,
        activeSkills: { ...activeSkills }
      };
      setCustomPresets(updatedPresets);
      setOptimizeMessage(`Профиль "${updatedPresets[existingIndex].name}" успешно сохранен!`);
      setTimeout(() => setOptimizeMessage(''), 4000);
    } else {
      // It's a built-in preset, override it in customPresets
      const basePreset = PROMPT_PRESETS.find(p => p.id === selectedPreset);
      if (basePreset) {
        const overridePreset = {
          ...basePreset,
          systemInstruction,
          dataStructure,
          activeSkills: { ...activeSkills },
          isCustom: true
        };
    setCustomPresets(prev => [...prev, overridePreset]);
    setOptimizeMessage(`Профиль "${basePreset.name}" успешно обновлен!`);
        setTimeout(() => setOptimizeMessage(''), 4000);
      }
    }
  };

  const handleCreateNewPreset = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newPresetName.trim();
    if (!cleanName) {
      setOptimizeMessage('Ошибка: Укажите имя профиля');
      setTimeout(() => setOptimizeMessage(''), 3000);
      return;
    }

    const newId = `custom-preset-${Date.now()}`;
    const newPreset = {
      id: newId,
      name: cleanName,
      description: newPresetDesc.trim() || 'Пользовательский профиль навыков',
      systemInstruction,
      dataStructure,
      activeSkills: { ...activeSkills },
      isCustom: true
    };
    setCustomPresets(prev => [...prev, newPreset]);
    setSelectedPreset(newId);
    setIsSavingNewPreset(false);
    setNewPresetName('');
    setNewPresetDesc('');
    setOptimizeMessage(`Создан новый профиль: ${newPreset.name}`);
    setTimeout(() => setOptimizeMessage(''), 4000);
  };

  const handleDeletePreset = (presetId: string) => {
    if (confirmDeleteId !== presetId) {
      setConfirmDeleteId(presetId);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    
    setConfirmDeleteId(null);
    setCustomPresets(prev => prev.filter(p => p.id !== presetId));
    
    if (isOverride) {
      // Just reset to built-in defaults but keep it selected
      const fallback = PROMPT_PRESETS.find(p => p.id === presetId);
      if (fallback) {
        setSystemInstruction(fallback.systemInstruction);
        setDataStructure(fallback.dataStructure);
        setActiveSkills(fallback.activeSkills || {});
      }
      setOptimizeMessage('Профиль сброшен к исходным настройкам');
    } else {
      // Fully custom deleted, fall back to general
      setSelectedPreset('general-kbae');
      const fallback = PROMPT_PRESETS.find(p => p.id === 'general-kbae');
      if (fallback) {
        setSystemInstruction(fallback.systemInstruction);
        setDataStructure(fallback.dataStructure);
        setActiveSkills(fallback.activeSkills || {});
      }
      setOptimizeMessage('Профиль удален');
    }
    
    setTimeout(() => setOptimizeMessage(''), 3000);
  };

  const executeDeleteCustomSkill = (skillId: string) => {
    if (setCustomSkills) {
      setCustomSkills(prev => prev.filter(s => s.id !== skillId));
    }
    setActiveSkills(prev => {
      const copy = { ...prev };
      delete copy[skillId];
      return copy;
    });
    setDefaultActiveSkills(prev => {
      const copy = { ...prev };
      delete copy[skillId];
      return copy;
    });
    setOptimizeMessage('Навык удален');
    setTimeout(() => setOptimizeMessage(''), 3000);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim() && !importRawText.trim()) {
      setImportError('Пожалуйста, укажите URL или вставьте текст для импорта');
      return;
    }

    setIsImportLoading(true);
    setImportError('');
    setImportedSkillsPreview([]);

    const password = sessionStorage.getItem('bridge_lm_skills_admin_password') || '';

    try {
      const res = await fetch('/api/admin/import-skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          url: importUrl || undefined,
          rawText: importRawText || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Произошла непредвиденная ошибка на сервере');
      }

      if (data.skills && Array.isArray(data.skills)) {
        setImportedSkillsPreview(data.skills);
        // Pre-select all imported skills by default
        const initialSelected: Record<string, boolean> = {};
        data.skills.forEach((s: any) => {
          initialSelected[s.id] = true;
        });
        setSelectedPreviewIds(initialSelected);
      } else {
        throw new Error('Некорректный формат ответа от сервера');
      }
    } catch (err: any) {
      setImportError(err.message || 'Ошибка связи с сервером');
    } finally {
      setIsImportLoading(false);
    }
  };

  const handleConfirmImport = () => {
    const selectedSkills = importedSkillsPreview.filter(s => selectedPreviewIds[s.id]);
    if (selectedSkills.length === 0) return;

    if (setCustomSkills) {
      setCustomSkills(prev => {
        // Prevent duplicate IDs if user imports multiple times
        const filteredPrev = prev.filter(p => !selectedSkills.some(s => s.id === p.id));
        return [...filteredPrev, ...selectedSkills];
      });
    }

    // Automatically enable imported skills
    setActiveSkills(prev => {
      const copy = { ...prev };
      selectedSkills.forEach(s => {
        copy[s.id] = true;
      });
      return copy;
    });

    setOptimizeMessage(`Успешно импортировано навыков: ${selectedSkills.length}`);
    setIsImportingSkill(false);
    setImportUrl('');
    setImportRawText('');
    setImportedSkillsPreview([]);
    setTimeout(() => setOptimizeMessage(''), 4000);
  };

  const handleTogglePreviewSkill = (id: string) => {
    setSelectedPreviewIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSelectAllPreview = () => {
    const allSelected = importedSkillsPreview.every(s => selectedPreviewIds[s.id]);
    const next: Record<string, boolean> = {};
    importedSkillsPreview.forEach(s => {
      next[s.id] = !allSelected;
    });
    setSelectedPreviewIds(next);
  };

  const handleCreateNewSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminUnlocked) {
      setShowPasswordPrompt(true);
      setPasswordActionType('create');
      return;
    }

    const cleanName = newSkillName.trim();
    if (!cleanName) {
      setOptimizeMessage('Ошибка: Укажите название навыка');
      setTimeout(() => setOptimizeMessage(''), 3000);
      return;
    }
    const cleanDesc = newSkillDesc.trim();
    if (!cleanDesc) {
      setOptimizeMessage('Ошибка: Укажите описание навыка');
      setTimeout(() => setOptimizeMessage(''), 3000);
      return;
    }

    if (editingSkillId) {
      // Editing Mode
      if (setCustomSkills) {
        setCustomSkills(prev => prev.map(s => s.id === editingSkillId ? {
          ...s,
          name: cleanName,
          description: cleanDesc,
          badge: newSkillBadge.trim() || 'Пользовательский',
          iconName: newSkillIcon as any
        } : s));
      }
      setOptimizeMessage(`Навык обновлен: ${cleanName}`);
    } else {
      // Creation Mode
      const newSkillId = `custom-skill-${Date.now()}`;
      const newSkill: AgentSkillItem = {
        id: newSkillId,
        name: cleanName,
        description: cleanDesc,
        badge: newSkillBadge.trim() || 'Пользовательский',
        iconName: newSkillIcon as any
      };

      if (setCustomSkills) {
        setCustomSkills(prev => [...prev, newSkill]);
      }
      
      // Automatically enable it
      setActiveSkills(prev => ({ ...prev, [newSkillId]: true }));
      setOptimizeMessage(`Создан новый навык: ${newSkill.name}`);
    }
    
    setIsSavingNewSkill(false);
    setEditingSkillId(null);
    setNewSkillName('');
    setNewSkillDesc('');
    setNewSkillBadge('');
    setNewSkillIcon('Brain');
    
    setTimeout(() => setOptimizeMessage(''), 4000);
  };

  const handleDeleteCustomSkill = (e: React.MouseEvent, skillId: string) => {
    e.stopPropagation(); // Prevent toggling when deleting
    if (!isAdminUnlocked) {
      setPendingActionData(skillId);
      setPasswordActionType('delete');
      setShowPasswordPrompt(true);
      return;
    }
    executeDeleteCustomSkill(skillId);
  };

  return (
    <div className="bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] p-6 flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
        <div>
          <h3 className="font-serif text-lg italic text-editorial-text flex items-center gap-2">
            <Brain size={20} className="text-editorial-text" />
            Библиотека и навыки Агента (Agentic Skills)
          </h3>
          <p className="text-[10px] text-[#8E8E8A] uppercase tracking-wider mt-1">
            Настройте интеллектуальную стратегию синтеза для оптимального RAG-флоу
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Режим администратора */}
          <div className="flex items-center gap-2 border border-editorial-text/10 px-2.5 py-1 bg-[#FAF9F6] rounded shrink-0">
            {isAdminUnlocked ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wide text-emerald-700 flex items-center gap-1">
                  <Unlock size={10} className="text-emerald-600" />
                  Админ
                </span>
                <button
                  onClick={handleLockAdmin}
                  className="text-[8px] font-mono font-bold uppercase text-rose-700 hover:text-rose-900 border border-rose-300 hover:border-rose-400 bg-rose-50 px-1.5 py-0.5 rounded cursor-pointer transition-all active:scale-95"
                  title="Выйти из режима администратора"
                >
                  Выйти
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setPasswordActionType(null);
                  setPendingActionData(null);
                  setShowPasswordPrompt(true);
                }}
                className="text-[9px] font-mono font-bold uppercase tracking-wide text-editorial-text flex items-center gap-1.5 hover:text-editorial-accent transition-colors cursor-pointer"
                title="Войти в режим администратора для управления навыками"
              >
                <Lock size={10} className="text-gray-400" />
                Администратор
              </button>
            )}
          </div>

          {/* Preset Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase">Профиль:</span>
            <div className="flex items-center gap-2">
              <select
                value={selectedPreset}
                onChange={(e) => handleApplyPreset(e.target.value)}
                className="bg-[#F5F5F3] border border-editorial-text px-2 py-1 text-xs font-medium outline-none cursor-pointer max-w-[200px] truncate"
              >
                {allPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleUpdateCurrentPreset}
                  className="flex items-center justify-center p-1 border border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 cursor-pointer active:scale-95"
                  title="Сохранить текущие промпты и навыки в профиль"
                >
                  <Save size={12} />
                </button>
                {currentIsCustom && (
                  <button
                    onClick={() => handleDeletePreset(selectedPreset)}
                    className={`flex items-center justify-center p-1 border cursor-pointer active:scale-95 transition-colors ${
                      confirmDeleteId === selectedPreset 
                        ? 'border-red-700 bg-red-600 text-white hover:bg-red-700' 
                        : 'border-rose-600 bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                    title={
                      confirmDeleteId === selectedPreset
                        ? "Нажмите еще раз для подтверждения"
                        : (isOverride ? "Сбросить к исходным настройкам" : "Удалить этот профиль")
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  if (!isSavingNewPreset) {
                    setNewPresetName('');
                    setNewPresetDesc('');
                  }
                  setIsSavingNewPreset(prev => !prev);
                }}
                className="flex items-center gap-0.5 b-1 border border-editorial-text bg-white px-2 py-1 hover:bg-gray-100 font-mono text-[9px] uppercase font-bold text-editorial-text cursor-pointer active:scale-95"
                title="Создать новый профиль как копию текущего"
              >
                <Plus size={10} />
                <span>Новый</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {isSavingNewPreset && (
        <form onSubmit={handleCreateNewPreset} className="bg-[#FAF9F6] p-4 border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] space-y-4">
          <div className="flex items-center justify-between border-b border-editorial-text/10 pb-2">
            <h4 className="font-serif text-sm italic text-editorial-text flex items-center gap-2">
              <Plus size={14} />
              Сохранить текущую конфигурацию как новый профиль
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Название профиля <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="Напр., Суппорт Эксперт KNX"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Описание (необязательно)</label>
              <input
                type="text"
                placeholder="Напр., Профиль для сложной KNX телеметрии с логами"
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSavingNewPreset(false);
                setNewPresetName('');
                setNewPresetDesc('');
              }}
              className="px-3 py-1.5 border border-editorial-text bg-[#F5F5F3] hover:bg-gray-200 text-gray-800 font-mono text-[9px] uppercase font-bold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 border border-editorial-text bg-editorial-text text-white hover:bg-editorial-text/90 font-mono text-[9px] uppercase font-bold cursor-pointer transition-all active:scale-95"
            >
              Создать профиль
            </button>
          </div>
        </form>
      )}

      {isSavingNewSkill && (
        <form onSubmit={handleCreateNewSkill} className="bg-[#FAF9F6] p-4 border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] space-y-4">
          <div className="flex items-center justify-between border-b border-editorial-text/10 pb-2">
            <h4 className="font-serif text-sm italic text-editorial-text flex items-center gap-2">
              {editingSkillId ? <Pencil size={14} /> : <Plus size={14} />}
              {editingSkillId ? 'Редактировать пользовательский навык' : 'Создать и активировать новый навык'}
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Название навыка <span className="text-rose-500">*</span></label>
              <input
                type="text"
                required
                placeholder="Напр., API Эксперт"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Бейдж / Категория</label>
              <input
                type="text"
                placeholder="Напр., API, Форматирование, Анализ"
                value={newSkillBadge}
                onChange={(e) => setNewSkillBadge(e.target.value)}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Инструкция / Описание навыка <span className="text-rose-500">*</span></label>
              <textarea
                required
                rows={3}
                placeholder="Напишите конкретную инструкцию, которую Агент должен выполнять при активации этого навыка. Например: 'Всегда находите все API-эндпоинты и форматируйте их в виде таблицы с методами (GET, POST), путями...'"
                value={newSkillDesc}
                onChange={(e) => setNewSkillDesc(e.target.value)}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none font-serif italic"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Иконка навыка</label>
              <div className="flex flex-wrap gap-2 pt-1">
                {['Brain', 'Cpu', 'Database', 'Terminal', 'Activity', 'Layers', 'Sparkles', 'Wand2', 'FileSpreadsheet'].map((iconName) => {
                  const Icon = getIconComponent(iconName);
                  const isSelected = newSkillIcon === iconName;
                  return (
                    <button
                      type="button"
                      key={iconName}
                      onClick={() => setNewSkillIcon(iconName)}
                      className={`p-2 border transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-editorial-text bg-editorial-text text-white' 
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                      title={iconName}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSavingNewSkill(false);
                setEditingSkillId(null);
                setNewSkillName('');
                setNewSkillDesc('');
                setNewSkillBadge('');
                setNewSkillIcon('Brain');
              }}
              className="px-3 py-1.5 border border-editorial-text bg-[#F5F5F3] hover:bg-gray-200 text-gray-800 font-mono text-[9px] uppercase font-bold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 border border-editorial-text bg-editorial-text text-white hover:bg-editorial-text/90 font-mono text-[9px] uppercase font-bold cursor-pointer transition-all active:scale-95"
            >
              {editingSkillId ? 'Сохранить изменения' : 'Создать навык'}
            </button>
          </div>
        </form>
      )}

      {isImportingSkill && (
        <form onSubmit={handleImportSubmit} className="bg-[#FAF9F6] p-4 border-2 border-editorial-text shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] space-y-4">
          <div className="flex items-center justify-between border-b border-editorial-text/10 pb-2">
            <h4 className="font-serif text-sm italic text-editorial-text flex items-center gap-2">
              <RefreshCw size={14} className={isImportLoading ? 'animate-spin' : ''} />
              Импортировать навыки из внешнего источника
            </h4>
          </div>
          <p className="text-[10px] text-gray-600 leading-relaxed font-sans">
            Вставьте URL-адрес файла с репозитория <strong>GitHub</strong>, спецификации <strong>NVIDIA NIM</strong> или документации любого API. Наш ИИ проанализирует содержимое и автоматически синтезирует готовые к использованию структурированные навыки для агента.
          </p>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                URL источника (GitHub raw, NIM API docs, OpenAPI и т.д.)
              </label>
              <input
                type="url"
                disabled={isImportLoading}
                placeholder="https://github.com/username/repo/blob/main/skills/analyst.md или https://build.nvidia.com/..."
                value={importUrl}
                onChange={(e) => {
                  setImportUrl(e.target.value);
                  if (e.target.value.trim()) setImportRawText('');
                }}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none"
              />
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-[9px] font-mono text-gray-400 uppercase">ИЛИ</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                Вставить текст спецификации/документации вручную
              </label>
              <textarea
                rows={4}
                disabled={isImportLoading}
                placeholder="Вставьте сюда сырой текст, README, curl-запросы, описание модели или JSON-структуру навыков..."
                value={importRawText}
                onChange={(e) => {
                  setImportRawText(e.target.value);
                  if (e.target.value.trim()) setImportUrl('');
                }}
                className="w-full bg-white border border-editorial-text px-3 py-1.5 text-xs outline-none font-mono"
              />
            </div>
          </div>

          {importError && (
            <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-300 p-2.5 rounded">
              {importError}
            </div>
          )}

          {importedSkillsPreview.length > 0 && (
            <div className="space-y-2 border-2 border-editorial-text p-3 bg-white mt-4">
              <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
                <span className="text-[10px] font-bold uppercase text-gray-700">Сгенерированные ИИ-навыки ({importedSkillsPreview.length}):</span>
                <button
                  type="button"
                  onClick={handleSelectAllPreview}
                  className="text-[9px] font-mono font-bold text-editorial-text hover:underline cursor-pointer"
                >
                  {importedSkillsPreview.every(s => selectedPreviewIds[s.id]) ? 'Снять выделение' : 'Выбрать все'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                {importedSkillsPreview.map((skill) => {
                  const Icon = getIconComponent(skill.iconName || 'Brain');
                  const isChecked = !!selectedPreviewIds[skill.id];
                  return (
                    <div
                      key={skill.id}
                      onClick={() => handleTogglePreviewSkill(skill.id)}
                      className={`p-2.5 border-2 cursor-pointer transition-all flex items-start gap-2.5 ${
                        isChecked 
                          ? 'border-editorial-text bg-[#FAF9F6]' 
                          : 'border-gray-200 bg-white opacity-60 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5"
                      />
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className="font-serif text-xs font-bold text-editorial-text flex items-center gap-1.5">
                            <Icon size={12} />
                            {skill.name}
                          </h5>
                          <span className="text-[8px] font-mono uppercase bg-editorial-text/5 text-editorial-text border border-editorial-text/10 px-1 py-0.2 rounded font-bold">
                            {skill.badge}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-600 font-serif italic line-clamp-3 leading-relaxed">{skill.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={!Object.values(selectedPreviewIds).some(Boolean)}
                  className="px-4 py-1.5 border border-editorial-text bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 font-mono text-[9px] uppercase font-bold cursor-pointer transition-all active:scale-95 shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
                >
                  Добавить выбранные навыки ({Object.values(selectedPreviewIds).filter(Boolean).length})
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isImportLoading}
              onClick={() => {
                setIsImportingSkill(false);
                setImportUrl('');
                setImportRawText('');
                setImportError('');
                setImportedSkillsPreview([]);
              }}
              className="px-3 py-1.5 border border-editorial-text bg-[#F5F5F3] hover:bg-gray-200 text-gray-800 font-mono text-[9px] uppercase font-bold cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isImportLoading}
              className="px-4 py-1.5 border border-editorial-text bg-editorial-text text-white hover:bg-editorial-text/90 disabled:opacity-50 font-mono text-[9px] uppercase font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
            >
              {isImportLoading ? (
                <>
                  <RefreshCw size={11} className="animate-spin" />
                  Анализируем...
                </>
              ) : (
                'Импортировать'
              )}
            </button>
          </div>
        </form>
      )}

      {/* Defaults Management Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#FAF9F6] p-4 border border-editorial-text/10 rounded">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1">
            <Star size={12} className="text-amber-500 fill-amber-500" />
            Настройки навыков «По умолчанию»
          </span>
          <p className="text-[9px] text-[#8E8E8A]">
            Укажите дефолтные навыки, которые будут автоматически включаться при новых сессиях и перезагрузке
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSaveCurrentAsDefault}
            className="flex items-center gap-1 px-3 py-1.5 border border-editorial-text bg-white hover:bg-editorial-text hover:text-white transition-all font-mono text-[9px] uppercase font-bold text-editorial-text active:scale-95 cursor-pointer"
            title="Запомнить текущие включенные навыки как дефолтные"
          >
            <Save size={10} />
            Запомнить этот набор
          </button>
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1 px-3 py-1.5 border border-editorial-text bg-[#F5F5F3] hover:bg-editorial-accent/25 transition-all font-mono text-[9px] uppercase font-bold text-gray-800 active:scale-95 cursor-pointer"
            title="Применить сохраненный набор навыков по умолчанию к текущему сеансу"
          >
            <Undo2 size={10} />
            Вернуть дефолт
          </button>
        </div>
      </div>

      {optimizeMessage && (
        <div className="bg-editorial-accent/10 border-l-4 border-editorial-text p-3 text-[10px] font-mono uppercase tracking-wider text-editorial-text">
          {optimizeMessage}
        </div>
      )}

      {/* Grid of Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {combinedSkills.map((skill) => {
          const isActive = !!activeSkills[skill.id];
          const isDefaultActive = !!defaultActiveSkills[skill.id];
          const SkillIcon = getIconComponent(skill.iconName);
          const isCustomSkill = skill.id.startsWith('custom-skill-');
          return (
            <div
              key={skill.id}
              onClick={() => toggleSkill(skill.id)}
              className={`p-4 border-2 cursor-pointer transition-all flex flex-col justify-between gap-4 relative group ${
                isActive 
                  ? 'border-editorial-text bg-[#F9F9F7] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' 
                  : 'border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'
              }`}
            >
              {isCustomSkill && (
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={(e) => handleEditCustomSkill(e, skill)}
                    className="p-1 border border-editorial-text bg-[#FAF9F6] text-editorial-text hover:bg-gray-200 rounded cursor-pointer active:scale-95 transition-all shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]"
                    title="Редактировать этот навык"
                  >
                    <Pencil size={10} />
                  </button>
                  <button
                    onClick={(e) => handleDeleteCustomSkill(e, skill.id)}
                    className="p-1 border border-rose-600 bg-rose-50 text-rose-800 hover:bg-rose-100 rounded cursor-pointer active:scale-95 transition-all shadow-[1px_1px_0px_0px_rgba(225,29,72,1)]"
                    title="Удалить этот пользовательский навык"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              )}
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold uppercase text-[#8E8E8A] bg-gray-100 px-1.5 py-0.5 rounded leading-none">
                    {skill.badge}
                  </span>
                  <div className={`w-4 h-4 border-2 border-editorial-text flex items-center justify-center transition-colors shrink-0 ${isActive ? 'bg-editorial-text text-white' : 'bg-transparent'}`}>
                    {isActive && <Check size={10} />}
                  </div>
                </div>
                <h4 className="font-sans text-xs font-bold text-editorial-text flex items-center gap-1.5 pt-1 pr-6">
                  <SkillIcon size={14} className="shrink-0" />
                  {skill.name}
                </h4>
                <p className="text-[10px] text-gray-600 leading-normal pt-1 break-words">
                  {skill.description}
                </p>
              </div>

              {/* Sub-item: Default control */}
              <div className="pt-2 border-t border-dashed border-gray-100 flex items-center justify-between shrink-0">
                <span className="text-[9px] text-[#8E8E8A]">Дефолтный статус:</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDefaultSkill(skill.id);
                  }}
                  className={`text-[8px] font-mono font-bold uppercase border px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1 active:scale-95 ${
                    isDefaultActive 
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 hover:bg-emerald-100' 
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                  title="Нажмите, чтобы изменить значение навыка по умолчанию"
                >
                  <Star size={8} className={isDefaultActive ? 'fill-emerald-700 text-emerald-700' : 'text-gray-400'} />
                  {isDefaultActive ? 'По умолчанию: ВКЛ' : 'По умолчанию: ВЫКЛ'}
                </button>
              </div>
            </div>
          );
        })}

        {/* Special interactive card to add custom skill */}
        <div
          onClick={handleAddSkillClick}
          className="p-6 border-2 border-dashed border-gray-300 hover:border-editorial-text hover:bg-[#FAF9F6] cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-editorial-text h-full min-h-[160px]"
        >
          <Plus size={24} />
          <span className="font-serif text-xs italic font-bold">Добавить новый навык</span>
          <p className="text-[9px] text-center max-w-[200px]">Создайте свою инструкцию для ИИ-агента</p>
        </div>

        {/* Special interactive card to import custom skills */}
        <div
          onClick={handleImportSkillClick}
          className="p-6 border-2 border-dashed border-gray-300 hover:border-editorial-text hover:bg-[#FAF9F6] cursor-pointer transition-all flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-editorial-text h-full min-h-[160px]"
        >
          <RefreshCw size={24} />
          <span className="font-serif text-xs italic font-bold">Импортировать навыки</span>
          <p className="text-[9px] text-center max-w-[200px]">Из GitHub, NVIDIA NIM или любого другого источника</p>
        </div>
      </div>

      {showPasswordPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-editorial-text shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] w-full max-w-md p-6 relative">
            <button
              onClick={() => {
                setShowPasswordPrompt(false);
                setAdminPasswordInput('');
                setPasswordError('');
                setPasswordActionType(null);
                setPendingActionData(null);
              }}
              className="absolute top-3 right-3 text-gray-500 hover:text-editorial-text font-mono font-bold text-lg cursor-pointer"
            >
              ✕
            </button>
            
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <div className="p-3 bg-rose-50 border-2 border-editorial-text rounded-full text-editorial-text">
                <Lock size={24} />
              </div>
              <h3 className="font-serif text-lg font-bold text-editorial-text italic">
                Вход в режим администратора
              </h3>
              <p className="text-xs text-gray-600 leading-normal max-w-xs">
                {passwordActionType === 'create' && 'Для добавления новых пользовательских навыков требуется ввести пароль администратора.'}
                {passwordActionType === 'import' && 'Для импорта пользовательских навыков из внешних источников требуется ввести пароль администратора.'}
                {passwordActionType === 'edit' && 'Для изменения пользовательского навыка требуется ввести пароль администратора.'}
                {passwordActionType === 'delete' && 'Для удаления этого навыка требуется ввести пароль администратора.'}
                {!passwordActionType && 'Введите пароль администратора (используемый для настройки API ключей) для активации режима редактирования.'}
              </p>
            </div>

            <form onSubmit={handleVerifyPasswordSubmit} className="mt-6 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  Пароль администратора
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Введите пароль..."
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  className="w-full bg-white border-2 border-editorial-text px-3 py-2 text-sm outline-none focus:bg-[#FAF9F6]"
                />
              </div>

              {passwordError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-300 p-2.5 rounded">
                  {passwordError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordPrompt(false);
                    setAdminPasswordInput('');
                    setPasswordError('');
                    setPasswordActionType(null);
                    setPendingActionData(null);
                  }}
                  className="px-4 py-2 border border-editorial-text bg-[#F5F5F3] hover:bg-gray-200 text-gray-800 font-mono text-[10px] uppercase font-bold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 border-2 border-editorial-text bg-editorial-text text-white hover:bg-editorial-text/90 font-mono text-[10px] uppercase font-bold cursor-pointer transition-all active:scale-95 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                >
                  Подтвердить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
