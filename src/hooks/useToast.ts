import { useCallback } from 'react';
import { useUIStore } from '../stores';

interface UseToastReturn {
  // Actions
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

export function useToast(): UseToastReturn {
  const { addToast, removeToast, clearToasts } = useUIStore();

  const success = useCallback(
    (message: string, duration = 3000) => {
      addToast({ type: 'success', message, duration });
    },
    [addToast]
  );

  const error = useCallback(
    (message: string, duration = 5000) => {
      addToast({ type: 'error', message, duration });
    },
    [addToast]
  );

  const warning = useCallback(
    (message: string, duration = 4000) => {
      addToast({ type: 'warning', message, duration });
    },
    [addToast]
  );

  const info = useCallback(
    (message: string, duration = 3000) => {
      addToast({ type: 'info', message, duration });
    },
    [addToast]
  );

  const clearAll = useCallback(() => {
    clearToasts();
  }, [clearToasts]);

  return {
    success,
    error,
    warning,
    info,
    removeToast,
    clearAll,
  };
}
