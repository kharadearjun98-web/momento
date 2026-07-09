
import React, { useState } from 'react';
import { X, GraduationCap, CheckSquare, Type, HelpCircle, Play, Sparkles, ListChecks, Zap, Brain, Target } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { QuizType, QuizLength, QuizDifficulty, GeneratedQuiz } from '../types';
import { useNotification } from '../lib/useNotification';
import { supabase } from '../lib/supabase/client';

interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onQuizGenerated?: (quiz: GeneratedQuiz) => void;
}

export const QuizModal: React.FC<QuizModalProps> = ({ isOpen, onClose, notebookId, onQuizGenerated }) => {
  const [type, setType] = useState<QuizType>('Multiple Choice');
  const [length, setLength] = useState<QuizLength>('10 Questions');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('Medium');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const notification = useNotification();

  const types: { id: QuizType; icon: React.ReactNode; desc: string }[] = [
    { id: 'Multiple Choice', icon: <ListChecks size={20} />, desc: 'Standard format' },
    { id: 'True/False', icon: <CheckSquare size={20} />, desc: 'Quick check' },
    { id: 'Short Answer', icon: <Type size={20} />, desc: 'Recall practice' },
    { id: 'Mixed', icon: <HelpCircle size={20} />, desc: 'All types' },
  ];

  const lengths: QuizLength[] = ['5 Questions', '10 Questions', '20 Questions'];

  const difficulties: { id: QuizDifficulty; icon: React.ReactNode; desc: string }[] = [
    { id: 'Easy', icon: <Zap size={16} />, desc: 'Basic concepts' },
    { id: 'Medium', icon: <Brain size={16} />, desc: 'Understanding' },
    { id: 'Hard', icon: <Target size={16} />, desc: 'Deep thinking' },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-quiz', {
        body: {
          notebookId,
          type,
          length,
          difficulty,
          customPrompt: prompt || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.quiz) {
        throw new Error('Quiz service did not return a quiz.');
      }

      notification.quiz('Quiz Generated', `${data.quiz.questions?.length || 0} questions ready to play!`);
      onQuizGenerated?.(data.quiz);
      onClose();
      /*
      console.log('🎯 Starting quiz generation...');
      
      // Generate quiz
      const quiz = await generateQuiz(notebookId, {
        type,
        length,
        difficulty,
        customPrompt: prompt || undefined,
      });
      
      console.log('✅ Quiz generated successfully');
      
      // Save to database
      await saveQuiz(quiz);
      
      notification.quiz('Quiz Generated', `${quiz.questions.length} questions ready to play!`);
      
      // Notify parent component
      if (onQuizGenerated) {
        onQuizGenerated(quiz);
      }
      
      onClose();
      */
    } catch (error) {
      console.error('❌ Quiz generation error:', error);
      notification.error('Quiz Generation Failed', error instanceof Error ? error.message : 'Failed to generate quiz');
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
             <GraduationCap size={18} className="text-memento-accent-blue" />
             <h2 className="text-sm font-display font-semibold text-white">Generate Quiz</h2>
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
          className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20 min-h-0"
          style={{ 
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: '2rem',
            scrollBehavior: 'smooth'
          }}
        >
          
          {/* Type Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Question Format</h3>
            <div className="grid grid-cols-2 gap-2">
              {types.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setType(item.id)}
                  className={`relative p-3 rounded-xl flex flex-col items-center gap-2 text-center transition-all duration-200 border
                    ${type === item.id 
                      ? 'bg-memento-accent-blue/10 border-memento-accent-blue/40 shadow-[inset_0_0_20px_rgba(96,165,250,0.1)]' 
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }`}
                >
                  <div className={`transition-colors duration-200 ${type === item.id ? 'text-memento-accent-blue' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${type === item.id ? 'text-white' : 'text-slate-300'}`}>
                      {item.id}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
                  </div>
                  
                  {/* Active indicator dot */}
                  {type === item.id && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-accent-blue shadow-[0_0_4px_#60A5FA]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Length Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Quiz Length
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {lengths.map((l) => (
                <button
                  key={l}
                  onClick={() => setLength(l)}
                  className={`px-1 py-2 rounded-lg text-[10px] font-semibold transition-all duration-200 border
                    ${length === l 
                      ? 'bg-white text-black border-white shadow-lg scale-105 z-10' 
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          {/* Difficulty Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Difficulty Level</h3>
            <div className="grid grid-cols-3 gap-2">
              {difficulties.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  className={`relative p-2.5 rounded-lg flex flex-col items-center gap-1.5 transition-all duration-200 border
                    ${difficulty === d.id
                      ? 'bg-memento-accent-cyan/10 border-memento-accent-cyan/40 shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }`}
                >
                  <div className={`transition-colors duration-200 ${difficulty === d.id ? 'text-memento-accent-cyan' : 'text-slate-400'}`}>
                    {d.icon}
                  </div>
                  <div>
                    <div className={`text-[10px] font-semibold ${difficulty === d.id ? 'text-white' : 'text-slate-300'}`}>
                      {d.id}
                    </div>
                    <div className="text-[9px] text-slate-500 leading-tight">{d.desc}</div>
                  </div>
                  {difficulty === d.id && (
                    <div className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-memento-accent-cyan shadow-[0_0_4px_#22D3EE]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Learning Goals
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-blue/30 to-cyan-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Specify difficulty level, areas to test, or trick questions..."
                className="relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner"
              />
              <Sparkles size={12} className="absolute bottom-3 right-3 text-slate-600" />
            </div>
          </section>
        </div>

        {/* Footer Actions - Fixed at bottom */}
        <div className="p-4 border-t border-white/10 bg-[#050608] shrink-0 z-20 relative">
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex-1" 
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button 
              variant="glow" 
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={isGenerating}
              icon={!isGenerating ? <Play size={14} /> : undefined}
              className="flex-[2] bg-gradient-to-r from-memento-accent-blue to-blue-500 hover:from-blue-400 hover:to-blue-600 border-none shadow-[0_0_20px_rgba(96,165,250,0.4)] hover:shadow-[0_0_30px_rgba(96,165,250,0.6)] transition-all duration-300 font-semibold"
            >
              {isGenerating ? 'Generating Quiz...' : 'Start Quiz'}
            </Button>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
};
