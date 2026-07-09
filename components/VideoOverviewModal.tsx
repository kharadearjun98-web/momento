import React, { useState, useRef } from 'react';
import { X, Video, FileText, Users, Microscope, Play, Palette, Sparkles } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { VideoFormat, VideoDuration } from '../types';
import { supabase } from '../lib/supabase/client';
import { useNotification } from '../lib/useNotification';

type SlideStyle = 'illustrated' | 'minimalist' | 'technical' | 'corporate';

// Progress shown in the UI, mapped from the worker job's phase + percent.
interface VideoJobProgress {
  phase: string;
  script: number;
  images: number;
  narration: number;
  upload: number;
  overall: number;
  message: string;
}

interface VideoOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onGenerated?: () => void;
}

// Map UI format names to the worker's internal format
const FORMAT_MAP: Record<VideoFormat, string> = {
  'Deep Dive': 'deep-dive',
  'Summary': 'summary',
  'Debate': 'debate',
  'Analysis': 'analysis',
};

// Map UI duration to the worker's internal duration
const DURATION_MAP: Record<VideoDuration, string> = {
  '5 min': '5min',
  '10 min': '10min',
  '20 min': '20min',
};

// Turn a worker job phase + overall percent into the 4-stage UI progress.
function mapJobProgress(phase: string, pct: number, status: string): VideoJobProgress {
  const overall = status === 'completed' ? 100 : Math.max(0, Math.min(100, pct));
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  const base: VideoJobProgress = {
    phase: 'script',
    script: 0,
    images: 0,
    narration: 0,
    upload: 0,
    overall,
    message: phase ? `Worker: ${phase}` : 'Working...',
  };

  if (status === 'completed' || phase.startsWith('video:completed')) {
    return { ...base, phase: 'completed', script: 100, images: 100, narration: 100, upload: 100, message: 'Video ready!' };
  }
  if (phase.startsWith('image')) {
    return { ...base, phase: 'images', script: 100, images: clamp(((overall - 15) / 30) * 100), message: 'Generating slide images...' };
  }
  if (phase.startsWith('tts')) {
    return { ...base, phase: 'narration', script: 100, images: 100, narration: clamp(((overall - 45) / 40) * 100), message: 'Generating narration...' };
  }
  if (phase.startsWith('video:mix') || phase.startsWith('video:upload')) {
    return { ...base, phase: 'upload', script: 100, images: 100, narration: 100, upload: clamp(((overall - 85) / 15) * 100), message: 'Mixing audio & finishing...' };
  }
  // default: script phase
  return { ...base, phase: 'script', script: clamp((overall / 15) * 100), message: 'Generating slide structure...' };
}

export const VideoOverviewModal: React.FC<VideoOverviewModalProps> = ({ 
  isOpen, 
  onClose,
  notebookId,
  onGenerated,
}) => {
  const [format, setFormat] = useState<VideoFormat>('Deep Dive');
  const [duration, setDuration] = useState<VideoDuration>('5 min');
  const [style, setStyle] = useState<SlideStyle>('illustrated');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<VideoJobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollCancelRef = useRef(false);
  const notification = useNotification();

  const formats: { id: VideoFormat; icon: React.ReactNode; desc: string }[] = [
    { id: 'Deep Dive', icon: <Video size={20} />, desc: 'In-depth documentary' },
    { id: 'Summary', icon: <FileText size={20} />, desc: 'Quick recap' },
    { id: 'Debate', icon: <Users size={20} />, desc: 'Multiple perspectives' },
    { id: 'Analysis', icon: <Microscope size={20} />, desc: 'Visual breakdown' },
  ];

  const styles: { id: SlideStyle; label: string; desc: string }[] = [
    { id: 'illustrated', label: 'Illustrated', desc: 'Hand-drawn style' },
    { id: 'minimalist', label: 'Minimalist', desc: 'Clean & simple' },
    { id: 'technical', label: 'Technical', desc: 'Blueprint style' },
    { id: 'corporate', label: 'Corporate', desc: 'Professional' },
  ];

  const durations: VideoDuration[] = ['5 min', '10 min', '20 min'];

  const handleGenerate = async () => {
    if (!notebookId) {
      setError('No notebook selected');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(mapJobProgress('queued', 0, 'queued'));

    try {
      // Submit the video job to the worker (it does slides + images + narration + FFmpeg mixing).
      const { data, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          type: 'video',
          input: {
            notebookId,
            title: `Video Overview - ${format}`,
            format: FORMAT_MAP[format],
            duration: DURATION_MAP[duration],
            style,
            customPrompt: prompt || undefined,
            graphMode: 'broad',
          },
        },
      });

      if (createError) throw new Error(createError.message);
      const jobId = data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job service did not return a job id.');
      }

      setProgress(mapJobProgress('queued', 5, 'queued'));
      pollCancelRef.current = false;

      // Poll the job until it finishes. Polling is a plain DB read (RLS lets us
      // see our own job), so it's far more reliable than the realtime socket,
      // which can drop mid-job and cause a false "failed".
      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();
        let missedReads = 0;

        const poll = async () => {
          if (pollCancelRef.current) return resolve();
          if (Date.now() - startedAt > 30 * 60 * 1000) {
            return reject(new Error('Timed out waiting for the video job.'));
          }

          const { data: job, error: pollError } = await supabase
            .from('jobs')
            .select('status, phase, progress_pct, last_error')
            .eq('id', jobId)
            .single();

          if (pollError || !job) {
            // Tolerate transient read errors; only give up after many in a row.
            missedReads += 1;
            if (missedReads > 20) {
              return reject(new Error('Lost connection to the video job.'));
            }
            window.setTimeout(poll, 3000);
            return;
          }
          missedReads = 0;

          setProgress(mapJobProgress(job.phase || '', job.progress_pct ?? 0, job.status));

          if (job.status === 'completed') return resolve();
          if (job.status === 'failed' || job.status === 'dead') {
            return reject(new Error(job.last_error || 'Video job failed.'));
          }
          window.setTimeout(poll, 3000);
        };

        poll();
      });

      notification.video('Video Generated', 'Your visual slideshow is ready in the Output Queue.');
      onGenerated?.();
      onClose();
    } catch (err) {
      console.error('❌ Video generation failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMessage);
      notification.error('Video Generation Failed', errorMessage);
    } finally {
      pollCancelRef.current = true;
      setIsGenerating(false);
    }
  };

  // Overall progress comes straight from the worker job percent.
  const getOverallProgress = () => progress?.overall ?? 0;

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
             <Video size={18} className="text-memento-purple-400" />
             <h2 className="text-sm font-display font-semibold text-white">Video Overview</h2>
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
                      ? 'bg-memento-purple-500/20 border-memento-purple-500/50 shadow-[inset_0_0_20px_rgba(139,92,246,0.2)]' 
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className={`transition-colors duration-200 ${format === item.id ? 'text-memento-purple-400' : 'text-slate-400'}`}>
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
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-purple-500 shadow-[0_0_4px_#8B5CF6]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Style Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Palette size={12} />
              Slide Style
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {styles.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  disabled={isGenerating}
                  className={`p-2.5 rounded-lg text-left transition-all duration-200 border
                    ${style === s.id 
                      ? 'bg-cyan-500/20 border-cyan-500/50' 
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className={`text-xs font-semibold ${style === s.id ? 'text-cyan-400' : 'text-slate-300'}`}>
                    {s.label}
                  </div>
                  <div className="text-[10px] text-slate-500">{s.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Duration Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Duration
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  disabled={isGenerating}
                  className={`px-1 py-2 rounded-lg text-[10px] font-semibold transition-all duration-200 border
                    ${duration === d 
                      ? 'bg-white text-black border-white shadow-lg scale-105 z-10' 
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }
                    ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {d}
                </button>
              ))}
            </div>
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={12} />
              Focus (Optional)
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-purple-500/30 to-pink-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe specific topics or aspects to focus on..."
                disabled={isGenerating}
                className="relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner disabled:opacity-50"
              />
            </div>
          </section>

          {/* Progress Display */}
          {isGenerating && progress && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Generating Video
              </h3>
              <div className="bg-white/5 rounded-xl p-4 space-y-3">
                {/* Overall progress */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{progress.message}</span>
                  <span className="text-white font-mono">{getOverallProgress()}%</span>
                </div>
                <div className="h-2 bg-black/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                    style={{ width: `${getOverallProgress()}%` }}
                  />
                </div>

                {/* Phase indicators */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Script', value: progress.script, phase: 'script' },
                    { label: 'Images', value: progress.images, phase: 'images' },
                    { label: 'Narration', value: progress.narration, phase: 'narration' },
                    { label: 'Upload', value: progress.upload, phase: 'upload' },
                  ].map((p) => (
                    <div key={p.phase} className="text-center">
                      <div className={`text-[10px] font-semibold mb-1 ${
                        progress.phase === p.phase ? 'text-purple-400' : 'text-slate-500'
                      }`}>
                        {p.label}
                      </div>
                      <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            p.value === 100 ? 'bg-green-500' : 'bg-purple-500'
                          }`}
                          style={{ width: `${p.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">
              {error}
            </div>
          )}
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
            variant="primary" 
            size="sm"
            onClick={handleGenerate}
            isLoading={isGenerating}
            icon={!isGenerating ? <Play size={14} /> : undefined}
            className="flex-[2]"
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating...' : 'Generate Video'}
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
};