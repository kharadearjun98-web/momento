
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Loader2, Zap, Layers, Globe, CheckCircle2, Plus, ExternalLink } from 'lucide-react';
import { Glow } from '../components/ui/Glass';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase/client';
import { chunkText, generateEmbeddings } from '../lib/documentProcessor';
import { useNotification } from '../lib/useNotification';

interface SearchResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
  relevancy: number; // 0-100
  content?: string;
  selected: boolean;
}

interface DiscoverApiResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
  relevancy: number;
  content?: string;
}

export const Discover: React.FC = () => {
  const navigate = useNavigate();
  const notification = useNotification();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'fast' | 'deep'>('fast');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);

  const sanitizeText = (text: string): string => {
    return text
      .replace(/\u0000/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\\u[0-9a-fA-F]{0,3}(?![0-9a-fA-F])/g, '')
      .replace(/[\uFFFE\uFFFF]/g, '')
      .trim();
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    setHasSearched(true);
    setResults([]);
    setSelectedCount(0);

    try {
      const response = await fetch(`/api/discover?q=${encodeURIComponent(query)}&num=8`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Discover search failed');
      }
      
      const data = await response.json();
      
      if (Array.isArray(data.results)) {
        const mappedResults: SearchResult[] = data.results.map((item: DiscoverApiResult, index: number) => ({
          position: item.position ?? index,
          title: item.title,
          link: item.link,
          snippet: item.snippet,
          source: item.source,
          date: item.date || 'Recent',
          relevancy: item.relevancy,
          content: item.content,
          selected: false
        }));
        setResults(mappedResults);
      }
    } catch (error) {
      console.warn('Discover API call failed', error);
      notification.error('Search Failed', error instanceof Error ? error.message : 'Unable to search sources');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (index: number) => {
    setResults(prev => {
      const newResults = [...prev];
      newResults[index].selected = !newResults[index].selected;
      
      const count = newResults.filter(r => r.selected).length;
      setSelectedCount(count);
      
      return newResults;
    });
  };

  const handleImport = async () => {
    const selectedResults = results.filter(result => result.selected);
    if (selectedResults.length === 0 || importing) return;

    setImporting(true);
    setImportProgress('Checking authentication...');

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('You must be signed in to import sources');
      }

      setImportProgress('Creating notebook...');
      const { data: notebook, error: notebookError } = await supabase
        .from('notebooks')
        .insert({
          user_id: user.id,
          title: query.trim() || 'Discovered Sources',
          description: `Discovered web sources for: ${query.trim()}`,
        })
        .select()
        .single();

      if (notebookError) {
        throw new Error(`Failed to create notebook: ${notebookError.message}`);
      }

      for (let i = 0; i < selectedResults.length; i++) {
        const result = selectedResults[i];
        const rawContent = result.content || result.snippet || '';
        const content = sanitizeText(`# ${result.title}\n\nSource: ${result.link}\n\n${rawContent}`);
        const processingStatus = content.length > 0 ? 'completed' : 'failed';

        setImportProgress(`Importing ${i + 1}/${selectedResults.length}: ${result.title}`);
        const { data: source, error: sourceError } = await supabase
          .from('sources')
          .insert({
            notebook_id: notebook.id,
            title: result.title,
            type: 'web',
            file_path: result.link,
            content: content || null,
            processing_status: processingStatus,
            token_count: Math.ceil(content.length / 4),
          })
          .select()
          .single();

        if (sourceError) {
          throw new Error(`Failed to save source "${result.title}": ${sourceError.message}`);
        }

        if (!content || !source) continue;

        try {
          setImportProgress(`Indexing ${i + 1}/${selectedResults.length}: ${result.title}`);
          const chunks = chunkText(content, 1000, 200);
          const batchSize = 20;

          for (let j = 0; j < chunks.length; j += batchSize) {
            const batch = chunks.slice(j, Math.min(j + batchSize, chunks.length)).map(sanitizeText);
            const embeddings = await generateEmbeddings(batch);
            const chunksToInsert = batch.map((chunkContent, idx) => ({
              source_id: source.id,
              content: chunkContent,
              embedding: embeddings[idx],
              chunk_index: j + idx,
              metadata: {
                url: result.link,
                source: result.source,
                chunk_index: j + idx,
              },
            }));

            const { error: chunkError } = await supabase
              .from('document_chunks')
              .insert(chunksToInsert);

            if (chunkError) {
              console.error('Error inserting web chunks:', chunkError);
            }
          }

          setImportProgress(`Extracting graph ${i + 1}/${selectedResults.length}: ${result.title}`);
          try {
            const { extractAndStoreGraph } = await import('../lib/lightrag');
            await extractAndStoreGraph(
              source.id,
              notebook.id,
              chunks,
              (progress) => setImportProgress(progress)
            );
          } catch (graphError) {
            console.error('Graph extraction error:', graphError);
          }
        } catch (indexError) {
          console.error('Indexing error:', indexError);
          await supabase
            .from('sources')
            .update({ processing_status: 'failed' })
            .eq('id', source.id);
        }
      }

      setImportProgress('Opening notebook...');
      navigate(`/notebook/${notebook.id}`);
    } catch (error) {
      console.error('Import failed:', error);
      notification.error('Import Failed', error instanceof Error ? error.message : 'Unable to import sources');
      setImporting(false);
      setImportProgress('');
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Glow className="top-[-20%] right-[20%] w-[800px] h-[800px] bg-memento-purple-600/10 blur-[120px]" />
        <Glow className="bottom-[-10%] left-[10%] w-[600px] h-[600px] bg-memento-accent-cyan/5 blur-[100px]" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex flex-col h-full max-w-6xl mx-auto w-full p-6 pt-8">
        
        {/* Header Section */}
        <div className={`flex flex-col items-center text-center transition-all duration-500 ease-out ${hasSearched ? 'translate-y-0 mb-8' : 'translate-y-[20vh] mb-0'}`}>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Discover Sources
          </h1>
          <p className={`text-slate-400 max-w-xl transition-opacity duration-500 ${hasSearched ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
            Search a topic for curated web resources, papers, and articles.
          </p>

          {/* Search Bar Container */}
          <div className={`w-full max-w-4xl mt-6 relative group transition-all duration-500 ${hasSearched ? '' : 'scale-110'}`}>
            {/* Glowing border effect */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-purple-500 to-memento-accent-cyan rounded-full opacity-30 blur group-focus-within:opacity-70 transition duration-500"></div>
            
            <div className="relative h-20 bg-[#0F1218] rounded-full border border-white/10 flex items-center px-3 shadow-2xl">
              <div className="pl-5 pr-4 text-slate-400">
                <Search size={28} />
              </div>
              
              <input 
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search for quantum physics, marketing trends..."
                className="flex-1 bg-transparent border-none outline-none text-xl text-white placeholder:text-slate-600 h-full font-medium"
                autoFocus
              />

              {/* Toggle Switch */}
              <div className="bg-[#1A1D24] rounded-full p-1.5 flex items-center gap-1 mr-3 border border-white/5">
                <button 
                  onClick={() => setSearchMode('fast')}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all duration-300 ${
                    searchMode === 'fast' 
                    ? 'bg-memento-accent-cyan text-[#0B0E13] shadow-[0_0_10px_rgba(34,211,238,0.4)]' 
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Zap size={14} strokeWidth={3} /> FAST
                </button>
                <button 
                  onClick={() => setSearchMode('deep')}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all duration-300 ${
                    searchMode === 'deep' 
                    ? 'bg-memento-purple-500 text-white shadow-[0_0_10px_rgba(139,92,246,0.4)]' 
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Layers size={14} strokeWidth={3} /> DEEP
                </button>
              </div>

              <button 
                onClick={handleSearch}
                className="h-14 w-14 bg-white rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors text-black shrink-0"
              >
                {loading ? <Loader2 size={24} className="animate-spin" /> : <ArrowRight size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Results List */}
        {hasSearched && (
          <div className="flex-1 min-h-0 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            
            {/* Results Toolbar */}
            <div className="flex items-center justify-between mb-4 px-2 shrink-0">
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400">
                  Found <span className="text-white font-semibold">{results.length > 0 ? results.length : '...'}</span> results
                </div>
              </div>
              
              {selectedCount > 0 && (
                <Button 
                  variant="glow" 
                  size="sm" 
                  onClick={handleImport}
                  disabled={importing}
                  isLoading={importing}
                  className="animate-in zoom-in duration-300"
                >
                  {importing ? 'Importing...' : `Import ${selectedCount} Sources`}
                </Button>
              )}
            </div>

            {importing && importProgress && (
              <div className="mb-4 px-2 text-xs text-slate-400 truncate">
                {importProgress}
              </div>
            )}

            {/* Scrollable List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-20">
              {loading ? (
                // Loading Skeletons
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse flex items-center p-6">
                    <div className="w-8 h-8 rounded-full bg-white/5 mr-6"></div>
                    <div className="flex-1 space-y-3">
                      <div className="h-5 w-1/3 bg-white/10 rounded"></div>
                      <div className="h-4 w-3/4 bg-white/5 rounded"></div>
                      <div className="h-4 w-1/2 bg-white/5 rounded"></div>
                    </div>
                  </div>
                ))
              ) : (
                results.map((result, index) => (
                  <div 
                    key={index}
                    className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer
                      ${result.selected 
                        ? 'bg-memento-purple-500/10 border-memento-purple-500/50 shadow-[0_0_20px_rgba(139,92,246,0.1)]' 
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                      }`}
                    onClick={() => toggleSelection(index)}
                  >
                    <div className="p-5 flex items-start gap-5">
                      {/* Checkbox */}
                      <div className={`mt-1 h-6 w-6 rounded-full border flex items-center justify-center transition-all duration-300
                        ${result.selected 
                          ? 'bg-memento-purple-500 border-memento-purple-500 text-white' 
                          : 'border-slate-600 text-transparent group-hover:border-slate-400'
                        }`}
                      >
                        <CheckCircle2 size={14} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <Globe size={12} />
                          <span className="truncate max-w-[200px]">{result.source}</span>
                          <span>•</span>
                          <span>{result.date}</span>
                        </div>
                        
                        <h3 className="text-lg font-semibold text-slate-200 group-hover:text-memento-purple-300 transition-colors mb-2 line-clamp-1">
                          {result.title}
                        </h3>
                        
                        <p className="text-sm text-slate-400 leading-relaxed line-clamp-2">
                          {result.snippet}
                        </p>

                        <div className="flex items-center gap-4 mt-4">
                          {/* Relevancy Score */}
                          <div className="flex items-center gap-2 bg-white/5 px-2 py-1 rounded-lg border border-white/5">
                             <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                               <div 
                                 className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500" 
                                 style={{ width: `${result.relevancy}%` }}
                               />
                             </div>
                             <span className="text-xs font-mono text-emerald-400">{result.relevancy}% Match</span>
                          </div>
                          
                          <a 
                            href={result.link} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="text-xs text-slate-500 hover:text-white flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View Source <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>

                      {/* Floating Add Action */}
                      <div className="flex flex-col items-center justify-center self-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0">
                         <div className={`p-2 rounded-full ${result.selected ? 'text-memento-purple-400' : 'text-slate-400'}`}>
                            {result.selected ? <CheckCircle2 size={24} /> : <Plus size={24} />}
                         </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
