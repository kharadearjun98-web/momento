import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, Search, ChevronUp, ChevronDown, Check, Download, FileText, Loader } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase/client';
import { Source } from '../types';

interface SourceViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceId: string;
    initialHighlight?: string;
    citationNumber?: number;
}

export const SourceViewerModal: React.FC<SourceViewerModalProps> = ({
    isOpen,
    onClose,
    sourceId,
    initialHighlight,
    citationNumber
}) => {
    const [source, setSource] = useState<Source | null>(null);
    const [content, setContent] = useState<string>('');
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load source metadata and content
    useEffect(() => {
        if (!isOpen || !sourceId) return;

        const fetchSourceData = async () => {
            setIsLoading(true);
            setError(null);
            setFileUrl(null);
            try {
                // 1. Fetch metadata
                const { data: sourceData, error: sourceError } = await supabase
                    .from('sources')
                    .select('*')
                    .eq('id', sourceId)
                    .single();

                if (sourceError) throw sourceError;
                setSource(sourceData as unknown as Source);

                // 2. Get file URL if available (for PDF view)
                if (sourceData.file_path) {
                    const { data: urlData } = supabase.storage
                        .from('documents')
                        .getPublicUrl(sourceData.file_path);

                    if (urlData?.publicUrl) {
                        // Verify if the URL is accessible (HEAD request)
                        try {
                            const check = await fetch(urlData.publicUrl, { method: 'HEAD' });
                            if (check.ok) {
                                setFileUrl(urlData.publicUrl);
                            } else {
                                console.warn('PDF URL not accessible, falling back to text:', urlData.publicUrl);
                            }
                        } catch (e) {
                            console.warn('Error checking PDF URL:', e);
                        }
                    }
                }

                // 3. Fetch text content (as fallback or for simple text sources)
                let fullText = sourceData.content;

                if (!fullText) {
                    const { data: chunks, error: chunksError } = await supabase
                        .from('document_chunks')
                        .select('content, chunk_index')
                        .eq('source_id', sourceId)
                        .order('chunk_index', { ascending: true });

                    if (chunks && chunks.length > 0) {
                        fullText = chunks.map(c => c.content).join('\n\n');
                    } else {
                        fullText = "No text content available for this source.";
                    }
                }

                setContent(fullText);

            } catch (err) {
                console.error('Error fetching source:', err);
                setError('Failed to load source content.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSourceData();
    }, [isOpen, sourceId]);

    // Handle highlighting
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Only do text scrolling if we are NOT in PDF mode
        const isPdf = source?.type === 'pdf' && fileUrl;
        if (!isPdf && !isLoading && content && initialHighlight && contentRef.current) {
            setTimeout(() => {
                const highlightEl = document.getElementById('highlight-target');
                if (highlightEl) {
                    highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 500);
        }
    }, [isLoading, content, initialHighlight, source, fileUrl]);

    if (!isOpen) return null;

    // Helper to render content with highlight
    const renderContent = () => {
        // Native PDF View
        if (source?.type === 'pdf' && fileUrl) {
            // Chrome/Edge/Firefox support #search="term" parameter for highlighting
            // We use the initialHighlight as the search term
            const pdfSrc = initialHighlight
                ? `${fileUrl}#search=${encodeURIComponent(initialHighlight)}`
                : fileUrl;

            return (
                <div className="w-full h-full bg-[#3e3e3e]">
                    <iframe
                        src={pdfSrc}
                        className="w-full h-full border-none"
                        title="PDF Viewer"
                    />
                </div>
            );
        }

        // Text View (Fallback)
        if (!content) return null;
        if (!initialHighlight) return <div className="whitespace-pre-wrap text-slate-300 leading-relaxed max-w-none">{content}</div>;

        // Split content by the highlight text
        // Normalize newlines/spaces for better matching
        const normalizedContent = content.replace(/\r\n/g, '\n');
        const normalizedHighlight = initialHighlight.replace(/\r\n/g, '\n').trim();

        // Find index
        const index = normalizedContent.indexOf(normalizedHighlight);

        if (index === -1) {
            // Fallback: try to match just the first 50 chars if exact match fails
            const partialHighlight = normalizedHighlight.substring(0, Math.min(50, normalizedHighlight.length));
            const partialIndex = normalizedContent.indexOf(partialHighlight);

            if (partialIndex !== -1) {
                const before = normalizedContent.substring(0, partialIndex);
                const match = normalizedContent.substring(partialIndex, partialIndex + normalizedHighlight.length); // Approximation
                const after = normalizedContent.substring(partialIndex + normalizedHighlight.length);

                return (
                    <div className="whitespace-pre-wrap text-slate-300 leading-relaxed max-w-none">
                        {before}
                        <span id="highlight-target" className="bg-memento-purple-500/30 text-white px-1 py-0.5 rounded border-b-2 border-memento-purple-500 animate-pulse">
                            {match}
                        </span>
                        {after}
                    </div>
                );
            }

            return <div className="whitespace-pre-wrap text-slate-300 leading-relaxed max-w-none">{content}</div>;
        }

        const before = normalizedContent.substring(0, index);
        const match = normalizedContent.substring(index, index + normalizedHighlight.length);
        const after = normalizedContent.substring(index + normalizedHighlight.length);

        return (
            <div className="whitespace-pre-wrap text-slate-300 leading-relaxed max-w-none">
                {before}
                <span id="highlight-target" className="bg-memento-purple-500/30 text-white px-1 py-0.5 rounded border-b-2 border-memento-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    {match}
                </span>
                {after}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-full max-w-4xl h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <GlassPanel className="h-full flex flex-col overflow-hidden shadow-2xl border-white/10" intensity="high">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-memento-purple-500/20 flex items-center justify-center text-memento-purple-300">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    {citationNumber && <span className="text-memento-accent-cyan text-sm px-2 py-0.5 bg-memento-accent-cyan/10 rounded-full">[{citationNumber}]</span>}
                                    {source?.title || 'Loading Source...'}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    {source?.type && <span className="uppercase tracking-wider">{source.type}</span>}
                                    {source?.date && <span>• {new Date(source.date).toLocaleDateString()}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-8 h-8 p-0">
                                <X size={20} />
                            </Button>
                        </div>
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-[#0B0E13] relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-4">
                                    <Loader className="animate-spin text-memento-purple-400" size={32} />
                                    <p className="text-slate-500 text-sm">Loading content...</p>
                                </div>
                            </div>
                        ) : error ? (
                            <div className="absolute inset-0 flex items-center justify-center text-rose-400">
                                {error}
                            </div>
                        ) : (
                            <div ref={contentRef} className="prose prose-invert max-w-none">
                                {renderContent()}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-slate-500">
                        <div>
                            {initialHighlight && "Highlighting cited section"}
                        </div>
                        <div className="flex items-center gap-4">
                            Scroll to read context
                        </div>
                    </div>
                </GlassPanel>
            </div>
        </div>
    );
};
