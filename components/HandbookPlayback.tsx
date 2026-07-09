import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    X, Download, Copy, Check, BookOpen,
    Printer, Hash, Layers, Eye, EyeOff,
    ZoomIn, ZoomOut, Clock, FileText, FileDown, Share2
} from 'lucide-react';
import { Button } from './ui/Button';
import { GeneratedHandbook } from '../types';
import { renderMarkdown } from '../lib/markdownRenderer';
import { MermaidDiagram, extractMermaidBlocks } from './MermaidDiagram';
import { downloadHandbookPDF } from '../lib/pdfGenerator';
import { generateStyledHTML, PDF_STYLE_PRESETS, PDF_STYLE_LIST, PDFDocumentStyle } from '../lib/pdfStyles';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import 'katex/dist/katex.min.css';
import toast from 'react-hot-toast';

interface HandbookPlaybackProps {
    handbook: GeneratedHandbook;
    onClose: () => void;
}

// Custom styles for handbook content
const handbookProseStyles = `
  /* Base typography */
  .handbook-prose {
    color: #e2e8f0;
    line-height: 1.75;
  }
  
  /* Headings */
  .handbook-prose h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #ffffff;
    margin-top: 0;
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid rgba(96, 165, 250, 0.3);
    letter-spacing: -0.025em;
  }
  
  .handbook-prose h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #f1f5f9;
    margin-top: 2.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .handbook-prose h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #e2e8f0;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
  }
  
  .handbook-prose h4 {
    font-size: 1.1rem;
    font-weight: 600;
    color: #cbd5e1;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }
  
  /* Paragraphs */
  .handbook-prose p {
    margin-bottom: 1rem;
    color: #cbd5e1;
  }
  
  /* Lists */
  .handbook-prose ul, .handbook-prose ol {
    margin: 1rem 0;
    padding-left: 1.5rem;
  }
  
  .handbook-prose li {
    margin-bottom: 0.5rem;
    color: #cbd5e1;
  }
  
  .handbook-prose li::marker {
    color: #60a5fa;
  }
  
  .handbook-prose ul li {
    list-style-type: disc;
  }
  
  .handbook-prose ol li {
    list-style-type: decimal;
  }
  
  /* Nested lists */
  .handbook-prose ul ul, .handbook-prose ol ol, .handbook-prose ul ol, .handbook-prose ol ul {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }
  
  /* Code */
  .handbook-prose code {
    background: rgba(96, 165, 250, 0.1);
    color: #93c5fd;
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: 'Fira Code', 'JetBrains Mono', monospace;
  }
  
  .handbook-prose pre {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 1rem;
    overflow-x: auto;
    margin: 1.5rem 0;
  }
  
  .handbook-prose pre code {
    background: transparent;
    padding: 0;
    color: #e2e8f0;
  }
  
  /* Tables */
  .handbook-prose table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
    font-size: 0.9rem;
  }
  
  .handbook-prose th {
    background: rgba(96, 165, 250, 0.1);
    color: #f1f5f9;
    font-weight: 600;
    text-align: left;
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .handbook-prose td {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
  }
  
  .handbook-prose tr:nth-child(even) td {
    background: rgba(255, 255, 255, 0.02);
  }
  
  /* Blockquotes */
  .handbook-prose blockquote {
    border-left: 4px solid #60a5fa;
    background: rgba(96, 165, 250, 0.05);
    padding: 1rem 1.5rem;
    margin: 1.5rem 0;
    border-radius: 0 0.5rem 0.5rem 0;
  }
  
  .handbook-prose blockquote p {
    color: #94a3b8;
    margin: 0;
    font-style: italic;
  }
  
  /* Links */
  .handbook-prose a {
    color: #60a5fa;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  
  .handbook-prose a:hover {
    color: #93c5fd;
  }
  
  /* Bold and emphasis */
  .handbook-prose strong {
    color: #f1f5f9;
    font-weight: 600;
  }
  
  .handbook-prose em {
    color: #cbd5e1;
    font-style: italic;
  }
  
  /* Horizontal rule */
  .handbook-prose hr {
    border: none;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
    margin: 2rem 0;
  }
  
  /* Images */
  .handbook-prose img {
    max-width: 100%;
    border-radius: 0.5rem;
    margin: 1.5rem 0;
  }
  
  /* Math/KaTeX formulas */
  .handbook-prose .katex {
    color: #00d9ff;
    font-size: 1.1em;
  }
  
  .handbook-prose .katex-display {
    margin: 1.5rem 0;
    padding: 1.25rem 1.5rem;
    background: linear-gradient(135deg, rgba(0, 217, 255, 0.08) 0%, rgba(96, 165, 250, 0.05) 100%);
    border: 1px solid rgba(0, 217, 255, 0.2);
    border-radius: 0.75rem;
    overflow-x: auto;
    text-align: center;
  }
  
  .handbook-prose .katex-display .katex {
    color: #00d9ff;
    font-size: 1.2em;
  }
  
  .handbook-prose .katex-html {
    overflow-x: auto;
    max-width: 100%;
    padding: 0.25rem 0;
  }
  
  /* Inline math styling */
  .handbook-prose p .katex:not(.katex-display .katex) {
    font-size: 1em;
    padding: 0 0.2rem;
  }
`;


// Component to render handbook content
const HandbookContent: React.FC<{ content: string }> = ({ content }) => {
    const { content: processedContent, blocks } = useMemo(() => {
        return extractMermaidBlocks(content);
    }, [content]);

    const renderedHtml = useMemo(() => {
        let html = renderMarkdown(processedContent);
        blocks.forEach((block, idx) => {
            html = html.replace(
                `__MERMAID_BLOCK_${idx}__`,
                `<div data-mermaid-placeholder="${idx}"></div>`
            );
        });
        return html;
    }, [processedContent, blocks]);

    return (
        <div className="handbook-prose">
            <style>{handbookProseStyles}</style>
            {blocks.length === 0 ? (
                <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
            ) : (
                <>
                    <div
                        dangerouslySetInnerHTML={{
                            __html: renderedHtml.split('<div data-mermaid-placeholder="0"></div>')[0]
                        }}
                    />
                    {blocks.map((block, idx) => {
                        const afterPlaceholder = renderedHtml.split(`<div data-mermaid-placeholder="${idx}"></div>`)[1] || '';
                        const nextPlaceholder = `<div data-mermaid-placeholder="${idx + 1}"></div>`;
                        const contentUntilNext = afterPlaceholder.includes(nextPlaceholder)
                            ? afterPlaceholder.split(nextPlaceholder)[0]
                            : (idx === blocks.length - 1 ? afterPlaceholder : '');

                        return (
                            <React.Fragment key={idx}>
                                <MermaidDiagram code={block.code} caption={block.caption} />
                                {contentUntilNext && (
                                    <div dangerouslySetInnerHTML={{ __html: contentUntilNext }} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </>
            )}
        </div>
    );
};

export const HandbookPlayback: React.FC<HandbookPlaybackProps> = ({ handbook, onClose }) => {
    const [showTableOfContents, setShowTableOfContents] = useState(true);
    const [activeSection, setActiveSection] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [fontSize, setFontSize] = useState(16);
    const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
    const [documentStyle, setDocumentStyle] = useState<PDFDocumentStyle>('report');
    const contentRef = useRef<HTMLDivElement>(null);

    // Track active section on scroll
    useEffect(() => {
        const handleScroll = () => {
            if (!contentRef.current) return;
            const headers = contentRef.current.querySelectorAll('h1, h2, h3');
            let currentSection: string | null = null;

            headers.forEach((header, idx) => {
                const rect = header.getBoundingClientRect();
                if (rect.top <= 150) {
                    currentSection = `section-${idx}`;
                }
            });

            setActiveSection(currentSection);
        };

        const contentElement = contentRef.current;
        if (contentElement) {
            contentElement.addEventListener('scroll', handleScroll);
            return () => contentElement.removeEventListener('scroll', handleScroll);
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
                e.preventDefault();
                handleCopy();
            } else if (e.key === '+' || e.key === '=') {
                setFontSize(prev => Math.min(prev + 2, 24));
            } else if (e.key === '-') {
                setFontSize(prev => Math.max(prev - 2, 12));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(handbook.content);
            setCopied(true);
            toast.success('Handbook copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error('Failed to copy handbook');
        }
    };

    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast.error('Please allow popups for printing');
            return;
        }

        const htmlContent = renderMarkdown(handbook.content);

        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${handbook.title}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Georgia', 'Times New Roman', serif;
            font-size: 11pt;
            line-height: 1.7;
            color: #1a1a1a;
            padding: 0.75in 1in;
            max-width: 100%;
          }
          h1 { font-size: 22pt; margin-bottom: 20px; color: #111; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h2 { font-size: 16pt; margin-top: 28px; margin-bottom: 12px; color: #222; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
          h3 { font-size: 13pt; margin-top: 20px; margin-bottom: 8px; color: #333; }
          h4 { font-size: 11pt; margin-top: 16px; margin-bottom: 6px; color: #444; font-weight: 600; }
          p { margin-bottom: 10px; text-align: justify; }
          ul, ol { margin: 10px 0 10px 24px; }
          li { margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: 600; }
          blockquote { border-left: 3px solid #666; padding-left: 16px; margin: 16px 0; color: #555; font-style: italic; }
          code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 0.9em; }
          pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 16px 0; }
          pre code { background: none; padding: 0; }
          hr { border: none; height: 1px; background: #ddd; margin: 24px 0; }
          @media print {
            body { padding: 0; }
            h1, h2, h3 { page-break-after: avoid; }
            pre, blockquote, table { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; color: #888; font-size: 9pt;">
          <p>Generated with Memento AI</p>
          <p style="margin-top: 4px;">${handbook.format} • ${handbook.metadata.wordCount.toLocaleString()} words • ~${handbook.metadata.pageEstimate} pages</p>
        </footer>
      </body>
      </html>
    `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
        toast.success('Opening print dialog...');
    };

    const handleDownloadMarkdown = () => {
        const blob = new Blob([handbook.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${handbook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Markdown downloaded!');
    };

    const handleDownloadPDF = async () => {
        setIsDownloadingPDF(true);
        const toastId = toast.loading('Generating PDF...');
        
        try {
            const htmlContent = renderMarkdown(handbook.content);
            const stylePreset = PDF_STYLE_PRESETS[documentStyle];
            
            const metadata = {
                author: 'Memento AI',
                date: new Date().toLocaleDateString(),
                wordCount: handbook.metadata.wordCount,
                format: handbook.format
            };
            
            const styledHTML = generateStyledHTML(
                htmlContent,
                handbook.title,
                documentStyle,
                metadata
            );

            // Create a visible container div for rendering
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.left = '0';
            container.style.top = '0';
            container.style.width = '210mm'; // A4 width
            container.style.backgroundColor = '#ffffff';
            container.style.zIndex = '-9999';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            document.body.appendChild(container);
            
            // Create shadow DOM for isolation
            const shadow = container.attachShadow({ mode: 'open' });
            
            // Parse and inject the styled HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(styledHTML, 'text/html');
            
            // Extract styles and content
            const styles = doc.querySelectorAll('style, link[rel="stylesheet"]');
            const body = doc.body;
            
            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.style.backgroundColor = '#ffffff';
            wrapper.style.padding = '20mm';
            wrapper.style.width = '210mm';
            wrapper.style.boxSizing = 'border-box';
            
            // Add styles to shadow DOM
            styles.forEach(style => {
                shadow.appendChild(style.cloneNode(true));
            });
            
            // Add KaTeX CSS
            const katexLink = document.createElement('link');
            katexLink.rel = 'stylesheet';
            katexLink.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
            shadow.appendChild(katexLink);
            
            // Add content
            wrapper.innerHTML = body.innerHTML;
            shadow.appendChild(wrapper);
            
            // Wait for fonts and styles to load
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Make container visible for capture
            container.style.opacity = '1';
            
            // Capture with html2canvas
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: wrapper.scrollWidth,
                height: wrapper.scrollHeight,
                windowWidth: wrapper.scrollWidth,
                windowHeight: wrapper.scrollHeight,
            });
            
            // Create PDF
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });
            
            const pageWidth = 210;
            const pageHeight = 297;
            const imgWidth = pageWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            const imgData = canvas.toDataURL('image/png', 1.0);
            
            let heightLeft = imgHeight;
            let position = 0;
            
            // First page
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
            
            // Additional pages
            while (heightLeft > 0) {
                position -= pageHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }
            
            // Cleanup
            document.body.removeChild(container);
            
            // Save PDF
            const fileName = `${handbook.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
            pdf.save(fileName);
            
            toast.success(`PDF downloaded!`, { id: toastId });
        } catch (error) {
            console.error('PDF generation error:', error);
            toast.error('PDF generation failed. Opening print dialog instead...', { id: toastId });
            
            // Fallback to print dialog
            const pdfWindow = window.open('', '_blank');
            if (pdfWindow) {
                const htmlContent = renderMarkdown(handbook.content);
                const metadata = {
                    author: 'Memento AI',
                    date: new Date().toLocaleDateString(),
                    wordCount: handbook.metadata.wordCount,
                    format: handbook.format
                };
                const styledHTML = generateStyledHTML(htmlContent, handbook.title, documentStyle, metadata);
                pdfWindow.document.write(styledHTML);
                pdfWindow.document.close();
                setTimeout(() => pdfWindow.print(), 1000);
            }
        } finally {
            setIsDownloadingPDF(false);
        }
    };

    // Share - opens styled HTML in new tab for browser print
    const handleShare = () => {
        const shareWindow = window.open('', '_blank');
        if (!shareWindow) {
            toast.error('Please allow popups');
            return;
        }

        const htmlContent = renderMarkdown(handbook.content);
        const stylePreset = PDF_STYLE_PRESETS[documentStyle];
        
        const metadata = {
            author: 'Memento AI',
            date: new Date().toLocaleDateString(),
            wordCount: handbook.metadata.wordCount,
            format: handbook.format
        };
        
        const styledHTML = generateStyledHTML(
            htmlContent,
            handbook.title,
            documentStyle,
            metadata
        );

        shareWindow.document.write(styledHTML);
        shareWindow.document.close();
        toast.success(`Opened with ${stylePreset.name} style!`);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getFormatBadge = () => {
        const styles: Record<string, string> = {
            'Study Guide': 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30',
            'Cheatsheet': 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30',
            'Briefing': 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30',
            'Comprehensive': 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30',
        };
        return styles[handbook.format] || 'bg-slate-500/20 text-slate-300 ring-1 ring-slate-500/30';
    };

    // Parse TOC from content (simplified)
    const tocItems = useMemo(() => {
        const items: { id: string; title: string; level: number }[] = [];
        const lines = handbook.content.split('\n');
        let idx = 0;

        for (const line of lines) {
            const match = line.match(/^(#{1,3})\s+(.+)$/);
            if (match) {
                items.push({
                    id: `section-${idx}`,
                    title: match[2].trim(),
                    level: match[1].length,
                });
                idx++;
            }
        }
        return items;
    }, [handbook.content]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/85 backdrop-blur-xl"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative w-full h-full max-w-[1400px] max-h-[95vh] m-4 flex bg-gradient-to-br from-[#0c1018] to-[#0a0d12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Sidebar - Table of Contents */}
                <div className={`${showTableOfContents ? 'w-72' : 'w-0'} border-r border-white/[0.08] bg-[#080a0e] transition-all duration-300 overflow-hidden flex flex-col shrink-0`}>
                    {/* TOC Header */}
                    <div className="p-5 border-b border-white/[0.08] shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Layers size={16} className="text-blue-400" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-white">Contents</h3>
                                <p className="text-[10px] text-slate-500">{tocItems.length} sections</p>
                            </div>
                        </div>
                    </div>

                    {/* TOC Items */}
                    <div className="flex-1 overflow-y-auto py-3 px-3 custom-scrollbar">
                        <div className="space-y-0.5">
                            {tocItems.slice(0, 30).map((entry, idx) => (
                                <button
                                    key={entry.id}
                                    onClick={() => {
                                        const headers = contentRef.current?.querySelectorAll('h1, h2, h3');
                                        if (headers && headers[idx]) {
                                            headers[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-[13px] transition-all duration-200 hover:bg-white/[0.04] ${activeSection === entry.id
                                        ? 'bg-blue-500/10 text-blue-300'
                                        : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                    style={{ paddingLeft: `${(entry.level - 1) * 14 + 12}px` }}
                                >
                                    <span className={`block truncate ${entry.level === 1 ? 'font-medium' : ''}`}>
                                        {entry.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* TOC Footer - Stats */}
                    <div className="p-4 border-t border-white/[0.08] bg-[#070809]">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Hash size={12} className="text-slate-600" />
                                <span>{handbook.metadata.wordCount.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <FileText size={12} className="text-slate-600" />
                                <span>~{handbook.metadata.pageEstimate} pg</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <BookOpen size={12} className="text-slate-600" />
                                <span>{handbook.metadata.sourceCount} src</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Clock size={12} className="text-slate-600" />
                                <span>~{Math.ceil(handbook.metadata.wordCount / 200)} min</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="shrink-0 border-b border-white/[0.08] bg-[#0d1118]/80 backdrop-blur-sm">
                        {/* Title Row */}
                        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <h1 className="text-xl font-bold text-white truncate leading-tight">
                                    {handbook.title}
                                </h1>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getFormatBadge()}`}>
                                        {handbook.format}
                                    </span>
                                    <span className="text-xs text-slate-500">{handbook.length}</span>
                                    <span className="text-xs text-slate-600">•</span>
                                    <span className="text-xs text-slate-500">{formatDate(handbook.metadata.createdAt)}</span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Actions Row */}
                        <div className="px-6 pb-4 flex items-center justify-between gap-4">
                            {/* Left side */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowTableOfContents(!showTableOfContents)}
                                    className={`p-2 rounded-lg transition-colors ${showTableOfContents ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
                                    title={showTableOfContents ? 'Hide contents' : 'Show contents'}
                                >
                                    {showTableOfContents ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>

                                {/* Font size */}
                                <div className="flex items-center gap-1 px-2 py-1 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                                    <button
                                        onClick={() => setFontSize(prev => Math.max(prev - 2, 12))}
                                        className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                    >
                                        <ZoomOut size={14} />
                                    </button>
                                    <span className="text-xs text-slate-500 w-6 text-center font-mono">{fontSize}</span>
                                    <button
                                        onClick={() => setFontSize(prev => Math.min(prev + 2, 24))}
                                        className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                    >
                                        <ZoomIn size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Right side */}
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCopy}
                                    icon={copied ? <Check size={14} /> : <Copy size={14} />}
                                >
                                    {copied ? 'Copied' : 'Copy'}
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handlePrint}
                                    icon={<Printer size={14} />}
                                >
                                    Print
                                </Button>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleDownloadMarkdown}
                                    icon={<Download size={14} />}
                                >
                                    Markdown
                                </Button>

                                {/* PDF Style Selector */}
                                <select
                                    value={documentStyle}
                                    onChange={(e) => setDocumentStyle(e.target.value as PDFDocumentStyle)}
                                    className="h-8 px-2 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    title="PDF Style"
                                >
                                    {PDF_STYLE_LIST.map((style) => (
                                        <option key={style.id} value={style.id} className="bg-[#1a1d24] text-white">
                                            {style.icon} {style.name}
                                        </option>
                                    ))}
                                </select>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleShare}
                                    icon={<Share2 size={14} />}
                                    title="Open styled version in new tab"
                                >
                                    Share
                                </Button>

                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleDownloadPDF}
                                    disabled={isDownloadingPDF}
                                    icon={<FileDown size={14} />}
                                    className="bg-blue-600 hover:bg-blue-500"
                                >
                                    {isDownloadingPDF ? 'Generating...' : 'PDF'}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div
                        ref={contentRef}
                        className="flex-1 overflow-y-auto custom-scrollbar"
                        style={{ fontSize: `${fontSize}px` }}
                    >
                        <div className="max-w-4xl mx-auto px-8 py-10">
                            <div className="bg-[#111419] rounded-2xl border border-white/[0.06] shadow-xl overflow-hidden">
                                <div className="p-10">
                                    <HandbookContent content={handbook.content} />
                                </div>

                                {/* Footer */}
                                <div className="px-10 py-6 bg-[#0c0f13] border-t border-white/[0.06]">
                                    <div className="flex items-center justify-between text-xs text-slate-500">
                                        <span>Generated with Memento AI</span>
                                        <span>{handbook.format} • {handbook.metadata.wordCount.toLocaleString()} words</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
