
import React, { useState, useEffect } from 'react';
import { X, Search, CheckCircle2, Globe, ExternalLink, Zap, Layers } from 'lucide-react';
import { GlassPanel, Glow } from './ui/Glass';

interface SearchResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  source: string;
  date?: string;
  relevancy: number;
  selected: boolean;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery: string;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, initialQuery }) => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchMode, setSearchMode] = useState<'fast' | 'deep'>('deep');

  // Reset state when modal opens with a new query
  useEffect(() => {
    if (isOpen && initialQuery) {
      setQuery(initialQuery);
      handleSearch(initialQuery);
    }
  }, [isOpen, initialQuery]);

  const handleSearch = (searchQuery: string) => {
    setLoading(true);
    setHasSearched(true);
    setResults([]);

    // Simulate API Call / Search Delay
    setTimeout(() => {
      const titles = [
        `The Complete Guide to ${searchQuery}`,
        `Advanced Research: ${searchQuery} Methodologies`,
        `Future Trends in ${searchQuery} for 2024`,
        `Critical Analysis of ${searchQuery}`,
        `Case Studies: Implementing ${searchQuery}`,
        `Understanding the Basics of ${searchQuery}`
      ];
      
      const snippets = [
        `An in-depth look at how ${searchQuery} is transforming the industry, featuring expert interviews and data-driven insights.`,
        `This paper explores the fundamental principles of ${searchQuery}, providing a framework for further academic study.`,
        `Recent developments in ${searchQuery} suggest a paradigm shift. This article breaks down the key factors driving change.`,
        `A comparative analysis of ${searchQuery} against traditional models, highlighting efficiency gains and potential drawbacks.`,
        `Comprehensive documentation regarding ${searchQuery}, including historical context, primary sources, and statistical analysis.`
      ];

      const sources = ['Academic Journal', 'Tech Review', 'Industry Quarterly', 'Science Daily', 'Global News', 'Research Gate'];

      const mockResults: SearchResult[] = Array.from({ length: 5 }).map((_, i) => ({
        position: i,
        title: titles[i % titles.length],
        link: `https://example.com/${searchQuery.replace(/\s+/g, '-')}-${i}`,
        snippet: snippets[i % snippets.length],
        source: sources[i % sources.length],
        date: `${Math.floor(Math.random() * 10) + 1} days ago`,
        relevancy: Math.floor(98 - (i * (Math.random() * 5 + 2))),
        selected: false
      }));
      setResults(mockResults);
      setLoading(false);
    }, 1500);
  };

  const toggleSelection = (index: number) => {
    setResults(prev => {
      const newResults = [...prev];
      newResults[index].selected = !newResults[index].selected;
      return newResults;
    });
  };

  const selectedCount = results.filter(r => r.selected).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#050608]/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Content */}
      <GlassPanel 
        variant="panel" 
        intensity="high"
        className="w-full max-w-3xl h-[80vh] relative shadow-2xl border-white/10 animate-in zoom-in-95 duration-300 overflow-hidden"
      >
        {/* Flex container to ensure scroll area fills space correctly */}
        <div className="flex flex-col h-full w-full relative z-10">
            <Glow className="top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-memento-purple-600/20" />

            {/* Header */}
            <div className="p-6 pb-4 border-b border-white/10 shrink-0 relative z-10">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-semibold text-white">Discover Sources</h2>
                
                <div className="flex items-center gap-3">
                {selectedCount > 0 && (
                    <div className="text-xs font-medium text-memento-purple-300 bg-memento-purple-500/10 border border-memento-purple-500/20 rounded-full px-3 py-1.5 animate-in fade-in zoom-in duration-200">
                    {selectedCount} selected
                    </div>
                )}
                <button 
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative group">
                <div className="relative h-12 bg-[#0B0E13] rounded-xl border border-white/10 flex items-center px-3 shadow-inner focus-within:ring-1 focus-within:ring-memento-purple-500/50 transition-all">
                <Search size={20} className="text-slate-500 mr-3" />
                <input 
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(query)}
                    placeholder="Search for resources..."
                    className="flex-1 bg-transparent border-none outline-none text-base text-white placeholder:text-slate-600 h-full"
                    autoFocus
                />
                <div className="flex items-center gap-1">
                    <button 
                    onClick={() => setSearchMode(prev => prev === 'fast' ? 'deep' : 'fast')}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all border ${
                        searchMode === 'fast' 
                        ? 'bg-memento-accent-cyan/10 text-memento-accent-cyan border-memento-accent-cyan/20' 
                        : 'bg-memento-purple-500/10 text-memento-purple-400 border-memento-purple-500/20'
                    }`}
                    >
                    {searchMode === 'fast' ? <Zap size={12} /> : <Layers size={12} />}
                    <span className="uppercase">{searchMode}</span>
                    </button>
                </div>
                </div>
            </div>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10 pb-6">
            {loading ? (
                <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse flex p-4 gap-4">
                        <div className="w-12 h-12 rounded-lg bg-white/5" />
                        <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 bg-white/10 rounded" />
                        <div className="h-3 w-3/4 bg-white/5 rounded" />
                        </div>
                    </div>
                ))}
                </div>
            ) : (
                <div className="space-y-3">
                {results.length > 0 ? results.map((result, index) => (
                    <div 
                    key={index}
                    className={`group p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-start gap-4
                        ${result.selected 
                        ? 'bg-memento-purple-500/10 border-memento-purple-500/40' 
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                        }`}
                    onClick={() => toggleSelection(index)}
                    >
                    <div className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors
                        ${result.selected 
                        ? 'bg-memento-purple-500 border-memento-purple-500 text-white' 
                        : 'border-slate-600 text-transparent group-hover:border-slate-400'
                        }`}
                    >
                        <CheckCircle2 size={12} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-slate-200 group-hover:text-white mb-1">
                        {result.title}
                        </h4>
                        <p className="text-xs text-slate-400 line-clamp-2 mb-2">
                        {result.snippet}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><Globe size={10} /> {result.source}</span>
                        <span>•</span>
                        <span className="text-emerald-400">{result.relevancy}% Match</span>
                        </div>
                    </div>

                    <a 
                        href={result.link}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white transition-opacity p-2"
                    >
                        <ExternalLink size={14} />
                    </a>
                    </div>
                )) : hasSearched && (
                    <div className="text-center text-slate-500 py-10">
                    <p>No results found for "{query}"</p>
                    </div>
                )}
                </div>
            )}
            </div>
        </div>
      </GlassPanel>
    </div>
  );
};
