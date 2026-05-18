import { useState, useRef, useCallback } from 'react';

export function useExecutionControl() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef<boolean>(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string, url?: string }>({ type: 'idle', message: '' });
  const [syncProgress, setSyncProgress] = useState<{ step: number; total: number; label: string }>({ step: 0, total: 3, label: '' });

  const checkPauseAndAbort = useCallback(async () => {
    while (isPausedRef.current) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('AbortError');
      }
      await new Promise(r => setTimeout(r, 200));
    }
    if (abortControllerRef.current?.signal.aborted) {
        throw new Error('AbortError');
    }
  }, []);

  const handlePauseToggle = useCallback(() => {
    setIsPaused(prev => {
      isPausedRef.current = !prev;
      return !prev;
    });
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsPaused(false);
    isPausedRef.current = false;
    setIsSyncing(false);
    setSyncStatus({ type: 'error', message: 'Операция отменена пользователем.' });
  }, []);

  const startTask = useCallback((steps: { step: number; total: number; label: string }) => {
    abortControllerRef.current = new AbortController();
    isPausedRef.current = false;
    setIsPaused(false);
    setIsSyncing(true);
    setSyncProgress(steps);
  }, []);

  return {
    abortControllerRef,
    isPausedRef,
    isPaused,
    isSyncing,
    setIsSyncing,
    syncStatus,
    setSyncStatus,
    syncProgress,
    setSyncProgress,
    checkPauseAndAbort,
    handlePauseToggle,
    handleCancel,
    startTask
  };
}
