
import React, { useState } from 'react';
import { X, Layers, BrainCircuit, HelpCircle, Lightbulb, Play, Sparkles } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { FlashcardCount, FlashcardDeck } from '../types';
import type { FlashcardDifficulty } from '../lib/flashcardGenerator';
import { useNotification } from '../lib/useNotification';
import { supabase } from '../lib/supabase/client';

interface FlashcardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId?: string;
  onFlashcardsGenerated?: (deck: FlashcardDeck) => void;
}

export const FlashcardsModal: React.FC<FlashcardsModalProps> = ({ 
  isOpen, 
  onClose, 
  notebookId,
  onFlashcardsGenerated 
}) => {
  const [count, setCount] = useState<FlashcardCount>('10 Cards');
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>('Medium');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const notification = useNotification();

  const counts: FlashcardCount[] = ['10 Cards', '25 Cards', '50 Cards'];

  const handleGenerate = async () => {
    if (!notebookId) {
      setError('No notebook selected. Please open a notebook first.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGenerationStatus('Initializing...');

    try {
      const { data, error } = await supabase.functions.invoke('generate-flashcards', {
        body: {
          notebookId,
          count,
          difficulty,
          customPrompt: prompt || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.deck) {
        throw new Error('Flashcard service did not return a deck.');
      }

      setGenerationStatus('Complete!');
      notification.flashcards('Flashcards Generated', `${data.deck.cards?.length || 0} cards ready to study.`);
      onFlashcardsGenerated?.(data.deck);
      onClose();

    } catch (err) {
      console.error('Error generating flashcards:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate flashcards';
      setError(errorMessage);
      notification.error('Flashcard Generation Failed', errorMessage);
      setIsGenerating(false);
      setGenerationStatus('');
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
             <Layers size={18} className="text-memento-accent-pink" />
             <h2 className="text-sm font-display font-semibold text-white">Generate Flashcards</h2>
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
          
          {/* Count Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Set Size</h3>
            <div className="grid grid-cols-3 gap-2">
              {counts.map((c) => (
                <button
                  key={c}
                  onClick={() => setCount(c)}
                  className={`px-1 py-3 rounded-xl text-xs font-semibold transition-all duration-200 border flex flex-col items-center gap-1
                    ${count === c 
                      ? 'bg-memento-accent-pink/10 border-memento-accent-pink/40 text-white shadow-[inset_0_0_10px_rgba(244,114,182,0.1)]' 
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <span className={count === c ? 'text-memento-accent-pink' : 'text-slate-500'}>
                     <Layers size={16} />
                  </span>
                  {c}
                </button>
              ))}
            </div>
          </section>

          {/* Difficulty Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Difficulty
            </h3>
            <div className="bg-white/[0.02] p-1 rounded-xl border border-white/5 flex">
               {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
                 <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                        difficulty === d
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                 >
                    {d}
                 </button>
               ))}
            </div>
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Focus Topics
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-pink/30 to-purple-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="List key concepts, terms, or chapters to cover..."
                className="relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner"
              />
              <Sparkles size={12} className="absolute bottom-3 right-3 text-slate-600" />
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/50 shrink-0 space-y-2">
          {/* Error Display */}
          {error && (
            <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}
          
          {/* Status Display */}
          {isGenerating && generationStatus && (
            <div className="text-xs text-center text-slate-400">
              {generationStatus}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={isGenerating}>Cancel</Button>
            <Button 
              variant="glow" 
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={isGenerating}
              icon={!isGenerating ? <Play size={14} /> : undefined}
              className="flex-[2] bg-memento-accent-pink hover:bg-pink-400 border-none shadow-[0_0_15px_rgba(244,114,182,0.3)]"
            >
              {isGenerating ? generationStatus || 'Generating...' : 'Create Deck'}
            </Button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};
