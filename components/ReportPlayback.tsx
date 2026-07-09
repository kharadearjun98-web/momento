import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Download, Copy, Check, FileText, ChevronDown, ChevronUp,
  Printer, Share2, BookOpen, Clock, Hash, Layers, Eye, EyeOff,
  ZoomIn, ZoomOut, Loader2, Settings
} from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { GeneratedReport } from '../types';
import { generateReportPDF } from '../lib/reportGenerator';
import { downloadReportPDF, PDFGenerationOptions, DEFAULT_PDF_OPTIONS } from '../lib/pdfGenerator';
import { generateStyledHTML, PDF_STYLE_PRESETS } from '../lib/pdfStyles';
import { renderMarkdown, markdownStyles } from '../lib/markdownRenderer';
import { MermaidDiagram, extractMermaidBlocks } from './MermaidDiagram';
import 'katex/dist/katex.min.css';
import toast from 'react-hot-toast';

interface ReportPlaybackProps {
  report: GeneratedReport;
  onClose: () => void;
  initialPdfOptions?: PDFGenerationOptions;
}

// Component to render report content with Mermaid diagrams
const ReportContent: React.FC<{ content: string }> = ({ content }) => {
  const { content: processedContent, blocks } = useMemo(() => {
    return extractMermaidBlocks(content);
  }, [content]);

  // Render the content, replacing mermaid placeholders with actual diagrams
  const renderedHtml = useMemo(() => {
    let html = renderMarkdown(processedContent);

    // Replace placeholders with special markers
    blocks.forEach((block, idx) => {
      html = html.replace(
        `__MERMAID_BLOCK_${idx}__`,
        `<div data-mermaid-placeholder="${idx}"></div>`
      );
    });

    return html;
  }, [processedContent, blocks]);

  return (
    <div>
      {/* Split and render content around mermaid blocks */}
      {blocks.length === 0 ? (
        <article
          className={`prose prose-invert prose-purple max-w-none ${markdownStyles}`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <>
          {/* Render parts before first block */}
          <article
            className={`prose prose-invert prose-purple max-w-none ${markdownStyles}`}
            dangerouslySetInnerHTML={{
              __html: renderedHtml.split('<div data-mermaid-placeholder="0"></div>')[0]
            }}
          />

          {/* Render each mermaid block with content after it */}
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
                  <article
                    className={`prose prose-invert prose-purple max-w-none ${markdownStyles}`}
                    dangerouslySetInnerHTML={{ __html: contentUntilNext }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </>
      )}
    </div>
  );
};

export const ReportPlayback: React.FC<ReportPlaybackProps> = ({ report, onClose, initialPdfOptions }) => {
  const [showTableOfContents, setShowTableOfContents] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pdfOptions, setPdfOptions] = useState<PDFGenerationOptions>(initialPdfOptions || DEFAULT_PDF_OPTIONS);
  const contentRef = useRef<HTMLDivElement>(null);

  // Track active section on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;

      const sections = contentRef.current.querySelectorAll('[data-section-id]');
      let currentSection: string | null = null;

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= 150) {
          currentSection = section.getAttribute('data-section-id');
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

  // The report body is rendered from markdown, so its headings don't carry the
  // section ids the Table of Contents uses. Tag each rendered heading with its
  // section id (matched by title text) so the TOC can scroll to it and the
  // scroll-spy above can highlight the active section.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const headings = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'));

    report.sections.forEach((section) => {
      const match = headings.find(
        (heading) =>
          !heading.hasAttribute('data-section-id') &&
          normalize(heading.textContent || '') === normalize(section.title),
      );
      if (match) match.setAttribute('data-section-id', section.id);
    });
  }, [report.sections, report.content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
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
      await navigator.clipboard.writeText(report.content);
      setCopied(true);
      toast.success('Report copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy report');
    }
  };

  const handlePrint = () => {
    try {
      // Use the styled HTML generator for professional print output
      const htmlContent = renderMarkdown(report.content);
      const styledDoc = generateStyledHTML(
        htmlContent,
        report.title,
        pdfOptions.documentStyle,
        {
          author: pdfOptions.authorName,
          date: new Date(report.metadata.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          }),
          format: report.metadata.format,
          wordCount: report.metadata.wordCount
        }
      );

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error('Please allow popups for printing');
        return;
      }

      printWindow.document.write(styledDoc);
      printWindow.document.close();

      // Wait for fonts and styles to load
      setTimeout(() => {
        printWindow.print();
      }, 500);

      toast.success('Opening print dialog...');
    } catch (error) {
      toast.error('Failed to open print dialog. Please allow popups.');
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      await downloadReportPDF(report, pdfOptions);
      toast.success('Professional PDF downloaded!');
    } catch (error) {
      console.error('PDF download error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShareStyled = () => {
    try {
      const htmlContent = renderMarkdown(report.content);
      const styledDoc = generateStyledHTML(
        htmlContent,
        report.title,
        pdfOptions.documentStyle,
        {
          author: pdfOptions.authorName,
          date: new Date(report.metadata.createdAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          }),
          format: report.metadata.format,
          wordCount: report.metadata.wordCount
        }
      );

      const shareWindow = window.open('', '_blank');
      if (!shareWindow) {
        toast.error('Please allow popups');
        return;
      }

      shareWindow.document.write(styledDoc);
      shareWindow.document.close();
      
      const styleName = PDF_STYLE_PRESETS[pdfOptions.documentStyle]?.name || 'Standard';
      toast.success(`Opened with ${styleName} style - Use Ctrl/Cmd+P to save as PDF`);
    } catch (error) {
      toast.error('Failed to open share window');
    }
  };

  const scrollToSection = (sectionId: string) => {
    const container = contentRef.current;
    const section = container?.querySelector(`[data-section-id="${sectionId}"]`) as HTMLElement | null;
    if (!container || !section) return;

    // Scroll the content container (not the window) so the heading lands near
    // the top with a little breathing room.
    const top =
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      16;
    container.scrollTo({ top, behavior: 'smooth' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-6xl h-[90vh] flex bg-[#0B0E13]/98 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

        {/* Sidebar - Table of Contents */}
        <div className={`${showTableOfContents ? 'w-64' : 'w-0'} border-r border-white/10 bg-[#080A0E] transition-all duration-300 overflow-hidden flex flex-col`}>
          {/* TOC Header */}
          <div className="p-4 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2 text-slate-400">
              <Layers size={16} />
              <span className="text-sm font-medium">Contents</span>
            </div>
          </div>

          {/* TOC Items */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {report.sections.map((section, idx) => (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${activeSection === section.id
                  ? 'bg-memento-purple-500/20 text-white border-l-2 border-memento-purple-500'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                style={{ paddingLeft: `${(section.level - 1) * 12 + 12}px` }}
              >
                {section.title}
              </button>
            ))}
          </div>

          {/* TOC Footer - Stats */}
          <div className="p-4 border-t border-white/10 space-y-2 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <Hash size={12} />
              <span>{report.metadata.wordCount} words</span>
            </div>
            <div className="flex items-center gap-2">
              <BookOpen size={12} />
              <span>{report.metadata.sourceCount} sources</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={12} />
              <span>~{Math.ceil(report.metadata.wordCount / 200)} min read</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="border-b border-white/20 bg-[#161B22] shrink-0">
            {/* Top row: Title */}
            <div className="px-4 pt-10 pb-4">
              <h2 className="text-lg font-display font-bold text-white">
                {report.title}
              </h2>
            </div>

            {/* Bottom row: Meta + Actions */}
            <div className="px-4 pb-4 flex items-center justify-between gap-4">
              {/* Left: Toggle + Badges */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTableOfContents(!showTableOfContents)}
                  className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                  title={showTableOfContents ? 'Hide contents' : 'Show contents'}
                >
                  {showTableOfContents ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <span className="px-2 py-0.5 bg-memento-purple-500/30 text-memento-purple-200 rounded text-xs font-medium">
                  {report.metadata.format}
                </span>
                <span className="px-2 py-0.5 bg-white/10 text-slate-300 rounded text-xs">
                  {report.metadata.tone}
                </span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs flex items-center gap-1" title="PDF Export Style">
                  {PDF_STYLE_PRESETS[pdfOptions.documentStyle]?.icon} {PDF_STYLE_PRESETS[pdfOptions.documentStyle]?.name.split(' ')[0]}
                </span>
                <span className="text-slate-400 text-xs">{formatDate(report.metadata.createdAt)}</span>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {/* Font size controls */}
                <div className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg mr-2">
                  <button
                    onClick={() => setFontSize(prev => Math.max(prev - 2, 12))}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                    title="Decrease font size"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-xs text-slate-500 w-8 text-center">{fontSize}</span>
                  <button
                    onClick={() => setFontSize(prev => Math.min(prev + 2, 24))}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                    title="Increase font size"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>

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
                  onClick={handleShareStyled}
                  icon={<Share2 size={14} />}
                  title={`Open with ${PDF_STYLE_PRESETS[pdfOptions.documentStyle]?.name || 'Standard'} style`}
                >
                  Share
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
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadPDF}
                  disabled={isDownloading}
                  icon={isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                >
                  {isDownloading ? 'Generating...' : 'Download PDF'}
                </Button>

                <button
                  onClick={onClose}
                  className="p-2 ml-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#0D1117]"
            style={{ fontSize: `${fontSize}px` }}
          >
            <div className="max-w-3xl mx-auto bg-[#161B22] rounded-xl p-8 shadow-xl border border-white/5">
              {/* Render the markdown content with KaTeX math and Mermaid diagrams */}
              <ReportContent content={report.content} />

              {/* Footer metadata */}
              <div className="mt-12 pt-6 border-t border-white/20 text-center text-sm text-slate-400">
                <p className="font-medium">Generated with Memento AI</p>
                <p className="mt-2">
                  {report.metadata.format} • {report.metadata.tone} Tone • {report.metadata.wordCount} words
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
