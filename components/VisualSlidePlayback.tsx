/**
 * Visual Slide Playback Component
 * NotebookLM-style educational slides with FLUX visuals, KaTeX formulas,
 * and synchronized audio narration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight,
    Maximize2, Minimize2, RotateCcw, Presentation, BookOpen
} from 'lucide-react';
import { VisualSlide, VisualStyle, formatDuration } from '../lib/visualSlideGenerator';
import { renderMarkdown } from '../lib/markdownRenderer';
import 'katex/dist/katex.min.css';

// ============================================================================
// TYPES
// ============================================================================

interface VisualSlidePlaybackProps {
    isOpen: boolean;
    onClose: () => void;
    slides: VisualSlide[];
    audioUrl?: string;
    slideTimings: { slideId: string; startMs: number; endMs: number }[];
    title: string;
    style: VisualStyle;
}

// ============================================================================
// VISUAL ICONS (SVG Fallback)
// ============================================================================

const VisualIcons: Record<string, React.FC<{ className?: string }>> = {
    brain: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M32 8c-8 0-14 6-14 14 0 4 2 8 4 10-2 2-4 6-4 10 0 8 6 14 14 14s14-6 14-14c0-4-2-8-4-10 2-2 4-6 4-10 0-8-6-14-14-14z" />
            <path d="M32 8v48M18 22h28M18 42h28" strokeDasharray="4 2" />
        </svg>
    ),
    book: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12h20c4 0 4 4 4 4v36s0-4-4-4H8V12z" />
            <path d="M56 12H36c-4 0-4 4-4 4v36s0-4 4-4h20V12z" />
            <path d="M12 20h12M12 28h12M12 36h8" strokeDasharray="2 2" />
        </svg>
    ),
    lightbulb: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="32" cy="24" r="14" />
            <path d="M24 38h16M26 46h12M28 54h8" />
            <path d="M32 10V6M48 24h4M12 24H8M44 12l3-3M20 12l-3-3" strokeDasharray="2 2" />
        </svg>
    ),
    gears: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="24" cy="32" r="10" />
            <circle cx="44" cy="24" r="8" />
            <path d="M24 22v-6M24 42v6M14 32H8M40 32h-6M34 24h4M50 16l4-4" strokeDasharray="2 2" />
        </svg>
    ),
    magnifier: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="28" cy="28" r="16" />
            <path d="M40 40l16 16" strokeLinecap="round" />
        </svg>
    ),
    database: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="32" cy="16" rx="20" ry="8" />
            <path d="M12 16v32c0 4 9 8 20 8s20-4 20-8V16" />
            <path d="M12 32c0 4 9 8 20 8s20-4 20-8" strokeDasharray="4 2" />
        </svg>
    ),
    arrows: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 32h40M40 24l8 8-8 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M32 8v40M24 40l8 8 8-8" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />
        </svg>
    ),
    network: ({ className }) => (
        <svg className={className} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="32" cy="16" r="6" />
            <circle cx="16" cy="48" r="6" />
            <circle cx="48" cy="48" r="6" />
            <path d="M32 22v10M26 38L18 44M38 38l8 6" strokeDasharray="4 2" />
        </svg>
    ),
};

// ============================================================================
// SLIDE RENDERER
// ============================================================================

const SlideRenderer: React.FC<{ slide: VisualSlide; style: VisualStyle }> = ({ slide, style }) => {
    // Style-based themes matching NotebookLM aesthetic
    const themes = {
        illustrated: {
            bg: 'bg-[#FEF9E7]',
            title: 'text-[#1a1a1a]',
            subtitle: 'text-[#666]',
            content: 'text-[#333]',
            accent: 'bg-[#F4D03F]',
            iconColor: 'text-[#8B7355]',
            formulaBg: 'bg-[#FFF8DC]',
        },
        minimalist: {
            bg: 'bg-white',
            title: 'text-gray-900',
            subtitle: 'text-gray-600',
            content: 'text-gray-700',
            accent: 'bg-indigo-500',
            iconColor: 'text-indigo-400',
            formulaBg: 'bg-gray-50',
        },
        technical: {
            bg: 'bg-[#0a192f]',
            title: 'text-[#64ffda]',
            subtitle: 'text-[#8892b0]',
            content: 'text-[#ccd6f6]',
            accent: 'bg-[#64ffda]',
            iconColor: 'text-[#64ffda]',
            formulaBg: 'bg-[#112240]',
        },
    };

    const theme = themes[style] || themes.illustrated;

    // Render visual elements (icons)
    const renderIcons = () => {
        if (!slide.visualElements || slide.visualElements.length === 0) return null;

        return (
            <div className="absolute top-4 right-4 flex gap-2">
                {slide.visualElements.slice(0, 3).map((element, idx) => {
                    const IconComponent = VisualIcons[element.toLowerCase()];
                    if (!IconComponent) return null;
                    return (
                        <div
                            key={idx}
                            className={`w-12 h-12 rounded-full bg-white/80 shadow-md flex items-center justify-center ${theme.iconColor}`}
                        >
                            <IconComponent className="w-6 h-6" />
                        </div>
                    );
                })}
            </div>
        );
    };

    // Render based on slide type
    const renderSlideContent = () => {
        switch (slide.type) {
            case 'title':
                return (
                    <div className="h-full flex flex-col items-center justify-center text-center px-12 relative">
                        {renderIcons()}
                        {slide.imageBase64 && (
                            <div className="absolute inset-0 opacity-20">
                                <img src={slide.imageBase64} alt="" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <div className="relative z-10">
                            <Presentation className={`w-16 h-16 ${theme.iconColor} mb-6 opacity-50`} />
                            <h1 className={`text-5xl font-bold ${theme.title} mb-4`}>{slide.title}</h1>
                            {slide.subtitle && (
                                <p className={`text-2xl ${theme.subtitle}`}>{slide.subtitle}</p>
                            )}
                        </div>
                    </div>
                );

            case 'formula':
                return (
                    <div className="h-full flex flex-col p-8 relative">
                        {renderIcons()}
                        <div className="flex-1 flex flex-col md:flex-row gap-6">
                            {/* Visual side */}
                            <div className="md:w-1/2 flex items-center justify-center">
                                {slide.imageBase64 ? (
                                    <img
                                        src={slide.imageBase64}
                                        alt={slide.title}
                                        className="max-w-full max-h-[300px] object-contain rounded-xl shadow-lg"
                                    />
                                ) : (
                                    <div className={`w-48 h-48 ${theme.formulaBg} rounded-full flex items-center justify-center`}>
                                        <VisualIcons.lightbulb className={`w-24 h-24 ${theme.iconColor}`} />
                                    </div>
                                )}
                            </div>

                            {/* Formula side */}
                            <div className="md:w-1/2 flex flex-col justify-center">
                                <h2 className={`text-3xl font-bold ${theme.title} mb-4`}>{slide.title}</h2>
                                {slide.formula && (
                                    <div className={`${theme.formulaBg} p-6 rounded-xl mb-4`}>
                                        <div
                                            className={`text-2xl ${theme.content} [&_.katex]:text-3xl`}
                                            dangerouslySetInnerHTML={{ __html: renderMarkdown(`$$${slide.formula}$$`) }}
                                        />
                                    </div>
                                )}
                                {slide.content && (
                                    <div
                                        className={`${theme.content} prose prose-lg max-w-none`}
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(slide.content) }}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );

            case 'comparison':
                return (
                    <div className="h-full flex flex-col p-8 relative">
                        {renderIcons()}
                        <h2 className={`text-3xl font-bold ${theme.title} text-center mb-6`}>{slide.title}</h2>
                        <div className="flex-1 grid grid-cols-2 gap-6">
                            {slide.bullets?.slice(0, 2).map((bullet, idx) => (
                                <div
                                    key={idx}
                                    className={`p-6 rounded-2xl ${idx === 0 ? 'bg-red-100/50' : 'bg-green-100/50'} flex flex-col items-center justify-center text-center`}
                                >
                                    <div className="w-16 h-16 rounded-full bg-white/80 shadow-md flex items-center justify-center mb-4">
                                        {idx === 0 ? (
                                            <X className="w-8 h-8 text-red-500" />
                                        ) : (
                                            <BookOpen className="w-8 h-8 text-green-500" />
                                        )}
                                    </div>
                                    <p className={`text-lg ${theme.content}`}>{bullet}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case 'flow':
                return (
                    <div className="h-full flex flex-col p-8 relative">
                        {renderIcons()}
                        <h2 className={`text-3xl font-bold ${theme.title} text-center mb-6`}>{slide.title}</h2>
                        <div className="flex-1 flex items-center justify-center">
                            {slide.imageBase64 ? (
                                <img
                                    src={slide.imageBase64}
                                    alt={slide.title}
                                    className="max-w-full max-h-[400px] object-contain rounded-xl shadow-lg"
                                />
                            ) : (
                                <div className="flex items-center gap-4 overflow-x-auto pb-4">
                                    {slide.bullets?.map((step, idx) => (
                                        <React.Fragment key={idx}>
                                            <div className={`flex flex-col items-center p-4 ${theme.formulaBg} rounded-xl min-w-[150px]`}>
                                                <div className={`w-10 h-10 rounded-full ${theme.accent} text-white flex items-center justify-center font-bold mb-2`}>
                                                    {idx + 1}
                                                </div>
                                                <p className={`text-sm ${theme.content} text-center`}>{step}</p>
                                            </div>
                                            {idx < (slide.bullets?.length || 0) - 1 && (
                                                <VisualIcons.arrows className={`w-8 h-8 ${theme.iconColor}`} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'summary':
                return (
                    <div className="h-full flex flex-col p-8 relative">
                        {renderIcons()}
                        <h2 className={`text-3xl font-bold ${theme.title} text-center mb-6`}>{slide.title}</h2>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {slide.bullets?.map((point, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 p-4 ${theme.formulaBg} rounded-xl`}
                                >
                                    <span className={`w-8 h-8 flex items-center justify-center rounded-full ${theme.accent} text-white text-sm font-bold shrink-0`}>
                                        ✓
                                    </span>
                                    <span className={`text-lg ${theme.content}`}>{point}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );

            case 'concept':
            default:
                return (
                    <div className="h-full flex flex-col md:flex-row p-8 relative">
                        {renderIcons()}

                        {/* Content side */}
                        <div className={`${slide.imageBase64 ? 'md:w-1/2' : 'w-full'} flex flex-col justify-center pr-4`}>
                            <h2 className={`text-3xl font-bold ${theme.title} mb-4`}>{slide.title}</h2>
                            {slide.subtitle && (
                                <p className={`text-lg ${theme.subtitle} mb-4`}>{slide.subtitle}</p>
                            )}
                            {slide.content && (
                                <div
                                    className={`${theme.content} prose prose-lg max-w-none mb-4 [&_.katex]:${theme.content}`}
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(slide.content) }}
                                />
                            )}
                            {slide.bullets && slide.bullets.length > 0 && (
                                <ul className="space-y-2">
                                    {slide.bullets.map((bullet, idx) => (
                                        <li key={idx} className="flex items-start gap-3">
                                            <span className={`w-2 h-2 rounded-full ${theme.accent} mt-2 shrink-0`} />
                                            <span className={`text-lg ${theme.content}`}>{bullet}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Image side */}
                        {slide.imageBase64 && (
                            <div className="md:w-1/2 flex items-center justify-center mt-4 md:mt-0">
                                <img
                                    src={slide.imageBase64}
                                    alt={slide.title}
                                    className="max-w-full max-h-[400px] object-contain rounded-xl shadow-lg"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className={`w-full h-full ${theme.bg} overflow-hidden relative`}>
            {/* Grid background for illustrated style */}
            {style === 'illustrated' && (
                <div
                    className="absolute inset-0 opacity-30 pointer-events-none"
                    style={{
                        backgroundImage: `
              linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px)
            `,
                        backgroundSize: '20px 20px',
                    }}
                />
            )}
            <div className="relative z-10 h-full">
                {renderSlideContent()}
            </div>
        </div>
    );
};

// ============================================================================
// MAIN PLAYBACK COMPONENT
// ============================================================================

export const VisualSlidePlayback: React.FC<VisualSlidePlaybackProps> = ({
    isOpen,
    onClose,
    slides,
    audioUrl,
    slideTimings,
    title,
    style,
}) => {
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const audioRef = useRef<HTMLAudioElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null);

    const currentSlide = slides[currentSlideIndex];

    // Find current slide based on audio time
    const findSlideAtTime = useCallback((timeMs: number) => {
        for (let i = slideTimings.length - 1; i >= 0; i--) {
            if (timeMs >= slideTimings[i].startMs) {
                return i;
            }
        }
        return 0;
    }, [slideTimings]);

    // Audio time update handler
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioUrl) return;

        const handleTimeUpdate = () => {
            const timeMs = audio.currentTime * 1000;
            setCurrentTime(timeMs);

            const slideIndex = findSlideAtTime(timeMs);
            if (slideIndex !== currentSlideIndex) {
                setCurrentSlideIndex(slideIndex);
            }
        };

        const handleLoadedMetadata = () => {
            setDuration(audio.duration * 1000);
        };

        const handleEnded = () => {
            setIsPlaying(false);
            setCurrentSlideIndex(0);
            setCurrentTime(0);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('ended', handleEnded);

        return () => {
            audio.removeEventListener('timeupdate', handleTimeUpdate);
            audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audio.removeEventListener('ended', handleEnded);
        };
    }, [audioUrl, currentSlideIndex, findSlideAtTime]);

    // Auto-advance slides when no audio
    useEffect(() => {
        if (!audioUrl && isPlaying) {
            const currentTiming = slideTimings[currentSlideIndex];
            const slideDuration = currentTiming ? currentTiming.endMs - currentTiming.startMs : 5000;

            autoAdvanceRef.current = setTimeout(() => {
                if (currentSlideIndex < slides.length - 1) {
                    setCurrentSlideIndex(prev => prev + 1);
                    setCurrentTime(slideTimings[currentSlideIndex + 1]?.startMs || 0);
                } else {
                    setIsPlaying(false);
                    setCurrentSlideIndex(0);
                    setCurrentTime(0);
                }
            }, slideDuration);

            return () => {
                if (autoAdvanceRef.current) {
                    clearTimeout(autoAdvanceRef.current);
                }
            };
        }
    }, [audioUrl, isPlaying, currentSlideIndex, slides.length, slideTimings]);

    // Calculate total duration
    useEffect(() => {
        if (!audioUrl && slideTimings.length > 0) {
            const lastTiming = slideTimings[slideTimings.length - 1];
            setDuration(lastTiming.endMs);
        }
    }, [audioUrl, slideTimings]);

    // Play/Pause toggle
    const togglePlayPause = () => {
        if (audioUrl && audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
        }
        setIsPlaying(!isPlaying);
    };

    // Mute toggle
    const toggleMute = () => {
        if (audioRef.current) {
            audioRef.current.muted = !isMuted;
        }
        setIsMuted(!isMuted);
    };

    // Navigate slides
    const goToSlide = (index: number) => {
        if (index < 0 || index >= slides.length) return;

        setCurrentSlideIndex(index);

        if (audioRef.current && slideTimings[index]) {
            audioRef.current.currentTime = slideTimings[index].startMs / 1000;
            setCurrentTime(slideTimings[index].startMs);
        } else {
            setCurrentTime(slideTimings[index]?.startMs || 0);
        }
    };

    // Progress bar click handler
    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = progressRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const percentage = x / rect.width;
        const newTime = percentage * duration;

        if (audioRef.current) {
            audioRef.current.currentTime = newTime / 1000;
        }
        setCurrentTime(newTime);
    };

    // Fullscreen toggle
    const toggleFullscreen = () => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;

            switch (e.key) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    goToSlide(currentSlideIndex - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    goToSlide(currentSlideIndex + 1);
                    break;
                case 'm':
                    toggleMute();
                    break;
                case 'f':
                    toggleFullscreen();
                    break;
                case 'Escape':
                    if (isFullscreen) {
                        document.exitFullscreen();
                        setIsFullscreen(false);
                    } else {
                        onClose();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isPlaying, currentSlideIndex, isFullscreen]);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setCurrentSlideIndex(0);
            setCurrentTime(0);
            setIsPlaying(false);
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
            }
        }
    }, [isOpen]);

    // Restart handler
    const handleRestart = () => {
        setCurrentSlideIndex(0);
        setCurrentTime(0);
        if (audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
        }
        setIsPlaying(true);
    };

    if (!isOpen) return null;

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-black flex flex-col"
        >
            {/* Hidden audio element */}
            {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                    >
                        <X size={20} />
                    </button>
                    <div>
                        <h1 className="text-white font-semibold">{title}</h1>
                        <p className="text-white/60 text-sm">
                            Slide {currentSlideIndex + 1} of {slides.length}
                        </p>
                    </div>
                </div>

                <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                >
                    {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>
            </div>

            {/* Main slide area */}
            <div className="flex-1 flex items-center justify-center p-8 pt-20 pb-32">
                <div
                    className="w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10"
                    style={{ maxHeight: 'calc(100vh - 200px)' }}
                >
                    <SlideRenderer slide={currentSlide} style={style} />
                </div>
            </div>

            {/* Navigation arrows */}
            <button
                onClick={() => goToSlide(currentSlideIndex - 1)}
                disabled={currentSlideIndex === 0}
                className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white ${currentSlideIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''
                    }`}
            >
                <ChevronLeft size={24} />
            </button>

            <button
                onClick={() => goToSlide(currentSlideIndex + 1)}
                disabled={currentSlideIndex === slides.length - 1}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white ${currentSlideIndex === slides.length - 1 ? 'opacity-30 cursor-not-allowed' : ''
                    }`}
            >
                <ChevronRight size={24} />
            </button>

            {/* Controls bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                {/* Progress bar */}
                <div
                    ref={progressRef}
                    onClick={handleProgressClick}
                    className="h-1 bg-white/20 rounded-full mb-4 cursor-pointer group"
                >
                    <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full relative transition-all"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Slide markers */}
                    {slideTimings.map((timing, idx) => (
                        <div
                            key={timing.slideId}
                            className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full transition-colors ${idx <= currentSlideIndex ? 'bg-amber-400' : 'bg-white/30'
                                }`}
                            style={{ left: `${(timing.startMs / duration) * 100}%` }}
                        />
                    ))}
                </div>

                {/* Control buttons */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Play/Pause */}
                        <button
                            onClick={togglePlayPause}
                            className="p-3 rounded-full bg-white text-black hover:bg-white/90 transition-colors"
                        >
                            {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-0.5" />}
                        </button>

                        {/* Restart */}
                        <button
                            onClick={handleRestart}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                        >
                            <RotateCcw size={20} />
                        </button>

                        {/* Volume */}
                        {audioUrl && (
                            <button
                                onClick={toggleMute}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                            >
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        )}

                        {/* Time */}
                        <span className="text-white/80 text-sm font-mono">
                            {formatDuration(currentTime)} / {formatDuration(duration)}
                        </span>
                    </div>

                    {/* Slide thumbnails */}
                    <div className="flex items-center gap-1 overflow-x-auto max-w-md">
                        {slides.map((slide, idx) => (
                            <button
                                key={slide.id}
                                onClick={() => goToSlide(idx)}
                                className={`w-12 h-8 rounded border-2 transition-all shrink-0 ${idx === currentSlideIndex
                                        ? 'border-amber-400 scale-110'
                                        : 'border-white/20 opacity-60 hover:opacity-100'
                                    }`}
                                title={slide.title}
                            >
                                <div className="w-full h-full bg-white/10 rounded-sm flex items-center justify-center text-[8px] text-white/60">
                                    {idx + 1}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="absolute bottom-20 left-4 text-white/40 text-xs">
                Space: Play/Pause • ←→: Navigate • M: Mute • F: Fullscreen • Esc: Close
            </div>
        </div>
    );
};

export default VisualSlidePlayback;
