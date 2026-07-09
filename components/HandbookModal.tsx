import React, { useState } from 'react';
import { X, BookOpen, FileText, Zap, Scroll, Play, Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { HandbookFormat, HandbookLength } from '../types';
import { HandbookProgress } from '../lib/handbookGenerator';
import { useNotification } from '../lib/useNotification';
import { supabase } from '../lib/supabase/client';

interface HandbookModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onHandbookGenerated?: () => void;
}

export const HandbookModal: React.FC<HandbookModalProps> = ({
  isOpen,
  onClose,
  notebookId,
  onHandbookGenerated
}) => {
  const [format, setFormat] = useState<HandbookFormat>('Study Guide');
  const [length, setLength] = useState<HandbookLength>('5 Pages');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<HandbookProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notification = useNotification();

  const formats: { id: HandbookFormat; icon: React.ReactNode; desc: string }[] = [
    { id: 'Study Guide', icon: <BookOpen size={20} />, desc: 'Structured learning' },
    { id: 'Cheatsheet', icon: <Zap size={20} />, desc: 'Quick reference' },
    { id: 'Briefing', icon: <FileText size={20} />, desc: 'Executive summary' },
    { id: 'Comprehensive', icon: <Scroll size={20} />, desc: 'Full detailed guide' },
  ];

  const lengths: HandbookLength[] = ['5 Pages', '15 Pages', '30+ Pages'];

  const handleGenerate = async () => {
    if (!notebookId) {
      setError('No notebook selected');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(null);

    try {
      setProgress({
        phase: 'research',
        overallProgress: 0,
        currentSection: 0,
        totalSections: 0,
        message: 'Submitting handbook job...',
      });

      const { data, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          type: 'handbook',
          input: {
            notebookId,
            format,
            length,
            customPrompt: prompt.trim() || undefined,
          },
        },
      });

      if (createError) throw new Error(createError.message);

      const jobId = data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job service did not return a job id.');
      }

      setProgress({
        phase: 'research',
        overallProgress: 5,
        currentSection: 0,
        totalSections: 0,
        message: 'Handbook job queued...',
      });

      const channel = supabase.channel(`job:${jobId}`);

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          channel.unsubscribe();
          reject(new Error('Timed out waiting for handbook job update.'));
        }, 5 * 60 * 1000);

        channel
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'jobs',
              filter: `id=eq.${jobId}`,
            },
            (payload) => {
              const job = payload.new as {
                status?: string;
                phase?: string;
                progress_pct?: number;
                last_error?: string | null;
              };

              setProgress({
                phase: job.status === 'completed' ? 'completed' : 'research',
                overallProgress: job.progress_pct ?? 0,
                currentSection: 0,
                totalSections: 0,
                message: job.phase ? `Worker phase: ${job.phase}` : 'Handbook job running...',
              });

              if (job.status === 'completed') {
                window.clearTimeout(timeout);
                channel.unsubscribe();
                resolve();
              }

              if (job.status === 'failed' || job.status === 'dead') {
                window.clearTimeout(timeout);
                channel.unsubscribe();
                reject(new Error(job.last_error || 'Handbook job failed.'));
              }
            },
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              window.clearTimeout(timeout);
              channel.unsubscribe();
              reject(new Error('Could not subscribe to handbook job updates.'));
            }
          });
      });

      onHandbookGenerated?.();
      notification.handbook('Handbook Job Complete', 'Your handbook job finished processing.');

      setTimeout(() => {
        setIsGenerating(false);
        setProgress(null);
        onClose();
      }, 1500);

    } catch (err) {
      console.error('Handbook generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
      notification.error('Handbook Generation Failed', errorMessage);
      setIsGenerating(false);
      setProgress(null);
    }
  };

  const getProgressColor = () => {
    if (!progress) return 'bg-blue-500';
    switch (progress.phase) {
      case 'research': return 'bg-purple-500';
      case 'outline': return 'bg-cyan-500';
      case 'content': return 'bg-blue-500';
      case 'continuation': return 'bg-indigo-500';
      case 'finalization': return 'bg-green-500';
      case 'saving': return 'bg-emerald-500';
      case 'completed': return 'bg-green-400';
      default: return 'bg-blue-500';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 animate-in slide-in-from-right-8 duration-300 ease-out">
      <GlassPanel
        variant="panel"
        className="w-full h-full flex flex-col bg-[#050608]/85 backdrop-blur-xl border-l border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-memento-accent-blue" />
            <h2 className="text-sm font-display font-semibold text-white">Generate Handbook</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
            disabled={isGenerating}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Progress Display */}
          {isGenerating && progress && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300 capitalize">{progress.phase}</span>
                <span className="text-xs text-slate-500">{progress.overallProgress}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor()} transition-all duration-500 ease-out`}
                  style={{ width: `${progress.overallProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">{progress.message}</p>
              {progress.wordCount !== undefined && progress.targetWordCount !== undefined && (
                <p className="text-xs text-slate-500">
                  {progress.wordCount.toLocaleString()} / {progress.targetWordCount.toLocaleString()} words
                </p>
              )}
            </div>
          )}

          {/* Format Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Format</h3>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  disabled={isGenerating}
                  className={`relative p-3 rounded-xl flex flex-col items-center gap-2 text-center transition-all duration-200 border
                    ${format === item.id
                      ? 'bg-memento-accent-blue/10 border-memento-accent-blue/40 shadow-[inset_0_0_20px_rgba(96,165,250,0.1)]'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className={`transition-colors duration-200 ${format === item.id ? 'text-memento-accent-blue' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${format === item.id ? 'text-white' : 'text-slate-300'}`}>
                      {item.id}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
                  </div>

                  {/* Active indicator dot */}
                  {format === item.id && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-accent-blue shadow-[0_0_4px_#60A5FA]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Length Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Length
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {lengths.map((l) => (
                <button
                  key={l}
                  onClick={() => setLength(l)}
                  disabled={isGenerating}
                  className={`px-1 py-2 rounded-lg text-[10px] font-semibold transition-all duration-200 border
                    ${length === l
                      ? 'bg-white text-black border-white shadow-lg scale-105 z-10'
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {length === '30+ Pages' && (
              <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                <Sparkles size={10} />
                Extended generation with multiple continuations
              </p>
            )}
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Focus (Optional)
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-blue/30 to-memento-purple-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the target audience and key learning outcomes..."
                disabled={isGenerating}
                className={`relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <Sparkles size={12} className="absolute bottom-3 right-3 text-slate-600" />
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/50 shrink-0 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={onClose}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            variant="glow"
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            icon={
              isGenerating
                ? <Loader2 size={14} className="animate-spin" />
                : progress?.phase === 'completed'
                  ? <CheckCircle size={14} />
                  : <Play size={14} />
            }
            className="flex-[2] bg-memento-accent-blue hover:bg-blue-400 border-none shadow-[0_0_15px_rgba(96,165,250,0.3)]"
          >
            {isGenerating
              ? 'Generating...'
              : progress?.phase === 'completed'
                ? 'Complete!'
                : 'Generate Handbook'}
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
};
