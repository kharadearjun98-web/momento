import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, ArrowRight, ArrowLeft, Trophy, Brain, Sparkles, RotateCcw, Eye, EyeOff, Clock } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { GeneratedQuiz, QuizQuestion, QuizAnswer } from '../types';
import { validateQuizAnswers, saveQuizAttempt, loadQuizAttempt, clearQuizAttempt } from '../lib/quizGenerator';
import { renderMarkdown } from '../lib/markdownRenderer';
import 'katex/dist/katex.min.css';

interface QuizPlaybackProps {
  quiz: GeneratedQuiz;
  onClose: () => void;
}

export const QuizPlayback: React.FC<QuizPlaybackProps> = ({ quiz, onClose }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [shortAnswerInputs, setShortAnswerInputs] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizResults, setQuizResults] = useState<ReturnType<typeof validateQuizAnswers> | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [previousAttempt, setPreviousAttempt] = useState<{
    userAnswers: Record<string, string>;
    results: ReturnType<typeof validateQuizAnswers>;
    completedAt: string;
  } | null>(null);
  const [showPreviousResults, setShowPreviousResults] = useState(false);

  // Load previous attempt on mount
  useEffect(() => {
    const attempt = loadQuizAttempt(quiz.id);
    if (attempt) {
      setPreviousAttempt(attempt);
      // Show the previous results by default
      setUserAnswers(attempt.userAnswers);
      setQuizResults(attempt.results);
      setIsSubmitted(true);
      setShowPreviousResults(true);
      setShowExplanation(true);
    }
  }, [quiz.id]);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;
  const hasAnsweredCurrent = !!userAnswers[currentQuestion.id];
  const answeredCount = Object.keys(userAnswers).length;

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    if (hasAnsweredCurrent || isSubmitted) return;

    setUserAnswers(prev => ({
      ...prev,
      [questionId]: answerId,
    }));
    setShowExplanation(true);
  };

  const handleShortAnswerChange = (questionId: string, value: string) => {
    if (isSubmitted) return;
    setShortAnswerInputs(prev => ({
      ...prev,
      [questionId]: value,
    }));

    setUserAnswers(prev => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setShowExplanation(!!userAnswers[quiz.questions[currentQuestionIndex + 1].id]);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setShowExplanation(!!userAnswers[quiz.questions[currentQuestionIndex - 1].id]);
    }
  };

  const handleSubmit = () => {
    const results = validateQuizAnswers(quiz, userAnswers);
    setQuizResults(results);
    setIsSubmitted(true);
    setReviewMode(true);
    setShowPreviousResults(false);

    // Save the attempt for future reference
    saveQuizAttempt(quiz.id, userAnswers, results);
  };

  const handleTryAgain = () => {
    // Clear the saved attempt
    clearQuizAttempt(quiz.id);

    setUserAnswers({});
    setShortAnswerInputs({});
    setIsSubmitted(false);
    setShowExplanation(false);
    setQuizResults(null);
    setCurrentQuestionIndex(0);
    setReviewMode(false);
    setShowPreviousResults(false);
    setPreviousAttempt(null);
  };

  // Format the date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const goToQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setShowExplanation(!!userAnswers[quiz.questions[index].id] || isSubmitted);
  };

  const isCurrentQuestionCorrect = () => {
    if (!quizResults) return false;
    const result = quizResults.results.find(r => r.questionId === currentQuestion.id);
    return result?.correct || false;
  };

  const getQuestionStatus = (questionIndex: number) => {
    const question = quiz.questions[questionIndex];
    const answered = !!userAnswers[question.id];
    if (!isSubmitted) return answered ? 'answered' : 'unanswered';
    const result = quizResults?.results.find(r => r.questionId === question.id);
    return result?.correct ? 'correct' : 'incorrect';
  };

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
        <div className="p-4 border-b border-white/10 bg-gradient-to-r from-memento-accent-cyan/5 to-memento-accent-blue/5 shrink-0">
          {/* Top row - Title and Score */}
          <div className="flex items-start justify-between gap-4 mb-3">
            {/* Left side - Icon and Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-memento-accent-cyan/20 to-memento-accent-blue/20 flex items-center justify-center shrink-0">
                <Brain size={20} className="text-memento-accent-cyan" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-display font-semibold text-white truncate">{quiz.title}</h2>
                  {showPreviousResults && previousAttempt && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 rounded border border-amber-500/30 shrink-0">
                      Previous Results
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span>{quiz.questions.length} questions • {quiz.metadata?.difficulty || 'Medium'}</span>
                  {showPreviousResults && previousAttempt && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(previousAttempt.completedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right side - Score and Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Score Badge (when submitted) */}
              {isSubmitted && quizResults && (
                <>
                  {showPreviousResults && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTryAgain}
                      className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    >
                      <RotateCcw size={14} />
                      Try Again
                    </Button>
                  )}
                  <div className="px-3 py-1.5 bg-gradient-to-r from-memento-accent-cyan/20 to-memento-accent-blue/20 rounded-xl border border-memento-accent-cyan/30">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-xl font-bold text-memento-accent-cyan">{quizResults.score}/{quizResults.totalQuestions}</div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider">Score</div>
                      </div>
                      <div className="w-px h-6 bg-white/10" />
                      <div className="text-center">
                        <div className="text-xl font-bold text-white">{quizResults.percentage}%</div>
                        <div className="text-[9px] text-slate-400 uppercase tracking-wider">Accuracy</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Question Navigator */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {quiz.questions.map((_, idx) => {
              const status = getQuestionStatus(idx);
              const isCurrent = idx === currentQuestionIndex;
              return (
                <button
                  key={idx}
                  onClick={() => goToQuestion(idx)}
                  className={`shrink-0 w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-200 ${isCurrent
                      ? 'bg-memento-accent-cyan text-black ring-2 ring-memento-accent-cyan/50 ring-offset-2 ring-offset-[#0B0E13]'
                      : status === 'correct'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : status === 'incorrect'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : status === 'answered'
                            ? 'bg-memento-accent-blue/20 text-memento-accent-blue border border-memento-accent-blue/30'
                            : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ maxHeight: 'calc(90vh - 200px)' }}>
          {/* Question Type & Difficulty */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-memento-accent-cyan/10 text-memento-accent-cyan rounded-md">
              {currentQuestion.type.replace('-', ' ')}
            </span>
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-white/5 text-slate-400 rounded-md">
              {currentQuestion.difficulty}
            </span>
            {isSubmitted && (
              <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${isCurrentQuestionCorrect()
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
                }`}>
                {isCurrentQuestionCorrect() ? '✓ Correct' : '✗ Incorrect'}
              </span>
            )}
          </div>

          {/* Question Text */}
          <div
            className="text-xl font-semibold text-white leading-relaxed prose prose-invert max-w-none [&_p]:text-white [&_p]:m-0"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(currentQuestion.question) }}
          />

          {/* Answer Options */}
          <div className="space-y-3">
            {currentQuestion.type === 'short-answer' ? (
              <div className="space-y-3">
                <textarea
                  value={shortAnswerInputs[currentQuestion.id] || ''}
                  onChange={(e) => handleShortAnswerChange(currentQuestion.id, e.target.value)}
                  disabled={isSubmitted}
                  placeholder="Type your answer here..."
                  className="w-full h-32 bg-[#0B0E13] border border-white/10 rounded-xl p-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-cyan/50 focus:ring-2 focus:ring-memento-accent-cyan/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {isSubmitted && (
                  <div className={`p-4 rounded-xl border ${isCurrentQuestionCorrect()
                      ? 'bg-green-500/10 border-green-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                    }`}>
                    <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                      {isCurrentQuestionCorrect()
                        ? <><CheckCircle size={16} className="text-green-400" /><span className="text-green-400">Correct!</span></>
                        : <><XCircle size={16} className="text-red-400" /><span className="text-red-400">Not quite right</span></>
                      }
                    </div>
                    <p className="text-xs text-slate-300">
                      <span className="text-slate-500">Expected answer:</span> {currentQuestion.correctAnswer}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              (currentQuestion.answers || []).map((answer, idx) => {
                const isSelected = userAnswers[currentQuestion.id] === answer.id;
                const isCorrect = answer.id === currentQuestion.correctAnswer;
                const showResult = hasAnsweredCurrent || isSubmitted;

                let status = 'default';
                if (showResult) {
                  if (isCorrect) status = 'correct';
                  else if (isSelected) status = 'incorrect';
                }

                return (
                  <button
                    key={answer.id}
                    onClick={() => handleAnswerSelect(currentQuestion.id, answer.id)}
                    disabled={hasAnsweredCurrent || isSubmitted}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-200 border group ${status === 'correct'
                        ? 'bg-green-500/10 border-green-500/40 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                        : status === 'incorrect'
                          ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                          : isSelected
                            ? 'bg-memento-accent-cyan/10 border-memento-accent-cyan/40'
                            : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20'
                      } disabled:cursor-default`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all ${status === 'correct'
                          ? 'border-green-500 bg-green-500/20 text-green-400'
                          : status === 'incorrect'
                            ? 'border-red-500 bg-red-500/20 text-red-400'
                            : isSelected
                              ? 'border-memento-accent-cyan bg-memento-accent-cyan/20 text-memento-accent-cyan'
                              : 'border-white/30 text-slate-400 group-hover:border-white/50'
                        }`}>
                        {status === 'correct' && <CheckCircle size={16} />}
                        {status === 'incorrect' && <XCircle size={16} />}
                        {status === 'default' && String.fromCharCode(65 + idx)}
                      </div>
                      <div
                        className={`flex-1 text-sm leading-relaxed prose prose-invert max-w-none [&_p]:my-0 ${status === 'correct'
                            ? 'text-green-300 [&_p]:text-green-300'
                            : status === 'incorrect'
                              ? 'text-red-300 [&_p]:text-red-300'
                              : isSelected
                                ? 'text-white font-medium [&_p]:text-white'
                                : 'text-slate-300 group-hover:text-white [&_p]:text-slate-300 group-hover:[&_p]:text-white'
                          }`}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(answer.text) }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Explanation Panel */}
          {(hasAnsweredCurrent || isSubmitted) && currentQuestion.explanation && (
            <div className="p-5 bg-gradient-to-br from-memento-accent-blue/10 to-memento-purple-500/10 border border-memento-accent-blue/30 rounded-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-memento-accent-blue/20 flex items-center justify-center shrink-0">
                  <Sparkles size={16} className="text-memento-accent-blue" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-memento-accent-blue mb-2">Explanation</h4>
                  <div
                    className="text-sm text-slate-200 leading-relaxed prose prose-invert max-w-none [&_p]:text-slate-200 [&_p]:my-1"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(currentQuestion.explanation) }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/80 shrink-0">
          <div className="flex items-center gap-3">
            {/* Left side - navigation */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className="gap-2"
            >
              <ArrowLeft size={14} />
              Previous
            </Button>

            <div className="flex-1 flex items-center justify-center gap-2">
              {/* Progress indicator */}
              <span className="text-xs text-slate-400">
                {answeredCount} of {quiz.questions.length} answered
              </span>
            </div>

            {/* Right side - actions */}
            {isSubmitted ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTryAgain}
                  className="gap-2"
                >
                  <RotateCcw size={14} />
                  Try Again
                </Button>

                {!isLastQuestion && (
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={handleNext}
                    className="bg-memento-accent-cyan hover:bg-cyan-400 gap-2"
                  >
                    Next
                    <ArrowRight size={14} />
                  </Button>
                )}

                {isLastQuestion && (
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={onClose}
                    className="bg-memento-accent-cyan hover:bg-cyan-400 gap-2"
                  >
                    <Trophy size={14} />
                    Done
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowExplanation(!showExplanation)}
                  disabled={!hasAnsweredCurrent}
                  className="gap-2"
                >
                  {showExplanation ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showExplanation ? 'Hide' : 'Show'} Hint
                </Button>

                {isLastQuestion ? (
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={handleSubmit}
                    disabled={answeredCount !== quiz.questions.length}
                    className="bg-gradient-to-r from-memento-accent-cyan to-memento-accent-blue hover:opacity-90 gap-2"
                  >
                    <Trophy size={14} />
                    Submit Quiz
                  </Button>
                ) : (
                  <Button
                    variant="glow"
                    size="sm"
                    onClick={handleNext}
                    className="bg-memento-accent-blue hover:bg-blue-400 gap-2"
                  >
                    Next
                    <ArrowRight size={14} />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
