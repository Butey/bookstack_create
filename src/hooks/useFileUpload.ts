import { useCallback, useState } from 'react';
import axios from 'axios';
import { Source } from '../types';
import { extractTextFromFile, GeminiModelId } from '../services/gemini';
import { indexVectorDocument } from '../services/api';

export function useFileUpload(
  geminiModel: GeminiModelId,
  setSources: React.Dispatch<React.SetStateAction<Source[]>>,
  setSystemInstruction: React.Dispatch<React.SetStateAction<string>>,
  setDataStructure: React.Dispatch<React.SetStateAction<string>>,
  executionControl: {
    abortControllerRef: React.MutableRefObject<AbortController | null>;
    checkPauseAndAbort: () => Promise<void>;
    startTask: (steps: { step: number; total: number; label: string }) => void;
    setSyncStatus: React.Dispatch<React.SetStateAction<{ type: "success" | "error" | "idle"; message: string; url?: string | undefined; }>>;
  },
  activeSkills: Record<string, boolean>,
  pdfExtractionMode: 'gemini' | 'markitdown'
) {
  const [uploadProgress, setUploadProgress] = useState<{ percent: number, label: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    executionControl.startTask({ step: 1, total: 3, label: 'Загрузка файлов' });
    
    const totalWeightPerFile = 100 / files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const basePercent = i * totalWeightPerFile;
      const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
      
      executionControl.setSyncStatus({ type: 'idle', message: `${prefix}Чтение ${file.name}...` });
      setUploadProgress({ percent: Math.round(basePercent), label: `${prefix}Отправка ${file.name}...` });
      
      try {
        await executionControl.checkPauseAndAbort();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('useMarkItDown', String(pdfExtractionMode === 'markitdown'));
        
        const response = await axios.post('/api/process-source', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: executionControl.abortControllerRef.current?.signal,
          timeout: 600000,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const fileUploadPercent = (progressEvent.loaded / progressEvent.total) * 100;
              const percentCompleted = basePercent + (fileUploadPercent * 0.5 * (totalWeightPerFile / 100));
              setUploadProgress({ 
                percent: Math.min(Math.round(percentCompleted), 99), 
                label: `${prefix}Отправка ${file.name}...` 
              });
            }
          }
        });
        
        const base64Str = response.data.base64;
        const mimeType = response.data.mimeType || file.type || 'text/plain';
        const metadata = response.data.metadata;
        const markitdownText = response.data.markitdownText;
        const isParsedLocally = response.data.isParsedLocally;
        
        let extractedText = '';
        if (isParsedLocally && markitdownText) {
          extractedText = markitdownText;
          setUploadProgress({ percent: Math.round(basePercent + totalWeightPerFile), label: `${prefix}Распознано локально (MarkItDown)` });
        } else {
          const extractionStartPercent = basePercent + (totalWeightPerFile * 0.5);
          setUploadProgress({ percent: Math.round(extractionStartPercent), label: `${prefix}Агент читает текст...` });
          executionControl.setSyncStatus({ type: 'idle', message: `${prefix}Агент извлекает текст из ${file.name}...` });
          
          extractedText = await extractTextFromFile(base64Str, mimeType, geminiModel, {
            signal: executionControl.abortControllerRef.current?.signal,
            checkPause: executionControl.checkPauseAndAbort,
            activeSkills
          });
        }
        
        const attachList = [];
        if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
          attachList.push({ name: file.name, mimeType, data: base64Str });
        }
        
        setSources(prev => [...prev, { 
          name: file.name, 
          content: extractedText, 
          attachments: attachList.length ? attachList : undefined,
          metadata: metadata
        }]);

        // Index the file into vector store
        try {
          await indexVectorDocument(`file:${Date.now()}_${file.name}`, extractedText, {
            name: file.name,
            type: 'uploaded_file',
            ...metadata
          });
        } catch (err) {
          console.error('Failed to index file to vector DB', err);
        }

        executionControl.setSyncStatus({ type: 'success', message: `${prefix}Источник "${file.name}" добавлен.` });
        
        setUploadProgress({ percent: Math.round(basePercent + totalWeightPerFile), label: `${prefix}Завершено` });
      } catch (e: any) {
        console.error(e);
        executionControl.setSyncStatus({ type: 'error', message: `Ошибка при обработке ${file.name}: ${e.response?.data?.error || e.message}` });
      }
    }
    
    setTimeout(() => setUploadProgress(null), 1000);
  }, [geminiModel, setSources, executionControl, activeSkills, pdfExtractionMode]);

  const handleSpecialFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => {
    const file = e.target.files?.[0];
    if (!file) return;

    executionControl.setSyncStatus({ type: 'idle', message: `Извлечение ${file.name}...` });
    setUploadProgress({ percent: 0, label: `Отправка конфига ${file.name}...` });
    executionControl.startTask({ step: 1, total: 2, label: 'Импорт конфигурации' });
    
    try {
      await executionControl.checkPauseAndAbort();
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post('/api/process-source', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal: executionControl.abortControllerRef.current?.signal,
        timeout: 600000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress({ 
              percent: Math.min(percentCompleted, 99), 
              label: `Отправка конфига ${file.name}...` 
            });
          }
        }
      });
      
      const base64Str = response.data.base64;
      const mimeType = response.data.mimeType || file.type || 'text/plain';
      
      setUploadProgress({ percent: 100, label: `Агент читает файл...` });
      
      const text = await extractTextFromFile(base64Str, mimeType, geminiModel, {
        signal: executionControl.abortControllerRef.current?.signal,
        checkPause: executionControl.checkPauseAndAbort,
        activeSkills
      });

      if (target === 'system') {
        setSystemInstruction(text);
      } else {
        setDataStructure(text);
      }
      
      executionControl.setSyncStatus({ type: 'success', message: 'Текст успешно импортирован.' });
    } catch (e: any) {
      console.error(e);
      executionControl.setSyncStatus({ type: 'error', message: `Ошибка импорта: ${e.response?.data?.error || e.message}` });
    } finally {
      setUploadProgress(null);
      e.target.value = '';
    }
  }, [geminiModel, setSystemInstruction, setDataStructure, executionControl, activeSkills]);

  return {
    uploadProgress,
    isDragging,
    setIsDragging,
    processFiles,
    handleSpecialFileUpload
  };
}
