
import React, { useState, useEffect, useRef } from 'react';
import { Headphones, Video, BrainCircuit, FileText, Layers, GraduationCap, Play, Download, Loader, MoreHorizontal, Users, BookOpen, Pause, Volume2, Edit2, SkipBack, SkipForward, Sparkles, User, ShieldAlert, Microscope } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { StudioAction, GeneratedQuiz, FlashcardDeck, GeneratedReport, GeneratedMindMap, GeneratedHandbook } from '../types';
import { supabase } from '../lib/supabase/client';
import { AudioOverviewModal } from './AudioOverviewModal';
import { VideoOverviewModal } from './VideoOverviewModal';
import { VideoOverviewPlaybackModal } from './VideoOverviewPlaybackModal';
import { MentorHourModal } from './MentorHourModal';
import { HandbookModal } from './HandbookModal';
import { MindMapModal } from './MindMapModal';
import { MindMapPlayback } from './MindMapPlayback';
import { ReportModal } from './ReportModal';
import { ReportPlayback } from './ReportPlayback';
import { HandbookPlayback } from './HandbookPlayback';
import { FlashcardsModal } from './FlashcardsModal';
import { FlashcardsPlayback } from './FlashcardsPlayback';
import { QuizModal } from './QuizModal';
import { QuizPlayback } from './QuizPlayback';
import { PDFGenerationOptions, DEFAULT_PDF_OPTIONS } from '../lib/pdfGenerator';
import { useNotification } from '../lib/useNotification';
import { listRelationalContent, loadRelationalHandbook, loadRelationalReport, RelationalContentSummary } from '../lib/relationalContent';
import type { AudioFormat, AudioDuration } from '../types';

const ACTIONS: StudioAction[] = [
  { id: 'audio', title: 'Audio Overview', subtitle: 'Deep Dive', icon: <Headphones size={24} />, color: 'cyan' },
  { id: 'video', title: 'Video Overview', subtitle: 'Visual summary', icon: <Video size={24} />, color: 'purple' },
  { id: 'mentor', title: 'Mentor Hour', subtitle: 'AI Coaching', icon: <Users size={24} />, color: 'pink' },
  { id: 'handbook', title: 'Generate Handbook', subtitle: 'Comprehensive Guide', icon: <BookOpen size={24} />, color: 'blue' },
  { id: 'mindmap', title: 'Mind Map', subtitle: 'Visualize connections', icon: <BrainCircuit size={24} />, color: 'cyan' },
  { id: 'report', title: 'Reports', subtitle: 'Deep dive docs', icon: <FileText size={24} />, color: 'purple' },
  { id: 'flash', title: 'Flashcards', subtitle: 'Active recall', icon: <Layers size={24} />, color: 'pink' },
  { id: 'quiz', title: 'Quiz', subtitle: 'Test knowledge', icon: <GraduationCap size={24} />, color: 'blue' },
];

interface GeneratedAsset {
  id: string;
  type: string;
  title: string;
  media_url: string | null;
  duration_seconds: number | null;
  created_at: string;
  metadata?: {
    format?: string;
    duration?: string;
    voices?: any;
    speakerNames?: {
      host1?: string;
      host2?: string;
      solo?: string;
    };
    quizData?: GeneratedQuiz;
    flashcardData?: FlashcardDeck;
    reportData?: GeneratedReport;
    mindmapData?: GeneratedMindMap;
    handbookData?: GeneratedHandbook;
  };
  relationalContent?: RelationalContentSummary;
}

interface StudioPanelProps {
  notebookId?: string;
}

export const StudioPanel: React.FC<StudioPanelProps> = ({ notebookId }) => {
  const notification = useNotification();
  const [generatedAssets, setGeneratedAssets] = useState<GeneratedAsset[]>([]);
  const [activeVideoOverview, setActiveVideoOverview] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playingAssetId, setPlayingAssetId] = useState<string | null>(null);
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<GeneratedAsset | null>(null);
  // Track actual audio durations from HTML5 Audio metadata (keyed by asset ID)
  const [actualDurations, setActualDurations] = useState<Record<string, number>>({});

  // Edit form states
  const [editFormat, setEditFormat] = useState<AudioFormat>('Deep Dive');
  const [editDuration, setEditDuration] = useState<AudioDuration>('10 min');
  const [editPrompt, setEditPrompt] = useState('');
  const [editGraphMode, setEditGraphMode] = useState<'broad' | 'focused' | 'exploratory'>('broad');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateProgress, setRegenerateProgress] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isMentorModalOpen, setIsMentorModalOpen] = useState(false);
  const [isHandbookModalOpen, setIsHandbookModalOpen] = useState(false);
  const [isMindMapModalOpen, setIsMindMapModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardsModalOpen, setIsFlashcardsModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<GeneratedQuiz | null>(null);
  const [activeFlashcardDeck, setActiveFlashcardDeck] = useState<FlashcardDeck | null>(null);
  const [activeReport, setActiveReport] = useState<GeneratedReport | null>(null);
  const [activeReportPdfOptions, setActiveReportPdfOptions] = useState<PDFGenerationOptions>(DEFAULT_PDF_OPTIONS);
  const [activeMindMap, setActiveMindMap] = useState<GeneratedMindMap | null>(null);
  const [activeHandbook, setActiveHandbook] = useState<GeneratedHandbook | null>(null);

  // Fetch generated assets
  useEffect(() => {
    if (!notebookId) return;

    let isMounted = true;

    const fetchAssets = async (silent = false) => {
      if (!silent) setIsLoading(true);
      if (!silent) console.log('🎧 Fetching generated assets for notebook:', notebookId);
      const { data, error } = await supabase
        .from('generated_assets')
        .select('id, type, title, media_url, duration_seconds, created_at, metadata')
        .eq('notebook_id', notebookId)
        .order('created_at', { ascending: false })
        .limit(50); // Limit results to prevent large payloads
      const relationalContent = await listRelationalContent(notebookId);

      if (!isMounted) return;

      if (error) {
        if (!silent) console.error('Error fetching generated assets:', error);
        if (!silent) setIsLoading(false);
        throw error; // Throw so poll error handler can catch it
      }

      const legacyAssets = data || [];
      const relationalAssets: GeneratedAsset[] = relationalContent.map((item) => ({
        id: item.id,
        type: item.kind,
        title: item.title,
        media_url: null,
        duration_seconds: null,
        created_at: item.createdAt,
        metadata: {
          format: item.format || undefined,
          duration: item.length || undefined,
        },
        relationalContent: item,
      }));
      const mergedAssets = [...relationalAssets, ...legacyAssets]
        .filter((asset, index, all) => all.findIndex((candidate) => candidate.id === asset.id) === index)
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

      // Only update if data has changed
      setGeneratedAssets(prev => {
        const prevIds = prev.map(a => a.id).sort().join(',');
        const newIds = mergedAssets.map((a: GeneratedAsset) => a.id).sort().join(',');
        if (prevIds !== newIds) {
          if (!silent) console.log('📦 Assets updated:', data?.length || 0);
          return mergedAssets;
        }
        return prev;
      });

      if (!silent) setIsLoading(false);
    };

    fetchAssets();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`generated-assets-${notebookId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'generated_assets',
          filter: `notebook_id=eq.${notebookId}`,
        },
        (payload) => {
          console.log('🔔 Real-time INSERT event received:', payload);
          // Directly add the new asset to state for immediate UI update
          if (payload.new && isMounted) {
            setGeneratedAssets(prev => {
              // Check if already exists
              if (prev.some(a => a.id === (payload.new as GeneratedAsset).id)) {
                return prev;
              }
              console.log('📦 Adding new asset dynamically');
              return [payload.new as GeneratedAsset, ...prev];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generated_assets',
          filter: `notebook_id=eq.${notebookId}`,
        },
        (payload) => {
          console.log('🔔 Real-time UPDATE event received:', payload);
          if (payload.new && isMounted) {
            setGeneratedAssets(prev =>
              prev.map(a => a.id === (payload.new as GeneratedAsset).id ? payload.new as GeneratedAsset : a)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'generated_assets',
          filter: `notebook_id=eq.${notebookId}`,
        },
        (payload) => {
          console.log('🔔 Real-time DELETE event received:', payload);
          if (payload.old && isMounted) {
            setGeneratedAssets(prev =>
              prev.filter(a => a.id !== (payload.old as GeneratedAsset).id)
            );
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Supabase realtime subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for generated_assets');
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ Real-time subscription error - falling back to polling');
        }
      });

    // Polling fallback - check for new assets every 10 seconds
    // Reduced frequency to avoid database timeout issues
    let pollErrorCount = 0;
    const pollInterval = setInterval(() => {
      if (isMounted && pollErrorCount < 3) {
        fetchAssets(true).catch(() => {
          pollErrorCount++;
          if (pollErrorCount >= 3) {
            console.warn('⚠️ Stopping poll due to repeated errors');
          }
        });
      }
    }, 10000);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [notebookId]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioElement) {
        audioElement.pause();
        audioElement.src = '';
      }
    };
  }, [audioElement]);

  // Preload audio metadata to get actual durations
  useEffect(() => {
    const loadedIds = new Set<string>();

    const loadActualDurations = async () => {
      const audioAssets = generatedAssets.filter(a => a.type === 'audio' && a.media_url);

      for (const asset of audioAssets) {
        // Skip if we already loaded this one
        if (loadedIds.has(asset.id)) continue;
        loadedIds.add(asset.id);

        try {
          const audio = new Audio();
          audio.preload = 'metadata';

          await new Promise<void>((resolve) => {
            audio.onloadedmetadata = () => {
              if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
                console.log(`📊 Loaded actual duration for ${asset.id}: ${audio.duration}s (${Math.floor(audio.duration / 60)}:${Math.floor(audio.duration % 60).toString().padStart(2, '0')})`);
                setActualDurations(prev => ({
                  ...prev,
                  [asset.id]: audio.duration
                }));
              }
              resolve();
            };
            audio.onerror = () => {
              console.warn(`Failed to load audio metadata for ${asset.id}`);
              resolve();
            };
            // Timeout to avoid hanging
            setTimeout(() => resolve(), 5000);
            audio.src = asset.media_url!;
          });
        } catch (err) {
          console.warn(`Could not load duration for asset ${asset.id}:`, err);
        }
      }
    };

    if (generatedAssets.length > 0) {
      loadActualDurations();
    }
  }, [generatedAssets]);

  // Update current time when audio is playing
  useEffect(() => {
    if (!audioElement) return;

    const updateTime = () => setCurrentTime(audioElement.currentTime);
    const handleEnded = () => {
      setPlayingAssetId(null);
      setCurrentTime(0);
    };

    audioElement.addEventListener('timeupdate', updateTime);
    audioElement.addEventListener('ended', handleEnded);

    return () => {
      audioElement.removeEventListener('timeupdate', updateTime);
      audioElement.removeEventListener('ended', handleEnded);
    };
  }, [audioElement]);

  const handlePlayPause = (asset: GeneratedAsset) => {
    if (!asset.media_url) return;

    if (playingAssetId === asset.id) {
      // Pause current
      if (audioElement) {
        audioElement.pause();
        setPlayingAssetId(null);
      }
    } else {
      // Play new audio
      if (audioElement) {
        audioElement.pause();
      }

      const audio = new Audio(asset.media_url);
      audio.volume = volume;
      audio.playbackRate = playbackRate;
      audio.play();

      setAudioElement(audio);
      audioRef.current = audio;
      setPlayingAssetId(asset.id);
      setCurrentTime(0);
    }
  };

  const handleSeek = (value: number) => {
    if (audioElement) {
      audioElement.currentTime = value;
      setCurrentTime(value);
    }
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (audioElement) {
      audioElement.volume = value;
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioElement) {
      audioElement.playbackRate = rate;
    }
  };

  const handleSkip = (seconds: number) => {
    if (audioElement) {
      audioElement.currentTime = Math.max(0, Math.min(audioElement.duration, audioElement.currentTime + seconds));
    }
  };

  const handleEditAudio = (asset: GeneratedAsset) => {
    // Toggle edit panel and initialize form
    if (editingAssetId === asset.id) {
      setEditingAssetId(null);
      return;
    }

    setEditingAssetId(asset.id);

    // Pre-fill form with existing metadata
    const formatMap: Record<string, AudioFormat> = {
      'solo': 'Solo',
      'deep-dive': 'Deep Dive',
      'critical': 'Critical',
      'debate': 'Debate',
      'analysis': 'Analysis',
    };
    const durationMap: Record<string, AudioDuration> = {
      '10min': '10 min',
      '30min': '30 min',
      '1hr': '1 hr',
      '3hr': '3 hr',
    };

    setEditFormat(formatMap[asset.metadata?.format || 'deep-dive'] || 'Deep Dive');
    setEditDuration(durationMap[asset.metadata?.duration || '10min'] || '10 min');
    setEditPrompt('');
    setEditGraphMode('broad');
  };

  const handleRegenerateAudio = async (asset: GeneratedAsset) => {
    setIsRegenerating(true);
    setRegenerateProgress('Initializing...');

    try {
      const formatMap: Record<AudioFormat, string> = {
        'Solo': 'solo',
        'Deep Dive': 'deep-dive',
        'Critical': 'critical',
        'Debate': 'debate',
        'Analysis': 'analysis',
      };

      const durationMap: Record<AudioDuration, string> = {
        '10 min': '10min',
        '30 min': '30min',
        '1 hr': '1hr',
        '3 hr': '3hr',
        'Custom': 'custom',
      };

      setRegenerateProgress('Submitting worker job...');

      const { data, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          type: 'audio',
          input: {
            notebookId,
            title: `${asset.title} (Updated)`,
            format: formatMap[editFormat],
            duration: durationMap[editDuration],
            graphMode: editGraphMode,
            customPrompt: editPrompt || undefined,
            speakerNames: asset.metadata?.speakerNames || {
              host1: 'Alex',
              host2: 'Jordan',
              solo: 'Alex',
            },
            replaceAssetId: asset.id,
          },
        },
      });

      if (createError) throw new Error(createError.message);
      const jobId = data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job service did not return a job id.');
      }

      setRegenerateProgress('Audio job queued...');
      notification.audio('Audio Regeneration Queued', 'The worker will replace this audio when it finishes.');
      setEditingAssetId(null);
      setRegenerateProgress('');
    } catch (error) {
      console.error('Error regenerating audio:', error);
      notification.error('Regeneration Failed', 'Failed to regenerate audio. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const openReport = async (asset: GeneratedAsset, fallback?: GeneratedReport) => {
    try {
      if (asset.relationalContent?.kind === 'report') {
        setActiveReport(await loadRelationalReport(asset.relationalContent.id));
        return;
      }
      if (fallback) setActiveReport(fallback);
    } catch (error) {
      console.error('Error loading report:', error);
      notification.error('Report Load Failed', error instanceof Error ? error.message : 'Could not load report.');
    }
  };

  const openHandbook = async (asset: GeneratedAsset, fallback?: GeneratedHandbook) => {
    try {
      if (asset.relationalContent?.kind === 'handbook') {
        setActiveHandbook(await loadRelationalHandbook(asset.relationalContent.id));
        return;
      }
      if (fallback) setActiveHandbook(fallback);
    } catch (error) {
      console.error('Error loading handbook:', error);
      notification.error('Handbook Load Failed', error instanceof Error ? error.message : 'Could not load handbook.');
    }
  };

  const handleDownload = (asset: GeneratedAsset) => {
    if (!asset.media_url) return;

    const link = document.createElement('a');
    link.href = asset.media_url;
    link.download = `${asset.title}.mp3`;
    link.click();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    // For durations >= 1 hour, show "Xh Xm Xs" format
    if (hours >= 1) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    // For durations < 1 hour, show "MM:SS" format  
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleActionClick = (actionId: string) => {
    if (actionId === 'audio') setIsAudioModalOpen(true);
    else if (actionId === 'video') setIsVideoModalOpen(true);
    else if (actionId === 'mentor') setIsMentorModalOpen(true);
    else if (actionId === 'handbook') setIsHandbookModalOpen(true);
    else if (actionId === 'mindmap') setIsMindMapModalOpen(true);
    else if (actionId === 'report') setIsReportModalOpen(true);
    else if (actionId === 'flash') setIsFlashcardsModalOpen(true);
    else if (actionId === 'quiz') setIsQuizModalOpen(true);
  };

  return (
    <>
      <div className="h-full flex flex-col gap-2 relative overflow-y-auto custom-scrollbar group/studio">
        <div className="px-1 shrink-0">
          <h2 className="font-display font-semibold text-base text-white mb-0.5">Studio</h2>
          <p className="text-[11px] text-slate-400">Transform your sources into artifacts.</p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 shrink-0 no-scrollbar px-1">
          {ACTIONS.map((action) => (
            <GlassPanel
              key={action.id}
              variant="card"
              interactive
              hoverEffect
              onClick={() => handleActionClick(action.id)}
              className="group min-h-[70px] max-h-[70px] relative overflow-hidden cursor-pointer"
            >
              <div className="p-2.5 flex flex-col items-start gap-1 w-full h-full">
                {/* Ambient Glow on Hover */}
                <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-500
                   ${action.color === 'purple' ? 'bg-memento-purple-500' : ''}
                   ${action.color === 'cyan' ? 'bg-memento-accent-cyan' : ''}
                   ${action.color === 'blue' ? 'bg-memento-accent-blue' : ''}
                   ${action.color === 'pink' ? 'bg-memento-accent-pink' : ''}
                 `} />

                <div className={`p-1.5 rounded-md bg-gradient-to-br shadow-lg transition-transform group-hover:scale-110 duration-300 relative z-10
                  ${action.color === 'purple' ? 'from-memento-purple-500/20 to-memento-purple-600/10 text-memento-purple-400 ring-1 ring-memento-purple-500/30' : ''}
                  ${action.color === 'cyan' ? 'from-cyan-500/20 to-cyan-600/10 text-cyan-400 ring-1 ring-cyan-500/30' : ''}
                  ${action.color === 'blue' ? 'from-blue-500/20 to-blue-600/10 text-blue-400 ring-1 ring-blue-500/30' : ''}
                  ${action.color === 'pink' ? 'from-pink-500/20 to-pink-600/10 text-pink-400 ring-1 ring-pink-500/30' : ''}
                `}>
                  {React.cloneElement(action.icon as React.ReactElement, { size: 16 })}
                </div>
                <div className="relative z-10">
                  <h3 className="text-[11px] font-semibold text-slate-200 group-hover:text-white transition-colors leading-tight">{action.title}</h3>
                  <p className="text-[9px] text-slate-500 group-hover:text-slate-400">{action.subtitle}</p>
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>

        {/* Output Queue */}
        <div className="flex-1 flex flex-col min-h-[400px] border-t border-white/10 pt-3 mt-3 overflow-hidden">
          <div className="flex items-center justify-between mb-2 px-1 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                {isLoading ? <Loader size={12} className="animate-spin text-emerald-400" /> : <Headphones size={12} className="text-emerald-400" />}
              </div>
              <span className="text-sm font-bold text-white">Output Queue</span>
            </div>
            <span className="text-xs text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">{generatedAssets.length}</span>
          </div>

          <div className="space-y-2.5 overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loader size={24} className="animate-spin text-purple-400 mb-4" />
                <p className="text-sm text-slate-400 font-medium">Loading outputs...</p>
              </div>
            ) : generatedAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 flex items-center justify-center mb-4 ring-1 ring-white/5">
                  <Headphones size={24} className="text-slate-600" />
                </div>
                <p className="text-sm text-slate-400 font-medium mb-1">No content yet</p>
                <p className="text-xs text-slate-600">Generate your first artifact above</p>
              </div>
            ) : (
              generatedAssets.map(asset => {
                const isExpanded = expandedAssetId === asset.id;
                const isPlaying = playingAssetId === asset.id;
                const isEditing = editingAssetId === asset.id;
                const isQuiz = asset.type === 'quiz';

                // Quiz Item Rendering
                if (isQuiz && asset.metadata?.quizData) {
                  const quizData = asset.metadata.quizData;
                  return (
                    <GlassPanel
                      key={asset.id}
                      className="relative overflow-hidden bg-gradient-to-br from-blue-950/40 via-blue-900/20 to-blue-950/30 border-blue-500/20 group hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] transition-all duration-500 cursor-pointer"
                      onClick={() => setActiveQuiz(quizData)}
                    >
                      {/* Ambient glow */}
                      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-blue-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="p-4 flex items-center gap-4 relative z-10">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/30 to-blue-600/20 flex items-center justify-center shrink-0 ring-2 ring-blue-500/30 group-hover:ring-blue-400/50 group-hover:scale-110 transition-all duration-300 shadow-lg shadow-blue-900/30">
                          <GraduationCap size={24} className="text-blue-300" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-bold text-white truncate group-hover:text-blue-100 transition-colors mb-1">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2.5 text-xs">
                            <span className="uppercase tracking-widest font-bold text-[9px] px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30">
                              Quiz
                            </span>
                            <span className="text-blue-400/60">•</span>
                            <span className="text-blue-200/70 font-medium">{quizData.questions?.length || 0} questions</span>
                            <span className="text-blue-400/60">•</span>
                            <span className="capitalize text-blue-200/70 font-medium">{quizData.metadata?.difficulty || 'Medium'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveQuiz(quizData);
                            }}
                            className="p-3 bg-blue-500/20 hover:bg-blue-500/40 rounded-xl text-blue-300 hover:text-white transition-all ring-1 ring-blue-500/30 hover:ring-blue-400/50 hover:scale-105"
                          >
                            <Play size={18} className="fill-current" />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Flashcard Deck Rendering
                const isFlashcards = asset.type === 'flashcards';
                if (isFlashcards && asset.metadata?.flashcardData) {
                  const flashcardData = asset.metadata.flashcardData;
                  return (
                    <GlassPanel
                      key={asset.id}
                      className="relative overflow-hidden bg-gradient-to-br from-pink-950/40 via-purple-900/20 to-pink-950/30 border-pink-500/20 group hover:border-pink-400/50 hover:shadow-[0_0_30px_rgba(236,72,153,0.15)] transition-all duration-500 cursor-pointer"
                      onClick={() => setActiveFlashcardDeck(flashcardData)}
                    >
                      {/* Ambient glow */}
                      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-pink-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="p-4 flex items-center gap-4 relative z-10">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-pink-500/30 to-purple-600/20 flex items-center justify-center shrink-0 ring-2 ring-pink-500/30 group-hover:ring-pink-400/50 group-hover:scale-110 transition-all duration-300 shadow-lg shadow-pink-900/30">
                          <Layers size={24} className="text-pink-300" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-[15px] font-bold text-white truncate group-hover:text-pink-100 transition-colors mb-1">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2.5 text-xs">
                            <span className="uppercase tracking-widest font-bold text-[9px] px-2.5 py-1 rounded-md bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/30">
                              Flashcards
                            </span>
                            <span className="text-pink-400/60">•</span>
                            <span className="text-pink-200/70 font-medium">{flashcardData.cards?.length || 0} cards</span>
                            <span className="text-pink-400/60">•</span>
                            <span className="capitalize text-pink-200/70 font-medium">{flashcardData.metadata?.difficulty || 'Medium'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveFlashcardDeck(flashcardData);
                            }}
                            className="p-3 bg-pink-500/20 hover:bg-pink-500/40 rounded-xl text-pink-300 hover:text-white transition-all ring-1 ring-pink-500/30 hover:ring-pink-400/50 hover:scale-105"
                          >
                            <Play size={18} className="fill-current" />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Report Item Rendering
                const isReport = asset.type === 'report';
                if (isReport && (asset.metadata?.reportData || asset.relationalContent?.kind === 'report')) {
                  const reportData = asset.metadata?.reportData;
                  const reportSummary = asset.relationalContent;
                  return (
                    <GlassPanel
                      key={asset.id}
                      className="bg-gradient-to-br from-white/[0.07] to-white/[0.03] border-white/10 group hover:from-purple-500/[0.08] hover:to-purple-600/[0.04] hover:border-purple-500/30 transition-all duration-300 cursor-pointer"
                      onClick={() => openReport(asset, reportData)}
                    >
                      <div className="p-3 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center shrink-0 ring-1 ring-purple-500/20 group-hover:ring-purple-500/40 group-hover:scale-105 transition-all duration-300">
                          <FileText size={20} className="text-purple-400" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors mb-0.5">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="uppercase tracking-wider font-medium text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">
                              {reportData?.metadata?.format || reportSummary?.format || 'Report'}
                            </span>
                            <span>•</span>
                            <span>{reportData?.metadata?.wordCount || reportSummary?.wordCount || 0} words</span>
                            <span>•</span>
                            <span className="capitalize">{reportData?.metadata?.tone || reportSummary?.tone || 'Professional'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openReport(asset, reportData);
                            }}
                            className="p-2.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-purple-400 transition-all"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Handbook Item Rendering
                const isHandbook = asset.type === 'handbook';
                if (isHandbook && (asset.metadata?.handbookData || asset.relationalContent?.kind === 'handbook')) {
                  const handbookData = asset.metadata?.handbookData;
                  const handbookSummary = asset.relationalContent;
                  // Clean title from any markdown formatting
                  const cleanTitle = (asset.title || handbookData?.title || 'Untitled Handbook')
                    .replace(/\*\*(.+?)\*\*/g, '$1')
                    .replace(/\*(.+?)\*/g, '$1')
                    .replace(/__(.+?)__/g, '$1')
                    .replace(/_(.+?)_/g, '$1')
                    .replace(/`(.+?)`/g, '$1');

                  const formatColors: Record<string, string> = {
                    'Study Guide': 'from-blue-500/20 to-blue-600/10 ring-blue-500/20 group-hover:ring-blue-500/40',
                    'Cheatsheet': 'from-amber-500/20 to-amber-600/10 ring-amber-500/20 group-hover:ring-amber-500/40',
                    'Briefing': 'from-purple-500/20 to-purple-600/10 ring-purple-500/20 group-hover:ring-purple-500/40',
                    'Comprehensive': 'from-emerald-500/20 to-emerald-600/10 ring-emerald-500/20 group-hover:ring-emerald-500/40',
                  };
                  const formatTextColors: Record<string, string> = {
                    'Study Guide': 'text-blue-400',
                    'Cheatsheet': 'text-amber-400',
                    'Briefing': 'text-purple-400',
                    'Comprehensive': 'text-emerald-400',
                  };
                  const formatBadgeColors: Record<string, string> = {
                    'Study Guide': 'bg-blue-500/15 text-blue-400',
                    'Cheatsheet': 'bg-amber-500/15 text-amber-400',
                    'Briefing': 'bg-purple-500/15 text-purple-400',
                    'Comprehensive': 'bg-emerald-500/15 text-emerald-400',
                  };

                  const format = handbookData?.format || handbookSummary?.format || 'Study Guide';
                  const iconBg = formatColors[format] || formatColors['Study Guide'];
                  const iconColor = formatTextColors[format] || formatTextColors['Study Guide'];
                  const badgeColor = formatBadgeColors[format] || formatBadgeColors['Study Guide'];

                  return (
                    <GlassPanel
                      key={asset.id}
                      className="bg-gradient-to-br from-white/[0.06] to-white/[0.02] border-white/[0.08] group hover:from-white/[0.08] hover:to-white/[0.04] hover:border-white/15 transition-all duration-300 cursor-pointer"
                      onClick={() => openHandbook(asset, handbookData)}
                    >
                      <div className="p-3.5 flex items-center gap-3.5">
                        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${iconBg} flex items-center justify-center shrink-0 ring-1 group-hover:scale-105 transition-all duration-300`}>
                          <BookOpen size={18} className={iconColor} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-[13px] font-semibold text-slate-200 truncate group-hover:text-white transition-colors mb-1">
                            {cleanTitle}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className={`uppercase tracking-wider font-semibold text-[9px] px-2 py-0.5 rounded-md ${badgeColor}`}>
                              {format}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="font-medium">{(handbookData?.metadata?.wordCount || handbookSummary?.wordCount || 0).toLocaleString()}</span>
                            <span className="text-slate-600">words</span>
                            <span className="text-slate-600">•</span>
                            <span className="font-medium">~{handbookData?.metadata?.pageEstimate || Math.ceil((handbookSummary?.wordCount || 0) / 500)}</span>
                            <span className="text-slate-600">pages</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openHandbook(asset, handbookData);
                            }}
                            className={`p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:${iconColor} transition-all`}
                          >
                            <Play size={15} />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Mind Map Item Rendering
                const isMindMap = asset.type === 'mindmap';
                if (isMindMap && asset.metadata?.mindmapData) {
                  const mindmapData = asset.metadata.mindmapData;
                  return (
                    <GlassPanel
                      key={asset.id}
                      className="bg-gradient-to-br from-white/[0.07] to-white/[0.03] border-white/10 group hover:from-cyan-500/[0.08] hover:to-cyan-600/[0.04] hover:border-cyan-500/30 transition-all duration-300 cursor-pointer"
                      onClick={() => setActiveMindMap(mindmapData)}
                    >
                      <div className="p-3 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center shrink-0 ring-1 ring-cyan-500/20 group-hover:ring-cyan-500/40 group-hover:scale-105 transition-all duration-300">
                          <BrainCircuit size={20} className="text-cyan-400" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors mb-0.5">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="uppercase tracking-wider font-medium text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
                              Mind Map
                            </span>
                            <span>•</span>
                            <span>{mindmapData.nodes?.length || 0} nodes</span>
                            <span>•</span>
                            <span className="capitalize">{mindmapData.metadata?.style || 'Hierarchical'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMindMap(mindmapData);
                            }}
                            className="p-2.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-cyan-400 transition-all"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Video Overview Item Rendering
                const isVideoOverview = asset.type === 'video_overview';
                if (isVideoOverview && asset.metadata?.slides && asset.media_url) {
                  // Calculate fixed 22-second timings for each slide
                  const SLIDE_DURATION_MS = 22000;
                  const calculatedTimings = asset.metadata.slides.map((slide: any, index: number) => ({
                    slideId: slide.id,
                    startMs: index * SLIDE_DURATION_MS,
                    endMs: (index + 1) * SLIDE_DURATION_MS,
                  }));

                  // Reconstruct the video object for playback
                  const video = {
                    id: asset.id,
                    title: asset.title,
                    slides: asset.metadata.slides,
                    audioUrl: asset.media_url,
                    audioDuration: (asset.duration_seconds || 0) * 1000,
                    slideTimings: calculatedTimings,
                    metadata: {
                      format: asset.metadata.format || '',
                      style: asset.metadata.style || 'illustrated',
                      slideCount: asset.metadata.slideCount || (asset.metadata.slides?.length || 0),
                    },
                  };
                  return (
                    <GlassPanel
                      key={asset.id}
                      className="bg-gradient-to-br from-white/[0.07] to-white/[0.03] border-white/10 group hover:from-purple-500/[0.08] hover:to-purple-600/[0.04] hover:border-purple-500/30 transition-all duration-300 cursor-pointer"
                      onClick={() => setActiveVideoOverview(video)}
                    >
                      <div className="p-3 flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center shrink-0 ring-1 ring-purple-500/20 group-hover:ring-purple-500/40 group-hover:scale-105 transition-all duration-300">
                          <Video size={20} className="text-purple-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors mb-0.5">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="uppercase tracking-wider font-medium text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">
                              Video Overview
                            </span>
                            <span>•</span>
                            <span>{video.slides.length} slides</span>
                            <span>•</span>
                            <span className="capitalize">{video.metadata.style}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveVideoOverview(video);
                            }}
                            className="p-2.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-purple-400 transition-all"
                          >
                            <Play size={16} />
                          </button>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                }

                // Audio/Podcast Item Rendering
                return (
                  <GlassPanel
                    key={asset.id}
                    className="bg-gradient-to-br from-white/[0.07] to-white/[0.03] border-white/10 group hover:from-white/[0.12] hover:to-white/[0.06] hover:border-emerald-500/30 transition-all duration-300"
                  >
                    <div className="p-3 flex flex-col gap-3 w-full">
                      {/* Header Row */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handlePlayPause(asset)}
                          disabled={!asset.media_url}
                          className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center shrink-0 relative overflow-hidden hover:from-emerald-500/30 hover:to-emerald-600/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ring-1 ring-emerald-500/20 group-hover:ring-emerald-500/40 group-hover:scale-105"
                        >
                          {isPlaying ? (
                            <>
                              <div className="absolute inset-0 bg-emerald-500/20 animate-pulse" />
                              <Pause size={18} className="fill-current text-emerald-400 relative z-10" />
                            </>
                          ) : (
                            <Play size={18} className="fill-current text-emerald-400 ml-0.5" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-slate-200 truncate group-hover:text-white transition-colors mb-0.5">
                            {asset.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="uppercase tracking-wider font-medium text-[10px] px-2 py-0.5 rounded bg-slate-800/50 text-slate-400">
                              {asset.metadata?.format || asset.type}
                            </span>
                            <span>•</span>
                            <span className="font-mono">{formatDuration(actualDurations[asset.id] || asset.duration_seconds)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setExpandedAssetId(isExpanded ? null : asset.id)}
                            className={`p-2.5 hover:bg-white/10 rounded-lg transition-all ${isExpanded ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500 hover:text-cyan-400'
                              }`}
                          >
                            <Volume2 size={16} />
                          </button>
                          <button
                            onClick={() => setEditingAssetId(isEditing ? null : asset.id)}
                            className={`p-2.5 hover:bg-white/10 rounded-lg transition-all ${isEditing ? 'text-purple-400 bg-purple-500/10' : 'text-slate-500 hover:text-purple-400'
                              }`}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDownload(asset)}
                            disabled={!asset.media_url}
                            className="p-2.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Player Controls */}
                      {isExpanded && (
                        <div className="space-y-3 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 duration-200">
                          {/* Progress Bar */}
                          <div className="space-y-1">
                            <input
                              type="range"
                              min="0"
                              max={actualDurations[asset.id] || asset.duration_seconds || 0}
                              value={isPlaying ? currentTime : 0}
                              onChange={(e) => handleSeek(Number(e.target.value))}
                              disabled={!isPlaying}
                              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 
                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:cursor-pointer
                                [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-400 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                            />
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                              <span>{formatTime(isPlaying ? currentTime : 0)}</span>
                              <span>{formatDuration(actualDurations[asset.id] || asset.duration_seconds)}</span>
                            </div>
                          </div>

                          {/* Controls Row */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Skip Buttons */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleSkip(-10)}
                                disabled={!isPlaying}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-300 transition-all disabled:opacity-30"
                              >
                                <SkipBack size={14} />
                              </button>
                              <button
                                onClick={() => handleSkip(10)}
                                disabled={!isPlaying}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-300 transition-all disabled:opacity-30"
                              >
                                <SkipForward size={14} />
                              </button>
                            </div>

                            {/* Volume Control */}
                            <div className="flex items-center gap-2 min-w-[120px] flex-1">
                              <Volume2 size={14} className="text-slate-500 shrink-0" />
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer
                                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
                                  [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:border-0"
                              />
                              <span className="text-[10px] font-mono text-slate-500 w-8 shrink-0">{Math.round(volume * 100)}%</span>
                            </div>

                            {/* Speed Control */}
                            <div className="flex items-center gap-1 shrink-0">
                              {[1, 1.5, 2].map(rate => (
                                <button
                                  key={rate}
                                  onClick={() => handleSpeedChange(rate)}
                                  className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${playbackRate === rate
                                    ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500/40'
                                    : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                                    }`}
                                >
                                  {rate}x
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Metadata */}
                          {asset.metadata && (
                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">Speakers</p>
                                <p className="text-[10px] text-slate-400">
                                  {asset.metadata.speakerNames?.solo ||
                                    `${asset.metadata.speakerNames?.host1 || 'Alex'} & ${asset.metadata.speakerNames?.host2 || 'Jordan'}`}
                                </p>
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">Voices</p>
                                <p className="text-[10px] text-slate-400">
                                  {asset.metadata.voices?.solo ? 'Onyx' : 'Onyx & Nova'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inline Edit Panel */}
                      {isEditing && (
                        <div className="space-y-3 pt-3 border-t border-purple-500/20 animate-in slide-in-from-top-2 duration-200 bg-purple-500/5 -m-3 mt-3 p-3 rounded-b-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles size={14} className="text-purple-400" />
                            <h4 className="text-xs font-semibold text-purple-300">Regenerate Audio</h4>
                          </div>

                          {/* Format Selection */}
                          <div className="space-y-2">
                            <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Format</label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[
                                { id: 'Solo' as AudioFormat, icon: <User size={14} /> },
                                { id: 'Deep Dive' as AudioFormat, icon: <Headphones size={14} /> },
                                { id: 'Critical' as AudioFormat, icon: <ShieldAlert size={14} /> },
                                { id: 'Debate' as AudioFormat, icon: <Users size={14} /> },
                                { id: 'Analysis' as AudioFormat, icon: <Microscope size={14} /> },
                              ].slice(0, 3).map((fmt) => (
                                <button
                                  key={fmt.id}
                                  onClick={() => setEditFormat(fmt.id)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center justify-center gap-1 ${editFormat === fmt.id
                                    ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}
                                >
                                  {fmt.icon}
                                  {fmt.id}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Duration Selection */}
                          <div className="space-y-2">
                            <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Duration</label>
                            <div className="grid grid-cols-4 gap-1.5">
                              {(['10 min', '30 min', '1 hr', '3 hr'] as AudioDuration[]).map((dur) => (
                                <button
                                  key={dur}
                                  onClick={() => setEditDuration(dur)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${editDuration === dur
                                    ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/40'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}
                                >
                                  {dur}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Graph Mode Selection */}
                          <div className="space-y-2">
                            <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Knowledge Depth</label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {[
                                { id: 'broad' as const, label: 'Broad', desc: 'Overview' },
                                { id: 'focused' as const, label: 'Focused', desc: 'Detailed' },
                                { id: 'exploratory' as const, label: 'Deep', desc: 'Comprehensive' },
                              ].map((mode) => (
                                <button
                                  key={mode.id}
                                  onClick={() => setEditGraphMode(mode.id)}
                                  className={`px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all text-center ${editGraphMode === mode.id
                                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                                    : 'bg-white/5 text-slate-400 hover:bg-white/10'
                                    }`}
                                >
                                  <div>{mode.label}</div>
                                  <div className="text-[8px] text-slate-600">{mode.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Custom Prompt */}
                          <div className="space-y-2">
                            <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Custom Instructions</label>
                            <textarea
                              value={editPrompt}
                              onChange={(e) => setEditPrompt(e.target.value)}
                              placeholder="E.g., 'Focus on practical examples' or 'Add more historical context'..."
                              className="w-full h-14 bg-[#0B0E13] border border-white/10 rounded-lg p-2 text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/40 transition-colors resize-none"
                            />
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingAssetId(null)}
                              disabled={isRegenerating}
                              className="flex-1 text-[10px] h-8"
                            >
                              Cancel
                            </Button>
                            <Button
                              variant="glow"
                              size="sm"
                              onClick={() => handleRegenerateAudio(asset)}
                              isLoading={isRegenerating}
                              className="flex-[2] text-[10px] h-8"
                            >
                              {isRegenerating ? regenerateProgress || 'Regenerating...' : 'Regenerate'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </GlassPanel>
                );
              })
            )}
          </div>
        </div>

        {/* Overlays inside the panel */}
        <AudioOverviewModal
          isOpen={isAudioModalOpen}
          onClose={() => setIsAudioModalOpen(false)}
          notebookId={notebookId || ''}
          onGenerated={() => {
            // Assets will auto-refresh via real-time subscription
          }}
        />
        <VideoOverviewModal
          isOpen={isVideoModalOpen}
          onClose={() => setIsVideoModalOpen(false)}
          notebookId={notebookId || ''}
          onGenerated={() => {
            // Assets will auto-refresh via real-time subscription
          }}
        />
        <HandbookModal
          isOpen={isHandbookModalOpen}
          onClose={() => setIsHandbookModalOpen(false)}
          notebookId={notebookId || ''}
          onHandbookGenerated={() => {
            // Assets will auto-refresh via real-time subscription
          }}
        />
        <MindMapModal
          isOpen={isMindMapModalOpen}
          onClose={() => setIsMindMapModalOpen(false)}
          notebookId={notebookId || ''}
          onMindMapGenerated={(mindmap) => {
            setActiveMindMap(mindmap);
            setIsMindMapModalOpen(false);
          }}
        />
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          notebookId={notebookId || ''}
          onReportGenerated={(report, pdfOptions) => {
            setActiveReport(report);
            setActiveReportPdfOptions(pdfOptions);
            setIsReportModalOpen(false);
          }}
        />
        <FlashcardsModal
          isOpen={isFlashcardsModalOpen}
          onClose={() => setIsFlashcardsModalOpen(false)}
          notebookId={notebookId || ''}
          onFlashcardsGenerated={(deck) => {
            setActiveFlashcardDeck(deck);
            setIsFlashcardsModalOpen(false);
          }}
        />
        <QuizModal
          isOpen={isQuizModalOpen}
          onClose={() => setIsQuizModalOpen(false)}
          notebookId={notebookId || ''}
          onQuizGenerated={(quiz) => {
            setActiveQuiz(quiz);
            setIsQuizModalOpen(false);
          }}
        />
      </div>

      {/* Global Modals outside the panel for proper z-index */}
      <MentorHourModal
        isOpen={isMentorModalOpen}
        onClose={() => setIsMentorModalOpen(false)}
        notebookId={notebookId}
        onSessionEnd={(summary) => {
          console.log('Mentor session ended:', summary);
          // Could save session summary to database here
        }}
      />

      {/* Quiz Playback - Global Modal */}
      {activeQuiz && (
        <QuizPlayback
          quiz={activeQuiz}
          onClose={() => setActiveQuiz(null)}
        />
      )}

      {/* Flashcards Playback - Global Modal */}
      {activeFlashcardDeck && (
        <FlashcardsPlayback
          deck={activeFlashcardDeck}
          onClose={() => setActiveFlashcardDeck(null)}
        />
      )}

      {/* Report Playback - Global Modal */}
      {activeReport && (
        <ReportPlayback
          report={activeReport}
          onClose={() => setActiveReport(null)}
          initialPdfOptions={activeReportPdfOptions}
        />
      )}

      {/* Mind Map Playback - Global Modal */}
      {activeMindMap && (
        <MindMapPlayback
          mindmap={activeMindMap}
          onClose={() => setActiveMindMap(null)}
        />
      )}

      {/* Handbook Playback - Global Modal */}
      {activeHandbook && (
        <HandbookPlayback
          handbook={activeHandbook}
          onClose={() => setActiveHandbook(null)}
        />
      )}

      {/* Video Overview Playback - Global Modal */}
      {activeVideoOverview && (
        <VideoOverviewPlaybackModal
          video={activeVideoOverview}
          onClose={() => setActiveVideoOverview(null)}
        />
      )}
    </>
  );
};
