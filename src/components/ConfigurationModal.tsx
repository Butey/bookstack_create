import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Terminal, ClipboardList, Brain, Loader2, Download, Upload, Database, Wand2, RefreshCw } from 'lucide-react';
import { GEMINI_MODELS, GeminiModelId, callGemini } from '../services/gemini';
import { syncBookstackToVectorStore } from '../services/api';
import { BookStackCredentials, OmnideskCredentials } from '../types';

interface ConfigurationModalProps {
  isOpen: boolean;
  systemInstruction: string;
  setSystemInstruction: (val: string) => void;
  dataStructure: string;
  setDataStructure: (val: string) => void;
  searchPrompt: string;
  setSearchPrompt: (val: string) => void;
  duplicatePrompt: string;
  setDuplicatePrompt: (val: string) => void;
  contextPrompt: string;
  setContextPrompt: (val: string) => void;
  workMode: 'auto' | 'review';
  setWorkMode: (mode: 'auto' | 'review') => void;
  geminiModel: GeminiModelId;
  setGeminiModel: (id: GeminiModelId) => void;
  credentials: BookStackCredentials;
  setCredentials: (creds: BookStackCredentials) => void;
  omnideskCreds: OmnideskCredentials;
  setOmnideskCreds: (creds: OmnideskCredentials) => void;
  serverConfig: { 
    bookstack: { hasEnv: boolean; envBaseUrl: string };
    omnidesk: { hasEnv: boolean; envDomain: string };
  } | null;
  handleSpecialFileUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => void;
  loadBooks: () => void;
  isLoadingBooks: boolean;
  onSave: () => void;
}

export function ConfigurationModal({
  isOpen,
  systemInstruction, setSystemInstruction,
  dataStructure, setDataStructure,
  searchPrompt, setSearchPrompt,
  duplicatePrompt, setDuplicatePrompt,
  contextPrompt, setContextPrompt,
  workMode, setWorkMode,
  geminiModel, setGeminiModel,
  credentials, setCredentials,
  omnideskCreds, setOmnideskCreds,
  serverConfig,
  handleSpecialFileUpload,
  loadBooks,
  isLoadingBooks,
  onSave
}: ConfigurationModalProps) {
  const [adminPassword, setAdminPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [secureMessage, setSecureMessage] = useState('');
  const [isUpdatingSecure, setIsUpdatingSecure] = useState(false);

  const [isSyncingVector, setIsSyncingVector] = useState(false);
  const [syncVectorMessage, setSyncVectorMessage] = useState('');

  const [tempGeminiKey, setTempGeminiKey] = useState('');
  
  const [optimizingKey, setOptimizingKey] = useState<string | null>(null);
  const [optimizeMessage, setOptimizeMessage] = useState<{key: string, msg: string} | null>(null);

  const handleOptimizeSinglePrompt = async (currentPrompt: string, setter: (val: string) => void, promptType: string, keyName: string) => {
    setOptimizingKey(keyName);
    setOptimizeMessage({key: keyName, msg: 'Анализируем...'});
    try {
      const optimizePrompt = `Вы — элитный Prompt Engineer со специализацией на языковых моделях Gemini.
Ваша задача — оптимизировать промпт для технического ИИ-писателя Bridge.LM.

ТИП ПРОМПТА: ${promptType}

ТЕКУЩИЙ ПРОМПТ:
---
${currentPrompt}
---

Ваша цель: сделайте промпт более технологичным, емким, очистите его от "воды", добавьте строгие инструкции (в том числе негативные, если применимо) для идеального выполнения задачи и устраните любые тавтологии.
Обязательно оставьте язык ответов — РУССКИЙ. Сохраните все переменные (например, {goal}, {sources}), если они есть в исходном промпте.

Возвращайте СТРОГО оптимизированный текст промпта без markdown-оборачивания (\`\`\`), пояснений или дополнительных слов.`;

      const response = await callGemini('gemini-3-flash-preview', [{ role: 'user', parts: [{ text: optimizePrompt }] }]);
      const responseText = response.text;
      const optimized = responseText.trim().replace(/^```[a-z]*\n/g, '').replace(/```$/g, '').trim();
      
      if (optimized) {
        setter(optimized);
        setOptimizeMessage({key: keyName, msg: 'Промпт оптимизирован!'});
      } else {
        throw new Error('Пустой ответ');
      }
    } catch (e: any) {
      console.error(e);
      setOptimizeMessage({key: keyName, msg: `Ошибка: ${e.message || String(e)}`});
    } finally {
      setOptimizingKey(null);
      setTimeout(() => setOptimizeMessage(null), 5000);
    }
  };

  const handleUpdateSecureSettings = async () => {
    setIsUpdatingSecure(true);
    setSecureMessage('');
    try {
      const res = await fetch('/api/settings/secure-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password: adminPassword, 
          geminiApiKey: tempGeminiKey || undefined,
          bookstack: credentials,
          omnidesk: omnideskCreds
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSecureMessage('Все настройки успешно обновлены');
      setIsUnlocked(false);
      setAdminPassword('');
      setTempGeminiKey('');
    } catch (e: any) {
      setSecureMessage(e.message || 'Ошибка обновления настроек');
    } finally {
      setIsUpdatingSecure(false);
      setTimeout(() => setSecureMessage(''), 5000);
    }
  };

  const handleExportMD = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMD = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) setter(content);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="p-8 bg-white border-2 border-editorial-text shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex flex-col gap-6">
            <div className="flex justify-between items-center">
              <h2 className="font-serif text-2xl italic tracking-tight">Настройки Агента</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Системная инструкция агента</label>
                    <button
                      onClick={() => handleOptimizeSinglePrompt(systemInstruction, setSystemInstruction, 'Системная инструкция (Определяет роль, поведение, экспертность)', 'sys')}
                      disabled={optimizingKey === 'sys'}
                      className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-[#0066cc] hover:underline disabled:opacity-50"
                    >
                      {optimizingKey === 'sys' ? <RefreshCw size={10} className="animate-spin text-editorial-text" /> : <Wand2 size={10} />}
                      Оптимизировать
                    </button>
                    {optimizeMessage?.key === 'sys' && <span className={`text-[9px] font-bold ${optimizeMessage.msg.includes('Ошибка') ? 'text-red-500' : 'text-emerald-600'}`}>{optimizeMessage.msg}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleExportMD(systemInstruction, 'system_instruction')} className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Download size={10} /> Экспорт .md
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Upload size={10} /> Импорт .md
                      <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleImportMD(e, setSystemInstruction)} />
                    </label>
                  </div>
                </div>
                <textarea 
                  className="w-full h-24 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                  placeholder="Опишите поведение и личность агента..."
                  value={systemInstruction}
                  onChange={(e) => setSystemInstruction(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Правила структуры данных</label>
                    <button
                      onClick={() => handleOptimizeSinglePrompt(dataStructure, setDataStructure, 'Правила структуры данных (Markdown формат, схема разделов статьи)', 'struct')}
                      disabled={optimizingKey === 'struct'}
                      className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-[#0066cc] hover:underline disabled:opacity-50"
                    >
                      {optimizingKey === 'struct' ? <RefreshCw size={10} className="animate-spin text-editorial-text" /> : <Wand2 size={10} />}
                      Оптимизировать
                    </button>
                    {optimizeMessage?.key === 'struct' && <span className={`text-[9px] font-bold ${optimizeMessage.msg.includes('Ошибка') ? 'text-red-500' : 'text-emerald-600'}`}>{optimizeMessage.msg}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleExportMD(dataStructure, 'data_structure')} className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Download size={10} /> Экспорт .md
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Upload size={10} /> Импорт .md
                      <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleImportMD(e, setDataStructure)} />
                    </label>
                  </div>
                </div>
                <textarea 
                  className="w-full h-32 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                  placeholder="Укажите, как должна быть структурирована статья..."
                  value={dataStructure}
                  onChange={(e) => setDataStructure(e.target.value)}
                />
              </div>

              {/* Removed Old Prompt Engineer Optimization Trigger */}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Генерация поисковых запросов</label>
                    <button
                      onClick={() => handleOptimizeSinglePrompt(searchPrompt, setSearchPrompt, 'Генерация поисковых запросов для Bookstack (должен возвращать JSON)', 'search')}
                      disabled={optimizingKey === 'search'}
                      className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-[#0066cc] hover:underline disabled:opacity-50"
                    >
                      {optimizingKey === 'search' ? <RefreshCw size={10} className="animate-spin text-editorial-text" /> : <Wand2 size={10} />}
                      Оптимизировать
                    </button>
                    {optimizeMessage?.key === 'search' && <span className={`text-[9px] font-bold ${optimizeMessage.msg.includes('Ошибка') ? 'text-red-500' : 'text-emerald-600'}`}>{optimizeMessage.msg}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleExportMD(searchPrompt, 'search_prompt')} className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Download size={10} /> Экспорт .md
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Upload size={10} /> Импорт .md
                      <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleImportMD(e, setSearchPrompt)} />
                    </label>
                  </div>
                </div>
                <textarea 
                  className="w-full h-32 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                  placeholder="Доступные переменные: {goal}, {sources}"
                  value={searchPrompt}
                  onChange={(e) => setSearchPrompt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Оценка дублей (Duplicate Detection)</label>
                    <button
                      onClick={() => handleOptimizeSinglePrompt(duplicatePrompt, setDuplicatePrompt, 'Оценка дублей статей (Duplicate Detection, должен возвращать JSON)', 'dup')}
                      disabled={optimizingKey === 'dup'}
                      className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-[#0066cc] hover:underline disabled:opacity-50"
                    >
                      {optimizingKey === 'dup' ? <RefreshCw size={10} className="animate-spin text-editorial-text" /> : <Wand2 size={10} />}
                      Оптимизировать
                    </button>
                    {optimizeMessage?.key === 'dup' && <span className={`text-[9px] font-bold ${optimizeMessage.msg.includes('Ошибка') ? 'text-red-500' : 'text-emerald-600'}`}>{optimizeMessage.msg}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleExportMD(duplicatePrompt, 'duplicate_prompt')} className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Download size={10} /> Экспорт .md
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Upload size={10} /> Импорт .md
                      <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleImportMD(e, setDuplicatePrompt)} />
                    </label>
                  </div>
                </div>
                <textarea 
                  className="w-full h-32 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                  placeholder="Доступные переменные: {goal}, {sources}, {retrievedPages}"
                  value={duplicatePrompt}
                  onChange={(e) => setDuplicatePrompt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Оценка релевантности (Context Detection)</label>
                    <button
                      onClick={() => handleOptimizeSinglePrompt(contextPrompt, setContextPrompt, 'Оценка релевантности найденных статей текущей цели (Context Detection, должен возвращать JSON)', 'ctx')}
                      disabled={optimizingKey === 'ctx'}
                      className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-[#0066cc] hover:underline disabled:opacity-50"
                    >
                      {optimizingKey === 'ctx' ? <RefreshCw size={10} className="animate-spin text-editorial-text" /> : <Wand2 size={10} />}
                      Оптимизировать
                    </button>
                    {optimizeMessage?.key === 'ctx' && <span className={`text-[9px] font-bold ${optimizeMessage.msg.includes('Ошибка') ? 'text-red-500' : 'text-emerald-600'}`}>{optimizeMessage.msg}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleExportMD(contextPrompt, 'context_prompt')} className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Download size={10} /> Экспорт .md
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer text-[9px] font-bold uppercase tracking-widest text-editorial-text hover:underline">
                      <Upload size={10} /> Импорт .md
                      <input type="file" className="hidden" accept=".md,.txt" onChange={(e) => handleImportMD(e, setContextPrompt)} />
                    </label>
                  </div>
                </div>
                <textarea 
                  className="w-full h-32 p-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-medium"
                  placeholder="Доступные переменные: {goal}, {sources}, {retrievedPages}"
                  value={contextPrompt}
                  onChange={(e) => setContextPrompt(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div className="md:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] mb-3 block">Режим работы Агента (workMode / review)</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setWorkMode('auto')}
                    className={`p-4 border-2 flex flex-col items-start gap-2 text-left transition-all cursor-pointer ${workMode === 'auto' ? 'border-editorial-text bg-editorial-accent/10 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Terminal size={16} className={workMode === 'auto' ? 'text-editorial-text' : 'text-gray-400'} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Автоматический режим (workMode)</span>
                    </div>
                    <p className="text-[9px] leading-relaxed opacity-80">
                      Статьи публикуются напрямую в BookStack без ручной проверки. Идеально для быстрой и автономной синхронизации базы знаний.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkMode('review')}
                    className={`p-4 border-2 flex flex-col items-start gap-2 text-left transition-all cursor-pointer ${workMode === 'review' ? 'border-editorial-text bg-editorial-accent/10 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardList size={16} className={workMode === 'review' ? 'text-editorial-text' : 'text-gray-400'} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Режим ручной проверки (review)</span>
                    </div>
                    <p className="text-[9px] leading-relaxed opacity-80">
                      Статьи генерируются в консоль для предварительного ревью. Вы можете править текст, улучшать промпты и публиковать только после одобрения.
                    </p>
                  </button>
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A] block">Модель Gemini</label>
                <div className="grid grid-cols-1 gap-2">
                  {GEMINI_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setGeminiModel(m.id)}
                      className={`px-4 py-3 border-2 flex items-start gap-3 text-left transition-all ${geminiModel === m.id ? 'border-editorial-text bg-editorial-accent/10 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                    >
                      <Brain size={14} className={`mt-0.5 shrink-0 ${geminiModel === m.id ? 'text-editorial-text' : ''}`} />
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider leading-tight">{m.label}</div>
                        <div className="text-[9px] mt-0.5 opacity-70">{m.description}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {!isUnlocked && (
                <div className="space-y-4 md:col-span-2 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-serif italic text-gray-800">Безопасность и Интеграции</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Omnidesk Поддомен</label>
                       <p className="text-sm font-mono text-editorial-text px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text/20">
                         {omnideskCreds.domain ? `${omnideskCreds.domain}.omnidesk.ru` : 'Не задан'}
                       </p>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">BookStack URL</label>
                       <p className="text-sm font-mono text-editorial-text px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text/20 overflow-hidden text-ellipsis">
                         {credentials.baseUrl || 'Не задан'}
                       </p>
                    </div>
                    {credentials.baseUrl && (
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Синхронизация знаний (Векторное хранилище)</label>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={async () => {
                              setIsUpdatingSecure(true);
                              setSecureMessage('Запуск загрузки базы...');
                              try {
                                await syncBookstackToVectorStore(credentials, (msg) => setSecureMessage(msg));
                                setSecureMessage('Синхронизация успешно завершена.');
                              } catch (e: any) {
                                setSecureMessage('Ошибка: ' + e.message);
                              } finally {
                                setIsUpdatingSecure(false);
                                setTimeout(() => setSecureMessage(''), 5000);
                              }
                            }}
                            disabled={isUpdatingSecure}
                            className="px-4 py-2 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                          >
                            {isUpdatingSecure ? 'Кэширование...' : 'Запустить полное кэширование'}
                          </button>
                          <span className="text-[10px] text-gray-500 italic">Скачивает все статьи из BookStack для быстрого AI-поиска</span>
                        </div>
                      </div>
                    )}
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Управление паролем администратора</label>
                      <div className="relative flex items-center">
                        <input 
                          type="password" 
                          placeholder="Введите ADMIN_PASSWORD для редактирования ключей и почты"
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && setIsUnlocked(true)}
                        />
                        <button 
                          onClick={() => setIsUnlocked(true)}
                          disabled={!adminPassword}
                          className="absolute right-0 h-full px-6 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50"
                        >
                          Разблокировать
                        </button>
                      </div>
                    </div>
                  </div>
                  {secureMessage && (
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mt-2">{secureMessage}</p>
                  )}
                </div>
              )}

              {isUnlocked && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 md:col-span-2 pt-4 border-t-2 border-editorial-text"
                >
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-serif italic text-gray-800">Редактирование защищенных параметров</h3>
                    <button onClick={() => setIsUnlocked(false)} className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:underline">Закрыть</button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Gemini API Key (Оставьте пустым, если не меняете)</label>
                      <input 
                        type="password" 
                        placeholder="AIzaSy..."
                        className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none transition-all text-sm font-mono"
                        value={tempGeminiKey}
                        onChange={(e) => setTempGeminiKey(e.target.value)}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                      <h4 className="md:col-span-2 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">BookStack</h4>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Base URL</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm"
                          value={credentials.baseUrl}
                          onChange={(e) => setCredentials({ ...credentials, baseUrl: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Token ID</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-mono"
                          value={credentials.tokenId === 'SERVER_MANAGED' ? '' : credentials.tokenId}
                          onChange={(e) => setCredentials({ ...credentials, tokenId: e.target.value })}
                          placeholder={credentials.tokenId === 'SERVER_MANAGED' ? 'Задано в .env' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Token Secret</label>
                        <input 
                          type="password" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-mono"
                          value={credentials.tokenSecret === 'SERVER_MANAGED' ? '' : credentials.tokenSecret}
                          onChange={(e) => setCredentials({ ...credentials, tokenSecret: e.target.value })}
                          placeholder={credentials.tokenSecret === 'SERVER_MANAGED' ? 'Задано в .env' : '••••••••'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                      <h4 className="md:col-span-2 text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Omnidesk</h4>
                      <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Поддомен</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-mono"
                          value={omnideskCreds.domain}
                          onChange={(e) => setOmnideskCreds({ ...omnideskCreds, domain: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Email сотрудника</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-mono"
                          value={omnideskCreds.email === 'SERVER_MANAGED' ? '' : omnideskCreds.email}
                          onChange={(e) => setOmnideskCreds({ ...omnideskCreds, email: e.target.value })}
                          placeholder={omnideskCreds.email === 'SERVER_MANAGED' ? 'Задано в .env' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">API Key</label>
                        <input 
                          type="password" 
                          className="w-full px-4 py-3 bg-[#F5F5F3] border-b-2 border-editorial-text focus:bg-white outline-none text-sm font-mono"
                          value={omnideskCreds.apiKey === 'SERVER_MANAGED' ? '' : omnideskCreds.apiKey}
                          onChange={(e) => setOmnideskCreds({ ...omnideskCreds, apiKey: e.target.value })}
                          placeholder={omnideskCreds.apiKey === 'SERVER_MANAGED' ? 'Задано в .env' : '••••••••'}
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleUpdateSecureSettings}
                    disabled={isUpdatingSecure || !adminPassword}
                    className="w-full py-4 bg-editorial-text text-white text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all disabled:opacity-50"
                  >
                    {isUpdatingSecure ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Применить и сохранить все ключи'}
                  </button>
                  
                  {secureMessage && (
                    <p className={`text-[10px] font-bold uppercase tracking-widest text-center ${secureMessage.includes('ошибка') ? 'text-red-500' : 'text-green-600'}`}>
                      {secureMessage}
                    </p>
                  )}
                </motion.div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {credentials.baseUrl && (
                <div className="space-y-1">
                  <button 
                    onClick={async () => {
                      setIsSyncingVector(true);
                      setSyncVectorMessage('Инициализация индексации... Сканируем BookStack...');
                      try {
                        await syncBookstackToVectorStore(credentials, (msg) => setSyncVectorMessage(msg));
                        setSyncVectorMessage('Успешно: база данных векторов полностью синхронизирована!');
                      } catch (e: any) {
                        setSyncVectorMessage('Ошибка индексации: ' + (e.message || String(e)));
                      } finally {
                        setIsSyncingVector(false);
                        setTimeout(() => setSyncVectorMessage(''), 8000);
                      }
                    }}
                    disabled={isSyncingVector}
                    className="w-full py-4 bg-editorial-accent text-editorial-text border-2 border-editorial-text text-xs uppercase tracking-widest font-bold hover:bg-editorial-accent/80 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSyncingVector ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                    {isSyncingVector ? 'Синхронизация знаний...' : 'Реиндексировать Wiki в векторную БД'}
                  </button>
                  {syncVectorMessage && (
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-center py-1 rounded transition-all ${syncVectorMessage.includes('Ошибка') || syncVectorMessage.includes('не удалось') ? 'text-red-500' : 'text-emerald-600'}`}>
                      {syncVectorMessage}
                    </p>
                  )}
                </div>
              )}

              <button 
                onClick={loadBooks}
                className="w-full py-4 bg-editorial-text text-white text-xs uppercase tracking-widest font-bold hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
              >
                {isLoadingBooks ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
                Проверить подключение и загрузить иерархию книг
              </button>
              
              <button 
                onClick={onSave}
                className="w-full py-4 bg-black text-white text-[10px] uppercase tracking-widest font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                Сохранить настройки
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
