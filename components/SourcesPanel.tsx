import React, { useState, useEffect } from 'react';
import { Search, Plus, FileText, Youtube, Globe, Loader, Zap, Layers, Mic, Brain } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Source } from '../types';
import { SearchModal } from './SearchModal';
import { UploadModal } from './UploadModal';
import { supabase } from '../lib/supabase/client';
import { useParams } from 'react-router-dom';
import { reindexNotebookSources, getGraphStats, ReindexProgress } from '../lib/reindexService';
import toast from 'react-hot-toast';

const FILTERS = ['All', 'Web', 'Academic', 'Video'];

export const SourcesPanel: React.FC = () => {
  const { id: notebookId } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchMode, setSearchMode] = useState<'fast' | 'deep'>('fast');
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal States
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState('');

  // Re-index states
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);
  const [graphStats, setGraphStats] = useState<{ entityCount: number; relationshipCount: number } | null>(null);

  // Fetch graph stats
  useEffect(() => {
    if (!notebookId) return;

    const fetchGraphStats = async () => {
      const stats = await getGraphStats(notebookId);
      setGraphStats(stats);
    };

    fetchGraphStats();
  }, [notebookId, isReindexing]);

  // Handle re-index
  const handleReindex = async () => {
    if (!notebookId || isReindexing) return;

    setIsReindexing(true);
    setReindexProgress({
      current: 0,
      total: 0,
      currentSource: '',
      status: 'indexing',
      message: 'Starting knowledge graph extraction...',
    });

    const toastId = toast.loading('Building knowledge graph...');

    try {
      const result = await reindexNotebookSources(notebookId, (progress) => {
        setReindexProgress(progress);
        if (progress.status === 'indexing' && progress.currentSource) {
          toast.loading(`Processing: ${progress.currentSource}`, { id: toastId });
        }
      });

      if (result.success) {
        toast.success(
          `Knowledge graph created: ${result.entitiesCreated} entities, ${result.relationshipsCreated} relationships`,
          { id: toastId, duration: 5000 }
        );
        // Refresh graph stats
        const stats = await getGraphStats(notebookId);
        setGraphStats(stats);
      } else {
        toast.error('Failed to build knowledge graph', { id: toastId });
      }
    } catch (error) {
      toast.error('Error during re-indexing', { id: toastId });
      console.error('Re-index error:', error);
    } finally {
      setIsReindexing(false);
      setReindexProgress(null);
    }
  };

  // Fetch sources from Supabase
  useEffect(() => {
    if (!notebookId) return;

    const fetchSources = async () => {
      setIsLoading(true);
      try {
        console.log('📚 Fetching sources for notebook:', notebookId);
        const { data, error } = await supabase
          .from('sources')
          .select('*')
          .eq('notebook_id', notebookId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching sources:', error);
          return;
        }

        console.log('✅ Found sources:', data?.length || 0);
        console.log('Sources data:', data);

        // Transform database format to component format
        const transformedSources: Source[] = (data || []).map(source => ({
          id: source.id,
          title: source.title,
          type: source.type as any,
          trustScore: 85, // Default score
          status: source.processing_status === 'completed' ? 'processed' :
            source.processing_status === 'processing' ? 'processing' : 'processed',
          date: new Date(source.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }));

        setSources(transformedSources);
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSources();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('sources-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sources',
        filter: `notebook_id=eq.${notebookId}`
      }, (payload) => {
        console.log('Source changed:', payload);
        fetchSources(); // Refetch when changes occur
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notebookId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      setModalQuery(query);
      setIsSearchModalOpen(true);
    }
  };

  const filteredSources = sources.filter(source => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Web') return source.type === 'web';
    if (activeFilter === 'Academic') return source.type === 'pdf';
    if (activeFilter === 'Video') return source.type === 'youtube' || source.type === 'video';
    return true;
  });

  return (
    <>
      <div className="h-full flex flex-col relative group/panel overflow-hidden" data-panel="sources">
        {/* Top Section */}
        <div className="flex flex-col gap-3 shrink-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-semibold text-lg text-white">Sources</h2>
            <span className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded-full">
              {isLoading ? '...' : sources.length}
            </span>
          </div>

          {/* Search Bar */}
          <div className="relative group z-20">
            <GlassPanel variant="pill" className="bg-[#0F1218]/80 focus-within:bg-[#0F1218] focus-within:ring-1 focus-within:ring-memento-purple-500/50 transition-all">
              <div className="p-1.5 flex items-center gap-2 w-full">
                <div className="p-2 rounded-full bg-memento-purple-500/20 text-memento-purple-400 shrink-0">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or describe..."
                  className="bg-transparent border-none focus:ring-0 text-sm text-slate-200 w-full placeholder:text-slate-500 h-9"
                />
                <button
                  onClick={() => setSearchMode(prev => prev === 'fast' ? 'deep' : 'fast')}
                  className={`mr-1 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-[10px] font-bold tracking-wider border transition-all shrink-0
                    ${searchMode === 'fast'
                      ? 'bg-memento-accent-cyan/10 text-memento-accent-cyan border-memento-accent-cyan/20 hover:bg-memento-accent-cyan/20'
                      : 'bg-memento-purple-500/20 text-memento-purple-400 border-memento-purple-500/30 shadow-glow'
                    }`}
                  title={`Mode: ${searchMode === 'fast' ? 'Fast Retrieval' : 'Deep Research'}`}
                >
                  {searchMode === 'fast' ? <Zap size={12} strokeWidth={2.5} /> : <Layers size={12} />}
                  <span className="uppercase">{searchMode}</span>
                </button>
              </div>
            </GlassPanel>
          </div>

          {/* Filters + Drop Zone */}
          <div className="relative border border-dashed border-white/10 rounded-2xl p-3 bg-white/[0.02] flex flex-col gap-3 transition-all hover:bg-white/[0.04] hover:border-memento-purple-500/30 group/zone">
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {FILTERS.map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap
                    ${activeFilter === filter
                      ? 'bg-white/10 text-white shadow-sm border border-white/10'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div
              className="flex flex-col items-center justify-center gap-2 py-4 cursor-pointer"
              onClick={() => setIsUploadModalOpen(true)}
            >
              <div className="w-10 h-10 rounded-full bg-[#1A1D24] flex items-center justify-center text-memento-purple-400 group-hover/zone:scale-110 group-hover/zone:bg-memento-purple-500/20 transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.2)] group-hover/zone:shadow-glow">
                <Plus size={18} strokeWidth={2} />
              </div>
              <span className="text-[11px] font-medium text-slate-500 group-hover/zone:text-slate-300 transition-colors">
                Drop PDF
              </span>
            </div>
          </div>
        </div>

        {/* Sources List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar -mr-1 mt-3 pb-12 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader className="animate-spin text-memento-purple-400" size={24} />
            </div>
          ) : filteredSources.length > 0 ? (
            filteredSources.map((source, index) => (
              <GlassPanel
                key={source.id}
                variant="card"
                intensity="low"
                interactive
                hoverEffect
                className="group border-transparent hover:border-white/10 transition-all"
                data-source-index={index + 1}
              >
                <div className="p-3 flex items-start gap-3 w-full">
                  {/* Icon */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border border-white/5 transition-colors
                      ${source.type === 'pdf' ? 'bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20' : ''}
                      ${source.type === 'youtube' ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500/20' : ''}
                      ${source.type === 'web' ? 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20' : ''}
                      ${source.type === 'audio' ? 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20' : ''}
                    `}>
                      {source.type === 'pdf' && <FileText size={18} />}
                      {source.type === 'youtube' && <Youtube size={18} />}
                      {source.type === 'web' && <Globe size={18} />}
                      {source.type === 'audio' && <Mic size={18} />}
                    </div>

                    {source.status === 'processing' && (
                      <div className="absolute -bottom-1 -right-1 bg-[#0B0E13] rounded-full p-0.5 border-2 border-[#0B0E13]">
                        <Loader size={10} className="animate-spin text-amber-400" />
                      </div>
                    )}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 min-w-0 -mt-px">
                    <h4 className="text-sm font-medium text-slate-200 truncate group-hover:text-memento-purple-300 transition-colors leading-none">
                      {source.title}
                    </h4>

                    <div className="flex items-center justify-between mt-0.5 text-[11px] text-slate-500 font-medium leading-none">
                      <div className="flex items-center gap-2">
                        <span className="uppercase tracking-wider opacity-70">{source.type}</span>
                        <span className="opacity-30">•</span>
                        <span>{source.date}</span>
                      </div>

                      {/* Trust Score Pill */}
                      <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 whitespace-nowrap">
                        <div className={`w-1.5 h-1.5 rounded-full ${source.trustScore > 90
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                            : 'bg-amber-400'
                          }`} />
                        <span className={source.trustScore > 90 ? 'text-emerald-300' : 'text-amber-300'}>
                          {source.trustScore}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassPanel>
            ))
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              No sources found for "{activeFilter}"
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="absolute bottom-0 left-0 w-full py-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-500 bg-[#0B0E13] z-30 px-1">
          <div className="flex items-center gap-1 px-2 py-1">
            <span>{filteredSources.length} shown</span>
          </div>

          {/* Re-index Button */}
          <button
            onClick={handleReindex}
            disabled={isReindexing || sources.length === 0}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-[11px] font-medium
              ${isReindexing
                ? 'bg-memento-purple-500/20 text-memento-purple-300 cursor-wait'
                : graphStats && graphStats.entityCount > 0
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
              }
              disabled:opacity-50 disabled:cursor-not-allowed`}
            title={graphStats && graphStats.entityCount > 0
              ? `Knowledge graph: ${graphStats.entityCount} entities`
              : 'Build knowledge graph for better AI responses'}
          >
            {isReindexing ? (
              <>
                <Loader size={12} className="animate-spin" />
                <span>Indexing...</span>
              </>
            ) : (
              <>
                <Brain size={12} />
                <span>
                  {graphStats && graphStats.entityCount > 0
                    ? `${graphStats.entityCount} Entities`
                    : 'Build Graph'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Re-index Progress Overlay */}
        {isReindexing && reindexProgress && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 rounded-xl">
            <div className="bg-[#0F1218] border border-white/10 rounded-xl p-4 max-w-[280px] w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-memento-purple-500/20 flex items-center justify-center">
                  <Brain size={20} className="text-memento-purple-400 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Building Knowledge Graph</h4>
                  <p className="text-xs text-slate-400">
                    {reindexProgress.current}/{reindexProgress.total} sources
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-memento-purple-500 to-memento-accent-pink transition-all duration-300"
                  style={{
                    width: reindexProgress.total > 0
                      ? `${(reindexProgress.current / reindexProgress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>

              <p className="text-[11px] text-slate-500 truncate">
                {reindexProgress.message}
              </p>
            </div>
          </div>
        )}
      </div>

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        initialQuery={modalQuery}
      />

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        notebookId={notebookId || ''}
      />
    </>
  );
};
