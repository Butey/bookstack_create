import { useState } from 'react';
import { motion } from 'motion/react';
import { Brain, Check, RefreshCw, Wand2, Save, Undo2, Star, Plus, Trash2 } from 'lucide-react';
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
  setSelectedPreset
}: AgentSkillsPanelProps) {
  const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
  const [optimizeMessage, setOptimizeMessage] = useState('');
  const [isSavingNewPreset, setIsSavingNewPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
    if (!newPresetName.trim()) {
      setOptimizeMessage('Ошибка: Укажите имя профиля');
      setTimeout(() => setOptimizeMessage(''), 3000);
      return;
    }
    const newId = `custom-preset-${Date.now()}`;
    const newPreset = {
      id: newId,
      name: newPresetName.trim(),
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
                    {p.name} {p.isCustom ? ' (Свой)' : ''}
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
                onClick={() => setIsSavingNewPreset(prev => !prev)}
                className="flex items-center gap-0.5 b-1 border border-editorial-text bg-white px-2 py-1 hover:bg-gray-100 font-mono text-[9px] uppercase font-bold text-editorial-text cursor-pointer active:scale-95"
                title="Сохранить текущую конфигурацию как новый профиль"
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
        {AGENT_SKILLS_LIST.map((skill) => {
          const isActive = !!activeSkills[skill.id];
          const isDefaultActive = !!defaultActiveSkills[skill.id];
          const SkillIcon = getIconComponent(skill.iconName);
          return (
            <div
              key={skill.id}
              onClick={() => toggleSkill(skill.id)}
              className={`p-4 border-2 cursor-pointer transition-all flex flex-col justify-between gap-4 ${
                isActive 
                  ? 'border-editorial-text bg-[#F9F9F7] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' 
                  : 'border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'
              }`}
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold uppercase text-[#8E8E8A] bg-gray-100 px-1.5 py-0.5 rounded leading-none">
                    {skill.badge}
                  </span>
                  <div className={`w-4 h-4 border-2 border-editorial-text flex items-center justify-center transition-colors shrink-0 ${isActive ? 'bg-editorial-text text-white' : 'bg-transparent'}`}>
                    {isActive && <Check size={10} />}
                  </div>
                </div>
                <h4 className="font-sans text-xs font-bold text-editorial-text flex items-center gap-1.5 pt-1">
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
      </div>
    </div>
  );
}
