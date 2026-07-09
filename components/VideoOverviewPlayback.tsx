import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight,
  Maximize2, Minimize2, Download, RotateCcw
} from 'lucide-react';
import { Slide } from '../lib/slideGenerator';
import mermaid from 'mermaid';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  flowchart: {
    htmlLabels: false,
  },
});

// ============================================================================
// TYPES
// ============================================================================

interface VideoOverviewPlaybackProps {
  isOpen: boolean;
  onClose: () => void;
  video: {
    id: string;
    title: string;
    slides: Slide[];
    audioUrl: string;
    audioDuration: number;
    slideTimings: { slideId: string; startMs: number; endMs: number }[];
    metadata: {
      format: string;
      style: string;
      slideCount: number;
    };
  };
}

// ============================================================================
// MERMAID DIAGRAM COMPONENT
// ============================================================================

const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) return;

      try {
        const id = `mermaid-slide-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        setSvg(svg);
        setError(null);
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError('Failed to render diagram');
      }
    };

    renderDiagram();
  }, [code]);

  if (error) {
    return (
      <div className="text-center text-red-400 p-4">
        <p>{error}</p>
        <pre className="text-xs text-left mt-2 bg-gray-800 p-2 rounded overflow-auto max-h-32">
          {code}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="text-gray-400">Loading diagram...</div>;
  }

  const srcDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; background: transparent; }
    body { display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${svg}</body>
</html>`;

  return (
    <div
      ref={containerRef}
      className="max-w-full max-h-full overflow-auto bg-white rounded-lg p-4"
    >
      <iframe
        title="Mermaid diagram"
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full min-h-[320px] border-0 bg-transparent"
      />
    </div>
  );
};

// ============================================================================
// SLIDE RENDERER COMPONENT
// ============================================================================

const SlideRenderer: React.FC<{ slide: Slide; style: string }> = ({ slide, style }) => {
  // Style-based color themes
  const themes = {
    minimalist: {
      bg: 'bg-white',
      title: 'text-gray-900',
      subtitle: 'text-gray-600',
      bullet: 'text-gray-700',
      accent: 'bg-purple-500',
    },
    illustrated: {
      bg: 'bg-[#FEF9E7]', // Warm cream like NotebookLM
      title: 'text-[#1a1a1a]',
      subtitle: 'text-[#666]',
      bullet: 'text-[#333]',
      accent: 'bg-[#F4D03F]',
    },
    technical: {
      bg: 'bg-[#0a192f]',
      title: 'text-[#64ffda]',
      subtitle: 'text-[#8892b0]',
      bullet: 'text-[#ccd6f6]',
      accent: 'bg-[#64ffda]',
    },
    corporate: {
      bg: 'bg-gradient-to-br from-slate-50 to-blue-50',
      title: 'text-slate-900',
      subtitle: 'text-blue-600',
      bullet: 'text-slate-700',
      accent: 'bg-blue-500',
    },
  };

  const theme = themes[style as keyof typeof themes] || themes.illustrated;

  // Render based on slide type
  const renderSlideContent = () => {
    switch (slide.type) {
      case 'title':
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-12">
            <h1 className={`text-5xl font-bold ${theme.title} mb-4`}>{slide.title}</h1>
            {slide.subtitle && (
              <p className={`text-2xl ${theme.subtitle}`}>{slide.subtitle}</p>
            )}
          </div>
        );

      case 'section':
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-12">
            <div className={`w-20 h-1 ${theme.accent} rounded mb-6`} />
            <h2 className={`text-4xl font-bold ${theme.title}`}>{slide.title}</h2>
            {slide.subtitle && (
              <p className={`text-xl mt-4 ${theme.subtitle}`}>{slide.subtitle}</p>
            )}
          </div>
        );

      case 'comparison':
        return (
          <div className="h-full flex flex-col p-8">
            <h2 className={`text-3xl font-bold ${theme.title} text-center mb-8`}>{slide.title}</h2>
            <div className="flex-1 grid grid-cols-2 gap-6">
              {slide.bullets?.slice(0, 2).map((bullet, idx) => (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl ${idx === 0 ? 'bg-red-100/50' : 'bg-green-100/50'}`}
                >
                  <p className={`text-lg ${theme.bullet}`}>{bullet}</p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'quote':
        return (
          <div className="h-full flex flex-col items-center justify-center text-center px-16">
            <div className="text-6xl text-gray-300 mb-4">"</div>
            <blockquote className={`text-2xl italic ${theme.title} leading-relaxed`}>
              {slide.bullets?.[0] || slide.title}
            </blockquote>
            <div className="text-6xl text-gray-300 mt-4 rotate-180">"</div>
          </div>
        );

      case 'stats':
        return (
          <div className="h-full flex flex-col p-8">
            <h2 className={`text-3xl font-bold ${theme.title} text-center mb-8`}>{slide.title}</h2>
            <div className="flex-1 grid grid-cols-3 gap-4">
              {slide.bullets?.slice(0, 3).map((stat, idx) => (
                <div key={idx} className="flex flex-col items-center justify-center">
                  <div className={`text-4xl font-bold ${theme.title}`}>
                    {stat.match(/\d+/)?.[0] || '—'}
                  </div>
                  <p className={`text-sm ${theme.subtitle} text-center mt-2`}>
                    {stat.replace(/\d+/g, '').trim()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );

      case 'summary':
        return (
          <div className="h-full flex flex-col p-8">
            <h2 className={`text-3xl font-bold ${theme.title} text-center mb-6`}>{slide.title}</h2>
            <div className="flex-1 flex flex-col justify-center">
              <ul className="space-y-4">
                {slide.bullets?.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full ${theme.accent} text-white text-sm font-bold shrink-0`}>
                      {idx + 1}
                    </span>
                    <span className={`text-lg ${theme.bullet}`}>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 'content':
      default:
        // Get image source - prefer imageBase64 over imageUrl
        const imageSource = slide.imageBase64 || slide.imageUrl;
        return (
          <div className="h-full flex">
            {/* Content side */}
            <div className={`${imageSource ? 'w-1/2' : 'w-full'} p-8 flex flex-col`}>
              <h2 className={`text-3xl font-bold ${theme.title} mb-6`}>{slide.title}</h2>
              {slide.subtitle && (
                <p className={`text-lg ${theme.subtitle} mb-4`}>{slide.subtitle}</p>
              )}
              {slide.bullets && slide.bullets.length > 0 && (
                <ul className="space-y-3 flex-1">
                  {slide.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className={`w-2 h-2 rounded-full ${theme.accent} mt-2 shrink-0`} />
                      <span className={`text-lg ${theme.bullet}`}>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Image side */}
            {imageSource ? (
              <div className="w-1/2 p-4 flex items-center justify-center">
                <img
                  src={imageSource}
                  alt={slide.title}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg bg-white border border-gray-200"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            ) : null}
          </div>
        );

      case 'diagram':
        // Get diagram image source
        const diagramImageSource = slide.imageBase64 || slide.imageUrl;
        return (
          <div className="h-full flex flex-col p-8">
            <h2 className={`text-3xl font-bold ${theme.title} text-center mb-6`}>{slide.title}</h2>
            <div className="flex-1 flex items-center justify-center">
              {/* If we have Mermaid code, render it */}
              {slide.mermaidCode ? (
                <MermaidDiagram code={slide.mermaidCode} />
              ) : diagramImageSource ? (
                <img
                  src={diagramImageSource}
                  alt={slide.title}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg bg-white border border-gray-200"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="text-center text-gray-400">
                  <p>Diagram visualization</p>
                </div>
              )}
            </div>
            {slide.bullets && slide.bullets.length > 0 && (
              <ul className="mt-4 space-y-2">
                {slide.bullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-center justify-center">
                    <span className={`text-base ${theme.bullet}`}>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
    }
  };

  return (
    <div className={`w-full h-full ${theme.bg} overflow-hidden relative`}>
      {/* Background pattern for illustrated style */}
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

      {/* Full-bleed image for slides without text content */}
      {slide.imageUrl && slide.type === 'title' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <img
            src={slide.imageUrl}
            alt=""
            className="max-w-[60%] max-h-[40%] object-contain opacity-50"
          />
        </div>
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

export const VideoOverviewPlayback: React.FC<VideoOverviewPlaybackProps> = ({
  isOpen,
  onClose,
  video,
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

  const currentSlide = video.slides[currentSlideIndex];

  // Format time as MM:SS
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Find current slide based on audio time
  const findSlideAtTime = useCallback((timeMs: number) => {
    for (let i = video.slideTimings.length - 1; i >= 0; i--) {
      if (timeMs >= video.slideTimings[i].startMs) {
        return i;
      }
    }
    return 0;
  }, [video.slideTimings]);

  // Audio time update handler
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      const timeMs = audio.currentTime * 1000;
      setCurrentTime(timeMs);

      // Auto-advance slides based on audio
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
  }, [currentSlideIndex, findSlideAtTime]);

  // Play/Pause toggle
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Mute toggle
  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Navigate slides
  const goToSlide = (index: number) => {
    if (index < 0 || index >= video.slides.length) return;

    setCurrentSlideIndex(index);

    // Seek audio to slide start time
    const audio = audioRef.current;
    if (audio && video.slideTimings[index]) {
      audio.currentTime = video.slideTimings[index].startMs / 1000;
      setCurrentTime(video.slideTimings[index].startMs);
    }
  };

  const goToPrevSlide = () => goToSlide(currentSlideIndex - 1);
  const goToNextSlide = () => goToSlide(currentSlideIndex + 1);

  // Progress bar click handler
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect || !audioRef.current) return;

    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime / 1000;
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
          goToPrevSlide();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNextSlide();
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
      setIsPlaying(true);
    }
  };

  if (!isOpen) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={video.audioUrl} preload="auto" />

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
            <h1 className="text-white font-semibold">{video.title}</h1>
            <p className="text-white/60 text-sm">
              Slide {currentSlideIndex + 1} of {video.slides.length}
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
          <SlideRenderer
            slide={currentSlide}
            style={video.metadata.style}
          />
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        onClick={goToPrevSlide}
        disabled={currentSlideIndex === 0}
        className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white ${currentSlideIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''
          }`}
      >
        <ChevronLeft size={24} />
      </button>

      <button
        onClick={goToNextSlide}
        disabled={currentSlideIndex === video.slides.length - 1}
        className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white ${currentSlideIndex === video.slides.length - 1 ? 'opacity-30 cursor-not-allowed' : ''
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
            className="h-full bg-purple-500 rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Slide markers */}
          {video.slideTimings.map((timing, idx) => (
            <div
              key={timing.slideId}
              className={`absolute top-1/2 -translate-y-1/2 w-1 h-3 rounded-full transition-colors ${idx <= currentSlideIndex ? 'bg-purple-400' : 'bg-white/30'
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
            <button
              onClick={toggleMute}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* Time */}
            <span className="text-white/80 text-sm font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          {/* Slide thumbnails */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-md">
            {video.slides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => goToSlide(idx)}
                className={`w-12 h-8 rounded border-2 transition-all shrink-0 ${idx === currentSlideIndex
                  ? 'border-purple-500 scale-110'
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

          {/* Download */}
          <a
            href={video.audioUrl}
            download={`${video.title}-audio.mp3`}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
            title="Download audio"
          >
            <Download size={20} />
          </a>
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-20 left-4 text-white/40 text-xs">
        Space: Play/Pause • ←→: Navigate • M: Mute • F: Fullscreen • Esc: Close
      </div>
    </div>
  );
};

export default VideoOverviewPlayback;
