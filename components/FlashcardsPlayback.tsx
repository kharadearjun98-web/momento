import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, ChevronLeft, ChevronRight, Layers, Lightbulb, Check, RefreshCw, BookOpen, Trophy, Clock, Sparkles, Eye, EyeOff } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { FlashcardDeck, FlashcardProgress } from '../types';
import { saveFlashcardProgress, loadFlashcardProgress, clearFlashcardProgress, calculateProgressStats } from '../lib/flashcardGenerator';
import { renderMarkdown } from '../lib/markdownRenderer';
import 'katex/dist/katex.min.css';

interface FlashcardsPlaybackProps {
  deck: FlashcardDeck;
  onClose: () => void;
}

export const FlashcardsPlayback: React.FC<FlashcardsPlaybackProps> = ({ deck, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [cardStatuses, setCardStatuses] = useState<Record<string, 'learning' | 'reviewing' | 'mastered'>>({});
  const [previousProgress, setPreviousProgress] = useState<FlashcardProgress | null>(null);
  const [showPreviousResults, setShowPreviousResults] = useState(false);

  const currentCard = deck.cards[currentIndex];
  const totalCards = deck.cards.length;

  // Load previous progress on mount
  useEffect(() => {
    const progress = loadFlashcardProgress(deck.id);
    if (progress) {
      setPreviousProgress(progress);
      setCardStatuses(progress.cardStatuses);
      setCurrentIndex(progress.currentIndex);
      setShowPreviousResults(true);
    }
  }, [deck.id]);

  // Calculate statistics
  const stats = calculateProgressStats(cardStatuses, totalCards);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setIsFlipped(!isFlipped);
      } else if (e.key === 'h' || e.key === 'H') {
        setShowHint(!showHint);
      } else if (e.key === '1') {
        handleMarkCard('learning');
      } else if (e.key === '2') {
        handleMarkCard('reviewing');
      } else if (e.key === '3') {
        handleMarkCard('mastered');
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, showHint, currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      setShowHint(false);
    }
  }, [currentIndex, totalCards]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
      setShowHint(false);
    }
  }, [currentIndex]);

  const handleMarkCard = (status: 'learning' | 'reviewing' | 'mastered') => {
    const newStatuses = {
      ...cardStatuses,
      [currentCard.id]: status,
    };
    setCardStatuses(newStatuses);

    // Save progress
    const progressStats = calculateProgressStats(newStatuses, totalCards);
    saveFlashcardProgress(deck.id, {
      cardStatuses: newStatuses,
      currentIndex,
      ...progressStats,
      lastStudiedAt: new Date().toISOString(),
    });

    // Auto-advance to next card
    if (currentIndex < totalCards - 1) {
      setTimeout(() => {
        handleNext();
      }, 300);
    }
  };

  const handleRestart = () => {
    clearFlashcardProgress(deck.id);
    setCardStatuses({});
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowHint(false);
    setShowPreviousResults(false);
    setPreviousProgress(null);
  };

  const goToCard = (index: number) => {
    setCurrentIndex(index);
    setIsFlipped(false);
    setShowHint(false);
  };

  const getCardStatus = (index: number) => {
    const card = deck.cards[index];
    return cardStatuses[card.id] || 'not-studied';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const progressPercentage = totalCards > 0 ? Math.round((stats.masteredCount / totalCards) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#0B0E13]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-4 border-b border-white/10 bg-gradient-to-r from-memento-accent-pink/5 to-purple-500/5 shrink-0">
          {/* Top row - Title and Progress */}
          <div className="flex items-start justify-between gap-4 mb-3">
            {/* Left side - Icon and Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-memento-accent-pink/20 to-purple-500/20 flex items-center justify-center shrink-0">
                <Layers size={20} className="text-memento-accent-pink" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-display font-semibold text-white truncate">{deck.title}</h2>
                  {showPreviousResults && previousProgress && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 rounded border border-amber-500/30 shrink-0">
                      Previous Session
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span>{totalCards} cards • {deck.metadata?.difficulty || 'Medium'}</span>
                  {showPreviousResults && previousProgress && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(previousProgress.lastStudiedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Progress and Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Progress Badge */}
              <div className="px-3 py-1.5 bg-gradient-to-r from-memento-accent-pink/20 to-purple-500/20 rounded-xl border border-memento-accent-pink/30">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold text-memento-accent-pink">{stats.masteredCount}/{totalCards}</div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider">Mastered</div>
                  </div>
                  <div className="w-px h-6 bg-white/10" />
                  <div className="text-center">
                    <div className="text-xl font-bold text-white">{progressPercentage}%</div>
                    <div className="text-[9px] text-slate-400 uppercase tracking-wider">Complete</div>
                  </div>
                </div>
              </div>

              {showPreviousResults && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestart}
                  className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                >
                  <RotateCcw size={14} />
                  Restart
                </Button>
              )}

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Card Navigator */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {deck.cards.map((_, idx) => {
              const status = getCardStatus(idx);
              const isCurrent = idx === currentIndex;
              return (
                <button
                  key={idx}
                  onClick={() => goToCard(idx)}
                  className={`shrink-0 w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-200 ${isCurrent
                    ? 'bg-memento-accent-pink text-black ring-2 ring-memento-accent-pink/50 ring-offset-2 ring-offset-[#0B0E13]'
                    : status === 'mastered'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : status === 'reviewing'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : status === 'learning'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Flashcard Content */}
        <div className="flex-1 flex flex-col p-6 overflow-hidden">
          {/* Card Difficulty Badge */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-memento-accent-pink/10 text-memento-accent-pink rounded-md">
              Card {currentIndex + 1} of {totalCards}
            </span>
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-400 rounded-md">
              {currentCard.difficulty}
            </span>
            {cardStatuses[currentCard.id] && (
              <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${cardStatuses[currentCard.id] === 'mastered'
                ? 'bg-green-500/10 text-green-400'
                : cardStatuses[currentCard.id] === 'reviewing'
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'bg-blue-500/10 text-blue-400'
                }`}>
                {cardStatuses[currentCard.id]}
              </span>
            )}
          </div>

          {/* Flashcard */}
          <div
            className="flex-1 flex items-center justify-center cursor-pointer perspective-1000"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            <div
              className={`relative w-full max-w-2xl h-72 transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''
                }`}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Front Face */}
              <div
                className={`absolute inset-0 rounded-2xl border p-8 flex flex-col items-center justify-center text-center backface-hidden ${isFlipped ? 'pointer-events-none' : ''
                  } bg-gradient-to-br from-white/[0.08] to-white/[0.03] border-white/10 shadow-2xl`}
                style={{ backfaceVisibility: 'hidden' }}
              >
                <div className="mb-4">
                  <BookOpen size={24} className="text-memento-accent-pink/50" />
                </div>
                <div
                  className="text-xl font-semibold text-white leading-relaxed prose prose-invert max-w-none [&_p]:text-white [&_p]:my-2"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCard.front) }}
                />

                {/* Hint Section */}
                {currentCard.hint && (
                  <div className="mt-6">
                    {showHint ? (
                      <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <div className="flex items-center gap-2 text-amber-400 text-sm">
                          <Lightbulb size={14} className="shrink-0" />
                          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCard.hint) }} />
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHint(true);
                        }}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-amber-400 transition-colors flex items-center gap-1.5"
                      >
                        <Lightbulb size={12} />
                        Show Hint
                      </button>
                    )}
                  </div>
                )}

                <p className="text-xs text-slate-500 mt-6">Click or press Space to flip</p>
              </div>

              {/* Back Face */}
              <div
                className={`absolute inset-0 rounded-2xl border p-8 flex flex-col items-center justify-center text-center backface-hidden rotate-y-180 ${!isFlipped ? 'pointer-events-none' : ''
                  } bg-gradient-to-br from-memento-accent-pink/[0.08] to-purple-500/[0.05] border-memento-accent-pink/20 shadow-2xl`}
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <div className="mb-4">
                  <Sparkles size={24} className="text-memento-accent-pink" />
                </div>
                <div
                  className="text-lg text-slate-200 leading-relaxed prose prose-invert max-w-none [&_p]:text-slate-200 [&_p]:my-2"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(currentCard.back) }}
                />
                <p className="text-xs text-slate-500 mt-6">Click or press Space to flip back</p>
              </div>
            </div>
          </div>

          {/* Navigation and Rating */}
          <div className="mt-6 space-y-4">
            {/* Navigation */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 text-slate-300 text-xs hover:border-memento-purple-500 hover:text-memento-purple-400 disabled:opacity-40 disabled:pointer-events-none transition-all min-w-[90px] justify-center"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>

              <button
                onClick={handleNext}
                disabled={currentIndex === totalCards - 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-700 text-slate-300 text-xs hover:border-memento-purple-500 hover:text-memento-purple-400 disabled:opacity-40 disabled:pointer-events-none transition-all min-w-[90px] justify-center"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Rating Buttons */}
            <div className="flex items-center justify-center gap-3">
              <p className="text-xs text-slate-500 mr-2">How well did you know this?</p>
              <button
                onClick={() => handleMarkCard('learning')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${cardStatuses[currentCard.id] === 'learning'
                  ? 'bg-blue-500/20 text-blue-400 ring-2 ring-blue-500/40'
                  : 'bg-white/5 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400'
                  }`}
              >
                <RefreshCw size={14} />
                Still Learning
                <span className="text-[10px] opacity-60">[1]</span>
              </button>
              <button
                onClick={() => handleMarkCard('reviewing')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${cardStatuses[currentCard.id] === 'reviewing'
                  ? 'bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40'
                  : 'bg-white/5 text-slate-400 hover:bg-amber-500/10 hover:text-amber-400'
                  }`}
              >
                <Eye size={14} />
                Need Review
                <span className="text-[10px] opacity-60">[2]</span>
              </button>
              <button
                onClick={() => handleMarkCard('mastered')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${cardStatuses[currentCard.id] === 'mastered'
                  ? 'bg-green-500/20 text-green-400 ring-2 ring-green-500/40'
                  : 'bg-white/5 text-slate-400 hover:bg-green-500/10 hover:text-green-400'
                  }`}
              >
                <Check size={14} />
                Mastered
                <span className="text-[10px] opacity-60">[3]</span>
              </button>
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div className="flex items-center justify-center gap-4 text-[10px] text-slate-600">
              <span>←/→ Navigate</span>
              <span>Space: Flip</span>
              <span>H: Hint</span>
              <span>1/2/3: Rate</span>
              <span>Esc: Close</span>
            </div>
          </div>
        </div>

        {/* Progress Bar at Bottom */}
        <div className="h-1 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-memento-accent-pink to-purple-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* CSS for 3D flip effect */}
      <style>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
        .rotate-y-180 {
          transform: rotateY(180deg);
        }
      `}</style>
    </div>
  );
};
