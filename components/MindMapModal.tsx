
import React, { useState } from 'react';
import { X, BrainCircuit, GitFork, CircleDot, Network, Share2, Play, Sparkles, AlertCircle } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { MindMapStyle, GeneratedMindMap } from '../types';
import { useNotification } from '../lib/useNotification';
import { supabase } from '../lib/supabase/client';

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onMindMapGenerated?: (mindmap: GeneratedMindMap) => void;
}

export const MindMapModal: React.FC<MindMapModalProps> = ({ isOpen, onClose, notebookId, onMindMapGenerated }) => {
  const [style, setStyle] = useState<MindMapStyle>('Hierarchical');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notification = useNotification();

  const styles: { id: MindMapStyle; icon: React.ReactNode; desc: string }[] = [
    { id: 'Hierarchical', icon: <GitFork size={20} />, desc: 'Top-down structure' },
    { id: 'Radial', icon: <CircleDot size={20} />, desc: 'Central concept' },
    { id: 'Flowchart', icon: <Share2 size={20} />, desc: 'Process flow' },
    { id: 'Concept Map', icon: <Network size={20} />, desc: 'Interconnected nodes' },
  ];

  const handleGenerate = async () => {
    if (!notebookId) {
      setError('No notebook selected');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-mindmap', {
        body: {
          notebookId,
          style,
          customPrompt: prompt || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.mindmap) {
        throw new Error('Mind map service did not return a map.');
      }

      notification.mindmap('Mind Map Generated', 'Your mind map is ready to explore.');
      onMindMapGenerated?.(data.mindmap);
      onClose();
    } catch (err) {
      console.error('Failed to generate mind map:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate mind map';
      setError(message);
      notification.error('Mind Map Generation Failed', message);
    } finally {
      setIsGenerating(false);
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
             <BrainCircuit size={18} className="text-memento-accent-cyan" />
             <h2 className="text-sm font-display font-semibold text-white">Generate Mind Map</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
          
          {/* Error Display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {/* Style Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Structure Style</h3>
            <div className="grid grid-cols-2 gap-2">
              {styles.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStyle(item.id)}
                  className={`relative p-3 rounded-xl flex flex-col items-center gap-2 text-center transition-all duration-200 border
                    ${style === item.id 
                      ? 'bg-memento-accent-cyan/10 border-memento-accent-cyan/40 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)]' 
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }`}
                >
                  <div className={`transition-colors duration-200 ${style === item.id ? 'text-memento-accent-cyan' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${style === item.id ? 'text-white' : 'text-slate-300'}`}>
                      {item.id}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
                  </div>
                  
                  {/* Active indicator dot */}
                  {style === item.id && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-accent-cyan shadow-[0_0_4px_#22D3EE]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Focus Area
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-cyan/30 to-blue-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the central concept or specific relationships to visualize..."
                className="relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner"
              />
              <Sparkles size={12} className="absolute bottom-3 right-3 text-slate-600" />
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/50 shrink-0 flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button 
            variant="glow" 
            size="sm"
            onClick={handleGenerate}
            isLoading={isGenerating}
            icon={!isGenerating ? <Play size={14} /> : undefined}
            className="flex-[2] bg-memento-accent-cyan hover:bg-cyan-400 border-none shadow-[0_0_15px_rgba(34,211,238,0.3)] text-black"
          >
            {isGenerating ? 'Mapping...' : 'Generate Map'}
          </Button>
        </div>
      </GlassPanel>
    </div>
  );
};
