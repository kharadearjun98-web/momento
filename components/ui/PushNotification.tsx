import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Volume2,
  FileText,
  Coins,
  Download,
  AlertCircle,
  Headphones,
  BookOpen,
  Brain,
  Sparkles,
  X,
  AlertTriangle,
  HelpCircle,
  Video,
  Layers,
  MessageSquare,
  Zap,
  FileWarning,
  RefreshCw
} from 'lucide-react';

export type NotificationType = 
  | 'processing' 
  | 'success' 
  | 'error' 
  | 'warning'
  | 'info'
  | 'audio' 
  | 'document' 
  | 'credits'
  | 'download'
  | 'handbook'
  | 'mindmap'
  | 'ai'
  | 'quiz'
  | 'flashcards'
  | 'report'
  | 'video'
  | 'slides'
  | 'chat'
  | 'upload'
  | 'retry';

export interface PushNotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number; // ms, default 5000, 0 for persistent
  onClose?: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface PushNotificationProps {
  notification: PushNotificationData;
  onDismiss: (id: string) => void;
}

const iconConfig: Record<NotificationType, { 
  icon: React.ElementType; 
  bgColor: string; 
  iconColor: string;
  pulseColor: string;
}> = {
  processing: {
    icon: Loader2,
    bgColor: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    pulseColor: 'rgba(59, 130, 246, 0.3)'
  },
  success: {
    icon: CheckCircle2,
    bgColor: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    pulseColor: 'rgba(16, 185, 129, 0.3)'
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-500/20',
    iconColor: 'text-red-400',
    pulseColor: 'rgba(239, 68, 68, 0.3)'
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    pulseColor: 'rgba(245, 158, 11, 0.3)'
  },
  info: {
    icon: HelpCircle,
    bgColor: 'bg-sky-500/20',
    iconColor: 'text-sky-400',
    pulseColor: 'rgba(14, 165, 233, 0.3)'
  },
  audio: {
    icon: Volume2,
    bgColor: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    pulseColor: 'rgba(16, 185, 129, 0.3)'
  },
  document: {
    icon: FileText,
    bgColor: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    pulseColor: 'rgba(16, 185, 129, 0.3)'
  },
  credits: {
    icon: Coins,
    bgColor: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    pulseColor: 'rgba(16, 185, 129, 0.3)'
  },
  download: {
    icon: Download,
    bgColor: 'bg-cyan-500/20',
    iconColor: 'text-cyan-400',
    pulseColor: 'rgba(6, 182, 212, 0.3)'
  },
  handbook: {
    icon: BookOpen,
    bgColor: 'bg-purple-500/20',
    iconColor: 'text-purple-400',
    pulseColor: 'rgba(168, 85, 247, 0.3)'
  },
  mindmap: {
    icon: Brain,
    bgColor: 'bg-pink-500/20',
    iconColor: 'text-pink-400',
    pulseColor: 'rgba(236, 72, 153, 0.3)'
  },
  ai: {
    icon: Sparkles,
    bgColor: 'bg-violet-500/20',
    iconColor: 'text-violet-400',
    pulseColor: 'rgba(139, 92, 246, 0.3)'
  },
  quiz: {
    icon: HelpCircle,
    bgColor: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
    pulseColor: 'rgba(249, 115, 22, 0.3)'
  },
  flashcards: {
    icon: Layers,
    bgColor: 'bg-teal-500/20',
    iconColor: 'text-teal-400',
    pulseColor: 'rgba(20, 184, 166, 0.3)'
  },
  report: {
    icon: FileText,
    bgColor: 'bg-indigo-500/20',
    iconColor: 'text-indigo-400',
    pulseColor: 'rgba(99, 102, 241, 0.3)'
  },
  video: {
    icon: Video,
    bgColor: 'bg-rose-500/20',
    iconColor: 'text-rose-400',
    pulseColor: 'rgba(244, 63, 94, 0.3)'
  },
  slides: {
    icon: Layers,
    bgColor: 'bg-lime-500/20',
    iconColor: 'text-lime-400',
    pulseColor: 'rgba(132, 204, 22, 0.3)'
  },
  chat: {
    icon: MessageSquare,
    bgColor: 'bg-cyan-500/20',
    iconColor: 'text-cyan-400',
    pulseColor: 'rgba(6, 182, 212, 0.3)'
  },
  upload: {
    icon: Zap,
    bgColor: 'bg-yellow-500/20',
    iconColor: 'text-yellow-400',
    pulseColor: 'rgba(234, 179, 8, 0.3)'
  },
  retry: {
    icon: RefreshCw,
    bgColor: 'bg-slate-500/20',
    iconColor: 'text-slate-400',
    pulseColor: 'rgba(100, 116, 139, 0.3)'
  }
};

const PushNotificationItem: React.FC<PushNotificationProps> = ({ notification, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(true);
  const config = iconConfig[notification.type];
  const Icon = config.icon;
  const isProcessing = notification.type === 'processing';
  const isSuccess = ['success', 'audio', 'document', 'credits', 'download', 'handbook', 'mindmap', 'quiz', 'flashcards', 'report', 'video', 'slides', 'chat', 'upload', 'info'].includes(notification.type);
  const isWarning = notification.type === 'warning';
  const isError = notification.type === 'error';

  useEffect(() => {
    if (notification.duration !== 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss(notification.id), 300);
      }, notification.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.duration, notification.id, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss(notification.id);
      notification.onClose?.();
    }, 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.95 }}
      animate={{ 
        opacity: isVisible ? 1 : 0, 
        x: isVisible ? 0 : 100, 
        scale: isVisible ? 1 : 0.95 
      }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 30,
        mass: 0.8
      }}
      className="relative group"
    >
      {/* Main notification card */}
      <div className="relative flex items-start gap-4 p-4 pr-10 rounded-2xl 
                      bg-[#0D1117]/95 backdrop-blur-xl
                      border border-white/10
                      shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]
                      min-w-[320px] max-w-[400px]
                      overflow-hidden">
        
        {/* Gradient accent line */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl
                        ${isError ? 'bg-gradient-to-b from-red-500 to-red-600' :
                          isWarning ? 'bg-gradient-to-b from-amber-500 to-amber-600' :
                          isProcessing ? 'bg-gradient-to-b from-blue-500 to-blue-600' :
                          'bg-gradient-to-b from-emerald-400 to-emerald-500'}`} 
        />

        {/* Status indicator (checkmark for success states) */}
        {isSuccess && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 500 }}
            className="absolute left-6 top-1/2 -translate-y-1/2 -translate-x-1/2"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
          </motion.div>
        )}

        {/* Processing spinner indicator */}
        {isProcessing && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute left-6 top-1/2 -translate-y-1/2 -translate-x-1/2"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-3.5 h-3.5 text-blue-400" />
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Warning indicator */}
        {isWarning && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 500 }}
            className="absolute left-6 top-1/2 -translate-y-1/2 -translate-x-1/2"
          >
            <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </motion.div>
        )}

        {/* Error indicator */}
        {isError && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 500 }}
            className="absolute left-6 top-1/2 -translate-y-1/2 -translate-x-1/2"
          >
            <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-3.5 h-3.5 text-red-400" />
            </div>
          </motion.div>
        )}

        {/* Icon container with glow effect */}
        <div className="relative ml-4">
          {/* Pulse effect for processing */}
          {isProcessing && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: config.pulseColor }}
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            />
          )}
          
          {/* Icon background circle */}
          <div className={`relative w-12 h-12 rounded-full ${config.bgColor} 
                          flex items-center justify-center
                          ring-1 ring-white/10`}>
            {isProcessing ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Headphones className={`w-6 h-6 ${config.iconColor}`} />
              </motion.div>
            ) : (
              <Icon className={`w-6 h-6 ${config.iconColor}`} />
            )}
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0 pt-0.5">
          <h4 className="text-[15px] font-semibold text-white leading-tight mb-1">
            {notification.title}
          </h4>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            {notification.message}
          </p>
          
          {/* Action button */}
          {notification.action && (
            <motion.button
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={notification.action.onClick}
              className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300
                         transition-colors duration-200"
            >
              {notification.action.label} →
            </motion.button>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-full
                     text-slate-500 hover:text-white hover:bg-white/10
                     opacity-0 group-hover:opacity-100
                     transition-all duration-200"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress bar for timed notifications */}
        {notification.duration !== 0 && (
          <motion.div
            className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-cyan-500/50 to-purple-500/50"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ 
              duration: (notification.duration || 5000) / 1000, 
              ease: 'linear' 
            }}
          />
        )}
      </div>
    </motion.div>
  );
};

// Notification container that manages the stack
interface NotificationContainerProps {
  notifications: PushNotificationData[];
  onDismiss: (id: string) => void;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({ 
  notifications, 
  onDismiss 
}) => {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <PushNotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PushNotificationItem;
