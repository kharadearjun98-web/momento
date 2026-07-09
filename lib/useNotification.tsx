import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { NotificationContainer, PushNotificationData, NotificationType } from '../components/ui/PushNotification';

interface NotificationContextValue {
  notifications: PushNotificationData[];
  showNotification: (notification: Omit<PushNotificationData, 'id'>) => string;
  dismissNotification: (id: string) => void;
  updateNotification: (id: string, updates: Partial<PushNotificationData>) => void;
  clearAll: () => void;
  
  // Convenience methods
  processing: (title: string, message: string) => string;
  success: (title: string, message: string, duration?: number) => string;
  error: (title: string, message: string, duration?: number) => string;
  warning: (title: string, message: string, duration?: number) => string;
  info: (title: string, message: string, duration?: number) => string;
  audio: (title: string, message: string, action?: PushNotificationData['action']) => string;
  document: (title: string, message: string, action?: PushNotificationData['action']) => string;
  credits: (title: string, message: string) => string;
  quiz: (title: string, message: string, action?: PushNotificationData['action']) => string;
  flashcards: (title: string, message: string, action?: PushNotificationData['action']) => string;
  report: (title: string, message: string, action?: PushNotificationData['action']) => string;
  mindmap: (title: string, message: string, action?: PushNotificationData['action']) => string;
  handbook: (title: string, message: string, action?: PushNotificationData['action']) => string;
  video: (title: string, message: string, action?: PushNotificationData['action']) => string;
  download: (title: string, message: string) => string;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

let notificationIdCounter = 0;

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<PushNotificationData[]>([]);

  const showNotification = useCallback((notification: Omit<PushNotificationData, 'id'>) => {
    const id = `notification-${++notificationIdCounter}-${Date.now()}`;
    const newNotification: PushNotificationData = {
      ...notification,
      id,
      duration: notification.duration ?? 5000,
    };
    
    setNotifications(prev => [...prev, newNotification]);
    return id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateNotification = useCallback((id: string, updates: Partial<PushNotificationData>) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, ...updates } : n)
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Convenience methods
  const processing = useCallback((title: string, message: string) => {
    return showNotification({
      type: 'processing',
      title,
      message,
      duration: 0, // Persistent until manually dismissed
    });
  }, [showNotification]);

  const success = useCallback((title: string, message: string, duration = 5000) => {
    return showNotification({
      type: 'success',
      title,
      message,
      duration,
    });
  }, [showNotification]);

  const error = useCallback((title: string, message: string, duration = 6000) => {
    return showNotification({
      type: 'error',
      title,
      message,
      duration,
    });
  }, [showNotification]);

  const audio = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'audio',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const document = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'document',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const credits = useCallback((title: string, message: string) => {
    return showNotification({
      type: 'credits',
      title,
      message,
      duration: 5000,
    });
  }, [showNotification]);

  const warning = useCallback((title: string, message: string, duration = 6000) => {
    return showNotification({
      type: 'warning',
      title,
      message,
      duration,
    });
  }, [showNotification]);

  const info = useCallback((title: string, message: string, duration = 5000) => {
    return showNotification({
      type: 'info',
      title,
      message,
      duration,
    });
  }, [showNotification]);

  const quiz = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'quiz',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const flashcards = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'flashcards',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const report = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'report',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const mindmap = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'mindmap',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const handbook = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'handbook',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const video = useCallback((title: string, message: string, action?: PushNotificationData['action']) => {
    return showNotification({
      type: 'video',
      title,
      message,
      duration: 6000,
      action,
    });
  }, [showNotification]);

  const download = useCallback((title: string, message: string) => {
    return showNotification({
      type: 'download',
      title,
      message,
      duration: 5000,
    });
  }, [showNotification]);

  const value: NotificationContextValue = {
    notifications,
    showNotification,
    dismissNotification,
    updateNotification,
    clearAll,
    processing,
    success,
    error,
    warning,
    info,
    audio,
    document,
    credits,
    quiz,
    flashcards,
    report,
    mindmap,
    handbook,
    video,
    download,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer 
        notifications={notifications} 
        onDismiss={dismissNotification} 
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

// Standalone function for use outside React components
// This creates a simple imperative API
class NotificationManager {
  private static instance: NotificationManager;
  private listeners: Set<(notification: Omit<PushNotificationData, 'id'>) => string> = new Set();
  private dismissListeners: Set<(id: string) => void> = new Set();
  private updateListeners: Set<(id: string, updates: Partial<PushNotificationData>) => void> = new Set();

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  subscribe(
    showFn: (notification: Omit<PushNotificationData, 'id'>) => string,
    dismissFn: (id: string) => void,
    updateFn: (id: string, updates: Partial<PushNotificationData>) => void
  ) {
    this.listeners.add(showFn);
    this.dismissListeners.add(dismissFn);
    this.updateListeners.add(updateFn);
    return () => {
      this.listeners.delete(showFn);
      this.dismissListeners.delete(dismissFn);
      this.updateListeners.delete(updateFn);
    };
  }

  show(notification: Omit<PushNotificationData, 'id'>): string {
    let id = '';
    this.listeners.forEach(fn => {
      id = fn(notification);
    });
    return id;
  }

  dismiss(id: string) {
    this.dismissListeners.forEach(fn => fn(id));
  }

  update(id: string, updates: Partial<PushNotificationData>) {
    this.updateListeners.forEach(fn => fn(id, updates));
  }

  processing(title: string, message: string): string {
    return this.show({ type: 'processing', title, message, duration: 0 });
  }

  success(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'success', title, message, duration });
  }

  error(title: string, message: string, duration = 6000): string {
    return this.show({ type: 'error', title, message, duration });
  }

  warning(title: string, message: string, duration = 6000): string {
    return this.show({ type: 'warning', title, message, duration });
  }

  info(title: string, message: string, duration = 5000): string {
    return this.show({ type: 'info', title, message, duration });
  }

  audio(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'audio', title, message, duration: 6000, action });
  }

  document(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'document', title, message, duration: 6000, action });
  }

  credits(title: string, message: string): string {
    return this.show({ type: 'credits', title, message, duration: 5000 });
  }

  quiz(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'quiz', title, message, duration: 6000, action });
  }

  flashcards(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'flashcards', title, message, duration: 6000, action });
  }

  report(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'report', title, message, duration: 6000, action });
  }

  mindmap(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'mindmap', title, message, duration: 6000, action });
  }

  handbook(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'handbook', title, message, duration: 6000, action });
  }

  video(title: string, message: string, action?: PushNotificationData['action']): string {
    return this.show({ type: 'video', title, message, duration: 6000, action });
  }

  download(title: string, message: string): string {
    return this.show({ type: 'download', title, message, duration: 5000 });
  }
}

export const pushNotify = NotificationManager.getInstance();

export default useNotification;
