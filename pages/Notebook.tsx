import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SourcesPanel } from '../components/SourcesPanel';
import { ChatInterface } from '../components/ChatInterface';
import { StudioPanel } from '../components/StudioPanel';
import { Glow } from '../components/ui/Glass';
import { Edit2, Check, X, BookOpen, Search } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { SearchModal } from '../components/SearchModal';

export const Notebook: React.FC = () => {
  const { id: notebookId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notebookTitle, setNotebookTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch notebook title
  useEffect(() => {
    const fetchNotebook = async () => {
      if (!notebookId) return;
      
      const { data, error } = await supabase
        .from('notebooks')
        .select('title')
        .eq('id', notebookId)
        .single();

      if (!error && data) {
        setNotebookTitle(data.title);
      }
      setIsLoading(false);
    };

    fetchNotebook();
  }, [notebookId]);

  const handleStartEdit = () => {
    setEditTitleValue(notebookTitle);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    if (!editTitleValue.trim() || !notebookId) return;

    const { error } = await supabase
      .from('notebooks')
      .update({ title: editTitleValue, updated_at: new Date().toISOString() })
      .eq('id', notebookId);

    if (!error) {
      setNotebookTitle(editTitleValue);
      setIsEditingTitle(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitleValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(true);
    }
  };
  
  return (
    <div className="h-full w-full px-4 pt-0 pb-0 flex flex-col gap-0 relative">
      {/* Glow effects behind panels */}
      <Glow className="top-20 left-20 w-96 h-96 bg-memento-purple-600/10" />
      <Glow className="bottom-20 right-1/3 w-[500px] h-[500px] bg-memento-accent-cyan/5" />

      {/* Search Modal */}
      <SearchModal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        initialQuery={searchQuery}
      />

      {/* Notebook Title Header */}
      <div className="h-14 shrink-0 flex items-center justify-between px-2 border-b border-white/5 bg-gradient-to-b from-black/20 to-transparent">
        {/* Left: Title */}
        <div className="flex items-center gap-3 flex-1">
          {isLoading ? (
            <div className="h-8 w-64 bg-white/5 animate-pulse rounded-lg" />
          ) : isEditingTitle ? (
            <div className="flex items-center gap-2 flex-1 max-w-2xl">
              <input
                type="text"
                value={editTitleValue}
                onChange={(e) => setEditTitleValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white text-lg font-semibold focus:outline-none focus:border-purple-500/50"
                autoFocus
              />
              <button
                onClick={handleSaveTitle}
                className="p-2 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors"
                title="Save"
              >
                <Check size={20} />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-2 text-slate-400 hover:bg-white/10 rounded-lg transition-colors"
                title="Cancel"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-3 group px-3 py-2 rounded-lg hover:bg-white/5 transition-all"
            >
              <h1 className="text-xl font-display font-bold text-white group-hover:text-purple-300 transition-colors">
                {notebookTitle}
              </h1>
              <Edit2 size={16} className="text-slate-500 group-hover:text-purple-400 opacity-0 group-hover:opacity-100 transition-all" />
            </button>
          )}
        </div>

        {/* Right: Search Bar + Notebooks Button */}
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative group w-[280px] focus-within:w-[340px] transition-all duration-300 ease-out">
            <div className="relative h-9 bg-[#0F1218]/90 hover:bg-[#151921] focus-within:bg-[#0B0E13] border border-white/[0.08] focus-within:border-purple-500/30 rounded-full flex items-center px-4 transition-all shadow-lg backdrop-blur-xl">
              <Search size={14} className="text-slate-500 group-focus-within:text-purple-400 transition-colors shrink-0 mr-2.5" />
              <input
                type="text"
                placeholder="Search in notebook..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm text-slate-300 placeholder:text-slate-600 w-full h-full font-medium"
              />
              <kbd className="text-[10px] font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-slate-500 group-focus-within:text-slate-400">⌘K</kbd>
            </div>
          </form>

          {/* Notebooks Button */}
          <button
            onClick={() => navigate('/notebooks')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 hover:text-purple-200 border border-purple-500/30 transition-all shadow-lg hover:shadow-purple-500/20"
            title="Go to Notebooks"
          >
            <BookOpen size={16} />
            <span>Notebooks</span>
          </button>
        </div>
      </div>

      {/* Main Content - Three Panels */}
      <div className="flex-1 flex gap-4 px-0 pt-4 min-h-0">
        {/* Left Pane: Sources */}
        <aside className="w-[340px] h-full shrink-0 flex flex-col animate-in slide-in-from-left-4 duration-500 fade-in">
          <SourcesPanel />
        </aside>

        {/* Center Pane: Chat/Canvas */}
        <section className="flex-1 h-full min-w-0 flex flex-col animate-in zoom-in-95 duration-500 delay-75 fade-in">
          <ChatInterface />
        </section>

        {/* Right Pane: Studio */}
        <aside className="w-[380px] h-full shrink-0 flex flex-col animate-in slide-in-from-right-4 duration-500 delay-150 fade-in">
          <StudioPanel notebookId={notebookId} />
        </aside>
      </div>
    </div>
  );
};