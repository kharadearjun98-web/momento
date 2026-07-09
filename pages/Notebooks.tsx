import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, Plus, Clock, Search, Grid, List, Trash2, Edit2 } from 'lucide-react';
import { GlassPanel, Glow } from '../components/ui/Glass';
import { Button } from '../components/ui/Button';
import { Notebook } from '../types';
import { supabase } from '../lib/supabase/client';

export const Notebooks: React.FC = () => {
  const navigate = useNavigate();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [notebookPendingDelete, setNotebookPendingDelete] = useState<Notebook | null>(null);
  const [isDeletingNotebook, setIsDeletingNotebook] = useState(false);

  // Fetch all notebooks
  useEffect(() => {
    fetchNotebooks();
  }, []);

  const fetchNotebooks = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data: notebooksData, error } = await supabase
        .from('notebooks')
        .select(`
          id,
          title,
          updated_at,
          sources (count)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!error && notebooksData) {
        const formattedNotebooks = notebooksData.map((nb: any, index: number) => {
          const colors = ['#8B5CF6', '#22D3EE', '#F472B6', '#10B981', '#F59E0B', '#EF4444'];
          const now = new Date();
          const updated = new Date(nb.updated_at);
          const diffMs = now.getTime() - updated.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const diffHours = Math.floor(diffMs / 3600000);
          const diffDays = Math.floor(diffMs / 86400000);

          let lastEdited = 'Just now';
          if (diffMins < 60) {
            lastEdited = `${diffMins}m ago`;
          } else if (diffHours < 24) {
            lastEdited = `${diffHours}h ago`;
          } else {
            lastEdited = `${diffDays}d ago`;
          }

          return {
            id: nb.id,
            title: nb.title,
            lastEdited,
            sourceCount: nb.sources?.[0]?.count || 0,
            coverColor: colors[index % colors.length],
          };
        });

        setNotebooks(formattedNotebooks);
      }
    }
    setIsLoading(false);
  };

  const handleDeleteNotebook = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const notebook = notebooks.find((nb) => nb.id === id);
    if (notebook) {
      setNotebookPendingDelete(notebook);
    }
  };

  const handleConfirmDeleteNotebook = async () => {
    if (!notebookPendingDelete) return;

    setIsDeletingNotebook(true);

    const { error } = await supabase
      .from('notebooks')
      .delete()
      .eq('id', notebookPendingDelete.id);

    if (!error) {
      setNotebooks(notebooks.filter(nb => nb.id !== notebookPendingDelete.id));
      setNotebookPendingDelete(null);
    }

    setIsDeletingNotebook(false);
  };

  const handleStartEdit = (notebook: Notebook, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(notebook.id);
    setEditTitle(notebook.title);
  };

  const handleSaveEdit = async (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!editTitle.trim()) return;

    const { error } = await supabase
      .from('notebooks')
      .update({ title: editTitle, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setNotebooks(notebooks.map(nb => 
        nb.id === id ? { ...nb, title: editTitle } : nb
      ));
      setEditingId(null);
      setEditTitle('');
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  const filteredNotebooks = notebooks.filter(notebook =>
    notebook.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full overflow-hidden relative">
      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Glow className="top-[-10%] left-[5%] w-[1000px] h-[1000px] bg-gradient-to-br from-purple-600/15 to-pink-600/10 blur-[150px]" />
        <Glow className="top-[20%] right-[10%] w-[700px] h-[700px] bg-gradient-to-bl from-cyan-500/15 to-blue-600/10 blur-[140px]" />
        <Glow className="bottom-[-5%] left-[30%] w-[800px] h-[800px] bg-gradient-to-tr from-indigo-600/10 to-purple-600/10 blur-[130px]" />
      </div>

      <div className="h-full overflow-y-auto custom-scrollbar p-8 relative z-10">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-4">
            <div>
              <h1 className="text-5xl font-display font-bold bg-gradient-to-r from-white via-purple-200 to-cyan-200 bg-clip-text text-transparent mb-3">My Notebooks</h1>
              <p className="text-slate-400 text-lg">
                {notebooks.length} {notebooks.length === 1 ? 'notebook' : 'notebooks'} • Organize your knowledge
              </p>
            </div>
            <Button
              variant="primary"
              icon={<Plus size={18} />}
              onClick={() => navigate('/new')}
            >
              Create Notebook
            </Button>
          </div>

          {/* Search and View Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400" />
              <input
                type="text"
                placeholder="Search notebooks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-14 pl-14 pr-4 bg-gradient-to-r from-white/5 to-white/10 border border-white/20 rounded-2xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 focus:bg-white/10 transition-all shadow-lg shadow-black/10"
              />
            </div>

            <div className="flex items-center gap-2 bg-gradient-to-r from-white/10 to-white/5 border border-white/20 rounded-2xl p-1.5 shadow-lg shadow-black/10">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-3 rounded-xl transition-all ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-purple-300 shadow-lg shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-3 rounded-xl transition-all ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-br from-purple-500/30 to-pink-500/20 text-purple-300 shadow-lg shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <List size={20} />
              </button>
            </div>
          </div>

          {/* Notebooks Grid/List */}
          {isLoading ? (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-52 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredNotebooks.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen size={64} className="mx-auto mb-4 text-slate-600" />
              <h3 className="text-2xl font-semibold text-slate-300 mb-2">
                {searchQuery ? 'No notebooks found' : 'No notebooks yet'}
              </h3>
              <p className="text-slate-400 mb-6">
                {searchQuery
                  ? 'Try adjusting your search query'
                  : 'Create your first notebook to start organizing your knowledge'}
              </p>
              {!searchQuery && (
                <Button
                  variant="primary"
                  icon={<Plus size={18} />}
                  onClick={() => navigate('/new')}
                >
                  Create Notebook
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredNotebooks.map((notebook, index) => (
                <Link
                  to={`/notebook/${notebook.id}`}
                  key={notebook.id}
                  className="block group animate-fade-in-up"
                  style={{ 
                    animationDelay: `${index * 50}ms`,
                    animationFillMode: 'both'
                  }}
                >
                  <GlassPanel
                    variant="card"
                    intensity="medium"
                    className="h-52 p-5 flex flex-col justify-between relative overflow-hidden transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_-12px_rgba(139,92,246,0.4)] border border-white/10 group-hover:border-white/30 rounded-2xl"
                  >
                    {/* Animated Cover Gradient */}
                    <div
                      className="absolute top-0 left-0 w-full h-1 opacity-70 transition-all duration-500 group-hover:h-2 group-hover:opacity-100"
                      style={{ 
                        background: `linear-gradient(90deg, ${notebook.coverColor}ee, ${notebook.coverColor}88)` 
                      }}
                    />
                    
                    {/* Color wave animation from top to bottom */}
                    <div 
                      className="absolute top-0 left-0 w-full h-0 opacity-0 group-hover:h-full group-hover:opacity-20 transition-all duration-700 ease-out"
                      style={{ 
                        background: `linear-gradient(180deg, ${notebook.coverColor}66, transparent)` 
                      }}
                    />
                    
                    {/* Animated shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Subtle rotating glow */}
                    <div 
                      className="absolute -inset-1 rounded-xl opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-700"
                      style={{ 
                        background: `conic-gradient(from 0deg at 50% 50%, ${notebook.coverColor}00, ${notebook.coverColor}88, ${notebook.coverColor}00)`,
                        animation: 'spin 3s linear infinite'
                      }}
                    />

                    <div className="flex justify-between items-start relative z-10">
                      <div
                        className="w-12 h-12 rounded-xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 flex items-center justify-center text-slate-200 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-black/10"
                        style={{ 
                          color: notebook.coverColor
                        }}
                      >
                        <BookOpen size={24} strokeWidth={2.2} />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => handleStartEdit(notebook, e)}
                          className="text-slate-500 hover:text-white transition-all duration-300 p-2 hover:bg-white/10 rounded-full opacity-0 group-hover:opacity-100 hover:scale-110"
                          title="Edit name"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteNotebook(notebook.id, e)}
                          className="text-slate-500 hover:text-rose-400 transition-all duration-300 p-2 hover:bg-white/10 rounded-full opacity-0 group-hover:opacity-100 hover:scale-110"
                          title="Delete notebook"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="relative z-10">
                      {editingId === notebook.id ? (
                        <div className="space-y-2" onClick={(e) => e.preventDefault()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(notebook.id, e);
                              if (e.key === 'Escape') handleCancelEdit(e);
                            }}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500/50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => handleSaveEdit(notebook.id, e)}
                              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs rounded-lg transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-semibold text-white mb-3 line-clamp-2 leading-tight group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:via-purple-200 group-hover:to-cyan-200 group-hover:bg-clip-text transition-all duration-500">
                            {notebook.title}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                            <div className="flex items-center gap-1.5 group-hover:text-slate-300 transition-colors duration-300">
                              <Clock size={12} className="opacity-70" /> 
                              <span>{notebook.lastEdited}</span>
                            </div>
                            <span className="opacity-50">|</span>
                            <div className="flex items-center gap-1.5 group-hover:text-slate-300 transition-colors duration-300">
                              <span>{notebook.sourceCount} sources</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </GlassPanel>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotebooks.map((notebook) => (
                <Link
                  to={`/notebook/${notebook.id}`}
                  key={notebook.id}
                  className="block group"
                >
                  <GlassPanel
                    variant="card"
                    intensity="low"
                    className="p-5 flex items-center gap-4 hover:bg-white/10 transition-all"
                  >
                    <div
                      className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0"
                      style={{ color: notebook.coverColor }}
                    >
                      <BookOpen size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === notebook.id ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(notebook.id, e);
                              if (e.key === 'Escape') handleCancelEdit(e);
                            }}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-purple-500/50"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            onClick={(e) => handleSaveEdit(notebook.id, e)}
                            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-lg font-semibold text-white truncate">{notebook.title}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                            <span className="flex items-center gap-1">
                              <Clock size={12} /> {notebook.lastEdited}
                            </span>
                            <span className="opacity-50">|</span>
                            <span>{notebook.sourceCount} sources</span>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => handleStartEdit(notebook, e)}
                        className="text-slate-500 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full opacity-0 group-hover:opacity-100"
                        title="Edit name"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteNotebook(notebook.id, e)}
                        className="text-slate-500 hover:text-rose-400 transition-colors p-2 hover:bg-white/10 rounded-full opacity-0 group-hover:opacity-100"
                        title="Delete notebook"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </GlassPanel>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {notebookPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-notebook-title"
        >
          <GlassPanel
            intensity="high"
            className="w-full max-w-md p-6 border border-rose-500/20 shadow-[0_20px_80px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-300 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-notebook-title" className="text-xl font-semibold text-white">
                  Delete notebook?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  This will permanently delete <span className="font-medium text-white">{notebookPendingDelete.title}</span>. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setNotebookPendingDelete(null)}
                disabled={isDeletingNotebook}
              >
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmDeleteNotebook}
                disabled={isDeletingNotebook}
                className="h-10 inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-6 text-sm font-medium text-white transition-all hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 focus:ring-offset-[#0B0E13] disabled:pointer-events-none disabled:opacity-60"
              >
                {isDeletingNotebook ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
};
