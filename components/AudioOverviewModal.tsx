import React, { useState, useRef } from 'react';
import { X, Headphones, ShieldAlert, Users, Microscope, Clock, Sparkles, Play, User, StopCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { AudioFormat, AudioDuration } from '../types';
import { supabase } from '../lib/supabase/client';
import { useNotification } from '../lib/useNotification';

interface AudioOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onGenerated?: () => void;
  editingAsset?: {
    id: string;
    title: string;
    metadata?: {
      format?: string;
      duration?: string;
      speakerNames?: {
        host1?: string;
        host2?: string;
        solo?: string;
      };
    };
  } | null;
}

interface AudioJobProgress {
  phase: string;
  progressPct: number;
  message: string;
}

export const AudioOverviewModal: React.FC<AudioOverviewModalProps> = ({ isOpen, onClose, notebookId, onGenerated, editingAsset }) => {
  // Initialize state with editing asset data if provided
  const initialFormat = editingAsset?.metadata?.format
    ? (editingAsset.metadata.format.charAt(0).toUpperCase() + editingAsset.metadata.format.slice(1).replace('-', ' ')) as AudioFormat
    : 'Deep Dive';

  const initialDuration = editingAsset?.metadata?.duration
    ? (editingAsset.metadata.duration === '10min' ? '10 min'
      : editingAsset.metadata.duration === '30min' ? '30 min'
        : editingAsset.metadata.duration === '1hr' ? '1 hr'
          : editingAsset.metadata.duration === '3hr' ? '3 hr'
            : '10 min') as AudioDuration
    : '10 min';

  const [format, setFormat] = useState<AudioFormat>(initialFormat);
  const [duration, setDuration] = useState<AudioDuration>(initialDuration);
  const [graphMode, setGraphMode] = useState<'broad' | 'focused' | 'exploratory'>('broad');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<AudioJobProgress | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  const [customMinutes, setCustomMinutes] = useState(45);
  const notification = useNotification();
  const [speakerNames, setSpeakerNames] = useState({
    host1: editingAsset?.metadata?.speakerNames?.host1 || 'Alex',
    host2: editingAsset?.metadata?.speakerNames?.host2 || 'Jordan',
    solo: editingAsset?.metadata?.speakerNames?.solo || 'Alex',
  });
  const [speakerPersonalities, setSpeakerPersonalities] = useState({
    host1: 'Enthusiastic, curious, asks great questions. Uses natural speech patterns with excitement.',
    host2: 'Analytical, thorough, provides deep explanations. Clear and methodical communicator.',
    solo: 'Knowledgeable, enthusiastic, and clear. Makes complex topics accessible and engaging.',
  });

  const pollCancelRef = useRef(false);

  // Handle cancel generation
  const handleCancel = () => {
    pollCancelRef.current = true;
    setIsGenerating(false);
    setProgress(null);
    setProgressMessage('');
    notification.info('Audio Job Still Running', 'The worker job will continue in the background.');
  };

  // Update state when editingAsset changes
  React.useEffect(() => {
    if (editingAsset) {
      const fmt = editingAsset.metadata?.format
        ? (editingAsset.metadata.format.charAt(0).toUpperCase() + editingAsset.metadata.format.slice(1).replace('-', ' ')) as AudioFormat
        : 'Deep Dive';
      setFormat(fmt);

      const dur = editingAsset.metadata?.duration
        ? (editingAsset.metadata.duration === '10min' ? '10 min'
          : editingAsset.metadata.duration === '30min' ? '30 min'
            : editingAsset.metadata.duration === '1hr' ? '1 hr'
              : editingAsset.metadata.duration === '3hr' ? '3 hr'
                : '10 min') as AudioDuration
        : '10 min';
      setDuration(dur);

      if (editingAsset.metadata?.speakerNames) {
        setSpeakerNames({
          host1: editingAsset.metadata.speakerNames.host1 || 'Alex',
          host2: editingAsset.metadata.speakerNames.host2 || 'Jordan',
          solo: editingAsset.metadata.speakerNames.solo || 'Alex',
        });
      }
    }
  }, [editingAsset]);

  // Personality presets
  const personalityPresets = {
    host1: [
      { name: 'Enthusiastic', desc: 'Enthusiastic, curious, asks great questions. Uses natural speech patterns with excitement.' },
      { name: 'Skeptical', desc: 'Skeptical and questioning, challenges ideas and seeks deeper understanding.' },
      { name: 'Casual', desc: 'Casual and relatable, uses everyday language and humor to connect with listeners.' },
      { name: 'Professional', desc: 'Professional and articulate, maintains formal tone while being engaging.' },
    ],
    host2: [
      { name: 'Analytical', desc: 'Analytical, thorough, provides deep explanations. Clear and methodical communicator.' },
      { name: 'Creative', desc: 'Creative and imaginative, draws unexpected connections and uses vivid examples.' },
      { name: 'Technical', desc: 'Technical expert, focuses on precise details and scientific accuracy.' },
      { name: 'Storyteller', desc: 'Engaging storyteller, weaves narratives and uses compelling anecdotes.' },
    ],
    solo: [
      { name: 'Educator', desc: 'Knowledgeable, enthusiastic, and clear. Makes complex topics accessible and engaging.' },
      { name: 'Expert', desc: 'Authoritative expert, provides deep insights with confidence and precision.' },
      { name: 'Conversational', desc: 'Warm and conversational, like talking to a knowledgeable friend over coffee.' },
      { name: 'Motivational', desc: 'Inspiring and energetic, encourages action and emphasizes practical applications.' },
    ],
  };

  const formats: { id: AudioFormat; icon: React.ReactNode; desc: string }[] = [
    { id: 'Solo', icon: <User size={20} />, desc: 'One speaker explains' },
    { id: 'Deep Dive', icon: <Headphones size={20} />, desc: 'Immersive podcast' },
    { id: 'Critical', icon: <ShieldAlert size={20} />, desc: 'Skeptical review' },
    { id: 'Debate', icon: <Users size={20} />, desc: 'Opposing views' },
    { id: 'Analysis', icon: <Microscope size={20} />, desc: 'Data breakdown' },
  ];

  const durations: AudioDuration[] = ['10 min', '30 min', '1 hr', '3 hr', 'Custom'];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgressMessage('Submitting audio job...');
    setProgress({ phase: 'queued', progressPct: 0, message: 'Submitting audio job...' });

    try {
      const formatMap = {
        'Solo': 'solo' as const,
        'Deep Dive': 'deep-dive' as const,
        'Critical': 'critical' as const,
        'Debate': 'debate' as const,
        'Analysis': 'analysis' as const,
      };

      const durationMap: Record<string, string> = {
        '10 min': '10min',
        '30 min': '30min',
        '1 hr': '1hr',
        '3 hr': '3hr',
        'Custom': `${customMinutes}min`,
      };

      const title = editingAsset
        ? `${editingAsset.title} (Updated)`
        : `Audio Overview - ${format}`;

      const { data, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          type: 'audio',
          input: {
            notebookId,
            title,
            format: formatMap[format],
            duration: durationMap[duration],
            graphMode,
            customPrompt: prompt || undefined,
            speakerNames,
            speakerPersonalities,
            replaceAssetId: editingAsset?.id,
          },
        },
      });

      if (createError) throw new Error(createError.message);
      const jobId = data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job service did not return a job id.');
      }

      setProgress({ phase: 'queued', progressPct: 5, message: 'Audio job queued...' });
      setProgressMessage('Audio job queued...');
      pollCancelRef.current = false;

      // Poll the job status. Polling is a plain DB read (RLS lets us see our own
      // job), so it's far more reliable than the realtime socket, which can drop
      // mid-job and cause a false "failed".
      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();
        let missedReads = 0;

        const poll = async () => {
          if (pollCancelRef.current) return resolve();
          if (Date.now() - startedAt > 30 * 60 * 1000) {
            return reject(new Error('Timed out waiting for the audio job.'));
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
              return reject(new Error('Lost connection to the audio job.'));
            }
            window.setTimeout(poll, 3000);
            return;
          }
          missedReads = 0;

          const message = job.phase ? `Worker phase: ${job.phase}` : 'Audio job running...';
          setProgress({
            phase: job.status === 'completed' ? 'completed' : job.phase || job.status || 'running',
            progressPct: job.progress_pct ?? 0,
            message,
          });
          setProgressMessage(message);

          if (job.status === 'completed') return resolve();
          if (job.status === 'failed' || job.status === 'dead') {
            return reject(new Error(job.last_error || 'Audio job failed.'));
          }
          window.setTimeout(poll, 3000);
        };

        poll();
      });

      notification.audio(
        editingAsset ? 'Audio Regeneration Complete' : 'Audio Job Complete',
        'Check the Output Queue below to play it.',
        { label: 'Open Queue', onClick: () => onGenerated?.() }
      );
      onGenerated?.(); // Trigger refresh of queue
      onClose();
    } catch (error) {
      console.error('Error generating audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Don't show notification for user cancellation
      if (errorMessage !== 'Audio generation was cancelled by user') {
        notification.error('Audio Generation Failed', errorMessage);
      } else {
        console.log('🛑 Audio generation cancelled by user');
        notification.info('Generation Cancelled', 'Audio generation was stopped.');
      }
    } finally {
      pollCancelRef.current = true;
      setIsGenerating(false);
      setProgress(null);
      setProgressMessage('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 animate-in slide-in-from-right-8 duration-300 ease-out flex">
      <div className="w-full h-full flex flex-col bg-[#050608]/85 backdrop-blur-xl border-l border-white/10 shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Headphones size={18} className="text-memento-accent-cyan" />
            <h2 className="text-sm font-display font-semibold text-white">
              {editingAsset ? 'Edit Audio Overview' : 'Audio Overview'}
            </h2>
            {editingAsset && (
              <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/30">
                Regenerating
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(34,211,238,0.6) rgba(15,23,42,0.5)',
          }}
        >

          {/* Format Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Format</h3>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  className={`relative p-3 rounded-xl flex flex-col items-center gap-2 text-center transition-all duration-200 border
                    ${format === item.id
                      ? 'bg-memento-accent-cyan/10 border-memento-accent-cyan/40 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }`}
                >
                  <div className={`transition-colors duration-200 ${format === item.id ? 'text-memento-accent-cyan' : 'text-slate-400'}`}>
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
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-accent-cyan shadow-[0_0_4px_#22D3EE]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Speaker Names */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Speaker Names</h3>
            {format === 'Solo' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={speakerNames.solo}
                  onChange={(e) => setSpeakerNames({ ...speakerNames, solo: e.target.value })}
                  placeholder="Speaker name"
                  className="w-full bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={speakerNames.host1}
                  onChange={(e) => setSpeakerNames({ ...speakerNames, host1: e.target.value })}
                  placeholder="Host 1 name"
                  className="bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors"
                />
                <input
                  type="text"
                  value={speakerNames.host2}
                  onChange={(e) => setSpeakerNames({ ...speakerNames, host2: e.target.value })}
                  placeholder="Host 2 name"
                  className="bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors"
                />
              </div>
            )}
          </section>

          {/* Speaker Personalities */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Speaker Personality</h3>
            {format === 'Solo' ? (
              <div className="space-y-2">
                <div className="flex gap-1 flex-wrap">
                  {personalityPresets.solo.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => setSpeakerPersonalities({ ...speakerPersonalities, solo: preset.desc })}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${speakerPersonalities.solo === preset.desc
                        ? 'bg-memento-accent-cyan/20 text-memento-accent-cyan border border-memento-accent-cyan/40'
                        : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <textarea
                  value={speakerPersonalities.solo}
                  onChange={(e) => setSpeakerPersonalities({ ...speakerPersonalities, solo: e.target.value })}
                  placeholder="Describe the speaker's personality and style..."
                  className="w-full h-16 bg-[#0B0E13] border border-white/10 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors resize-none"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 font-medium">Host 1 ({speakerNames.host1})</label>
                  <div className="flex gap-1 flex-wrap">
                    {personalityPresets.host1.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setSpeakerPersonalities({ ...speakerPersonalities, host1: preset.desc })}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${speakerPersonalities.host1 === preset.desc
                          ? 'bg-memento-accent-cyan/20 text-memento-accent-cyan border border-memento-accent-cyan/40'
                          : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={speakerPersonalities.host1}
                    onChange={(e) => setSpeakerPersonalities({ ...speakerPersonalities, host1: e.target.value })}
                    placeholder="Host 1 personality..."
                    className="w-full h-14 bg-[#0B0E13] border border-white/10 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors resize-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 font-medium">Host 2 ({speakerNames.host2})</label>
                  <div className="flex gap-1 flex-wrap">
                    {personalityPresets.host2.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => setSpeakerPersonalities({ ...speakerPersonalities, host2: preset.desc })}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${speakerPersonalities.host2 === preset.desc
                          ? 'bg-memento-accent-cyan/20 text-memento-accent-cyan border border-memento-accent-cyan/40'
                          : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={speakerPersonalities.host2}
                    onChange={(e) => setSpeakerPersonalities({ ...speakerPersonalities, host2: e.target.value })}
                    placeholder="Host 2 personality..."
                    className="w-full h-14 bg-[#0B0E13] border border-white/10 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/40 transition-colors resize-none"
                  />
                </div>
              </div>
            )}
          </section>

          {/* Duration Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Duration
            </h3>
            <div className="grid grid-cols-5 gap-2">
              {durations.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`px-1 py-2 rounded-lg text-[10px] font-semibold transition-all duration-200 border
                    ${duration === d
                      ? 'bg-white text-black border-white shadow-lg scale-105 z-10'
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Custom duration input */}
            {duration === 'Custom' && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Math.max(1, Math.min(300, parseInt(e.target.value) || 1)))}
                  className="w-20 bg-[#0B0E13] border border-memento-accent-cyan/40 rounded-lg px-3 py-2 text-sm text-white text-center focus:outline-none focus:border-memento-accent-cyan"
                />
                <span className="text-xs text-slate-400">minutes (1-300)</span>
              </div>
            )}
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Special Instructions
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-purple-500/20 to-memento-accent-cyan/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="E.g., 'Focus on practical applications' or 'Emphasize historical context'..."
                className="relative w-full h-20 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner"
              />
              <Sparkles size={12} className="absolute bottom-3 right-3 text-slate-600" />
            </div>
          </section>
        </div>

        {/* Progress Display */}
        {isGenerating && progress && (
          <div className="px-4 pb-4 space-y-3">
            <div className="bg-[#0B0E13] border border-white/10 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-mono">
                  {progress.phase === 'script' && '📝 Generating Script'}
                  {progress.phase === 'validation' && '✅ Validating Segments'}
                  {progress.phase === 'tts' && '🎙️ Processing Audio'}
                  {progress.phase === 'assembly' && '🎛️ Assembling Audio'}
                  {progress.phase === 'upload' && '☁️ Uploading'}
                  {progress.phase === 'completed' && '✨ Complete'}
                </span>
                <span className="text-memento-accent-cyan font-mono font-bold">
                  {progress.progressPct}%
                </span>
              </div>

              {/* Script Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Script</span>
                  <span>{progress.progressPct}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
              </div>

              {/* TTS Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Text-to-Speech</span>
                  <span>{progress.progressPct}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
              </div>

              {/* Upload Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Upload</span>
                  <span>{progress.progressPct}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
                    style={{ width: `${progress.progressPct}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400 font-mono pt-2">{progressMessage}</p>
            </div>
          </div>
        )}

        {/* Footer Actions - Fixed at bottom */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/95 shrink-0 flex gap-2 backdrop-blur-sm shadow-[0_-4px_12px_rgba(0,0,0,0.5)]">
          {isGenerating ? (
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 border-red-500/30 hover:bg-red-500/10 text-red-400 hover:text-red-300"
              onClick={handleCancel}
              icon={<StopCircle size={14} />}
            >
              Stop
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
          )}
          <Button
            variant="glow"
            size="sm"
            onClick={handleGenerate}
            isLoading={isGenerating}
            icon={!isGenerating ? <Play size={14} /> : undefined}
            className="flex-[2]"
          >
            {isGenerating ? progressMessage || 'Generating...' : (editingAsset ? 'Regenerate' : 'Generate')}
          </Button>
        </div>
      </div>
    </div>
  );
};
