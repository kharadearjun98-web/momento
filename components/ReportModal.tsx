
import React, { useState } from 'react';
import { X, FileText, ScrollText, Briefcase, Book, PenTool, Play, Sparkles, Image, Layout, Palette, User, Loader2, GraduationCap, FileType } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { ReportFormat, ReportTone, GeneratedReport } from '../types';
import { DocumentType, PipelineProgress } from '../lib/documentGenerator';
import { PDFGenerationOptions, DEFAULT_PDF_OPTIONS } from '../lib/pdfGenerator';
import { PDF_STYLE_LIST, PDFDocumentStyle } from '../lib/pdfStyles';
import { useNotification } from '../lib/useNotification';
import { supabase } from '../lib/supabase/client';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId: string;
  onReportGenerated?: (report: GeneratedReport, pdfOptions: PDFGenerationOptions) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, notebookId, onReportGenerated }) => {
  const [format, setFormat] = useState<ReportFormat>('Executive Summary');
  const [tone, setTone] = useState<ReportTone>('Professional');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const notification = useNotification();

  // Progress tracking for multi-agent pipeline
  const [progress, setProgress] = useState<PipelineProgress | null>(null);

  // PDF Options
  const [pdfOptions, setPdfOptions] = useState<PDFGenerationOptions>(DEFAULT_PDF_OPTIONS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Map ReportFormat to DocumentType
  const formatToDocType: Record<ReportFormat, DocumentType> = {
    'Executive Summary': 'executive_summary',
    'Research Paper': 'research_paper',
    'Technical Memo': 'technical_memo',
    'Literature Review': 'literature_review',
  };

  const formats: { id: ReportFormat; icon: React.ReactNode; desc: string }[] = [
    { id: 'Executive Summary', icon: <Briefcase size={20} />, desc: 'Strategic insights' },
    { id: 'Research Paper', icon: <Book size={20} />, desc: 'Academic depth' },
    { id: 'Technical Memo', icon: <FileText size={20} />, desc: 'Technical detail' },
    { id: 'Literature Review', icon: <ScrollText size={20} />, desc: 'Source synthesis' },
  ];

  const tones: ReportTone[] = ['Professional', 'Academic', 'Persuasive', 'Neutral'];

  const colorThemes: { id: PDFGenerationOptions['colorTheme']; label: string; color: string }[] = [
    { id: 'purple', label: 'Memento Purple', color: '#8B5CF6' },
    { id: 'blue', label: 'Corporate Blue', color: '#3B82F6' },
    { id: 'green', label: 'Nature Green', color: '#10B981' },
    { id: 'professional', label: 'Classic Black', color: '#1F2937' },
  ];

  const updatePdfOption = <K extends keyof PDFGenerationOptions>(key: K, value: PDFGenerationOptions[K]) => {
    setPdfOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress({
      stage: 'queued',
      overallProgress: 0,
      currentAgent: 'worker',
      message: 'Submitting report job...',
    } as PipelineProgress);

    try {
      const { data, error: createError } = await supabase.functions.invoke('create-job', {
        body: {
          type: 'report',
          input: {
            notebookId,
            format,
            tone,
            customPrompt: prompt || undefined,
            pdfOptions,
            documentType: formatToDocType[format],
          },
        },
      });

      if (createError) throw new Error(createError.message);
      const jobId = data?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        throw new Error('Job service did not return a job id.');
      }

      notification.report('Report Job Queued', 'The worker will save it when generation completes.');
      onClose();
      return;
      /*
      console.log('📝 Starting MULTI-AGENT document generation...');
      console.log(`   Type: ${format} → ${formatToDocType[format]}`);

      // Use new multi-agent document generator
      const document = await generateDocument(notebookId, {
        type: formatToDocType[format],
        tone: tone.toLowerCase() as 'professional' | 'academic' | 'persuasive' | 'neutral',
        customPrompt: prompt || undefined,
        generateVisuals: true,
        maxVisuals: 4, // Generate 3-5 graphics (avg 4)
        modelQuality: 'high',
        onProgress: (p) => {
          setProgress(p);
          console.log(`📊 [${p.stage}] ${p.overallProgress}% - ${p.message}`);
        },
      });

      console.log('✅ Multi-agent document generated successfully');

      // Convert to legacy GeneratedReport format for compatibility
      const report: GeneratedReport = {
        id: document.id,
        notebookId: document.notebookId,
        title: document.title,
        content: document.content,
        sections: document.sections.map(s => ({
          id: s.id,
          title: s.title,
          content: s.content,
          level: s.level,
        })),
        images: document.visuals
          .filter(v => v.imageBase64)
          .map(v => ({
            id: v.id,
            prompt: v.title,
            url: '',
            base64: v.imageBase64,
            type: 'infographic' as const,
            caption: v.caption,
          })),
        metadata: {
          format,
          tone,
          createdAt: document.metadata.createdAt,
          sourceCount: document.metadata.sourceCount,
          wordCount: document.metadata.wordCount,
          model: document.metadata.model,
          hasImages: document.visuals.length > 0,
        },
      };

      // Save to database
      await saveReport(report);

      const imageInfo = document.visuals.length > 0
        ? ` with ${document.visuals.length} AI-generated visuals`
        : '';
      const qualityInfo = `Quality: ${(document.metadata.qualityScore * 100).toFixed(0)}%`;
      notification.report('Report Generated', `${document.metadata.wordCount} words${imageInfo}`);

      // Notify parent component with PDF options
      if (onReportGenerated) {
        onReportGenerated(report, pdfOptions);
      }

      onClose();
      */
    } catch (error) {
      console.error('❌ Multi-agent generation error:', error);
      notification.error('Report Generation Failed', error instanceof Error ? error.message : 'Failed to generate document');
    } finally {
      setIsGenerating(false);
      setProgress(null);
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
            <FileText size={18} className="text-memento-purple-400" />
            <h2 className="text-sm font-display font-semibold text-white">Generate Report</h2>
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

          {/* Format Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Document Type</h3>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFormat(item.id)}
                  className={`relative p-3 rounded-xl flex flex-col items-center gap-2 text-center transition-all duration-200 border
                    ${format === item.id
                      ? 'bg-memento-purple-500/20 border-memento-purple-500/50 shadow-[inset_0_0_20px_rgba(139,92,246,0.2)]'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                    }`}
                >
                  <div className={`transition-colors duration-200 ${format === item.id ? 'text-memento-purple-400' : 'text-slate-400'}`}>
                    {item.icon}
                  </div>
                  <div>
                    <div className={`text-xs font-semibold ${format === item.id ? 'text-white' : 'text-slate-300'}`}>
                      {item.id}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</div>
                  </div>

                  {/* Active indicator dot */}
                  {format === item.id && (
                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-memento-purple-500 shadow-[0_0_4px_#8B5CF6]" />
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Tone Selection */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Tone & Style
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {tones.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 border flex items-center justify-center gap-2
                    ${tone === t
                      ? 'bg-white text-black border-white shadow-lg'
                      : 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10 hover:text-white'
                    }`}
                >
                  {t === 'Professional' && <Briefcase size={12} />}
                  {t === 'Academic' && <Book size={12} />}
                  {t === 'Persuasive' && <Sparkles size={12} />}
                  {t === 'Neutral' && <PenTool size={12} />}
                  {t}
                </button>
              ))}
            </div>
          </section>

          {/* Context Input */}
          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              Key Directives
            </h3>
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-purple-500/30 to-pink-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Outline specific arguments, sections, or data points to include..."
                className="relative w-full h-24 bg-[#0B0E13] border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner"
              />
            </div>
          </section>

          {/* PDF Options Section */}
          <section className="space-y-3">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <Layout size={14} />
                PDF Formatting Options
              </span>
              <span className={`transform transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2 animate-in slide-in-from-top-2 duration-200">
                {/* Cover Page & Branding Toggles */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeCoverPage}
                      onChange={(e) => updatePdfOption('includeCoverPage', e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent text-memento-purple-500 focus:ring-memento-purple-500/50"
                    />
                    <div className="flex items-center gap-1.5">
                      <Image size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-300">Cover Page</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeTableOfContents}
                      onChange={(e) => updatePdfOption('includeTableOfContents', e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent text-memento-purple-500 focus:ring-memento-purple-500/50"
                    />
                    <div className="flex items-center gap-1.5">
                      <ScrollText size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-300">Table of Contents</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeBranding}
                      onChange={(e) => updatePdfOption('includeBranding', e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent text-memento-purple-500 focus:ring-memento-purple-500/50"
                    />
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-300">Memento Branding</span>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfOptions.includeCharts}
                      onChange={(e) => updatePdfOption('includeCharts', e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 bg-transparent text-memento-purple-500 focus:ring-memento-purple-500/50"
                    />
                    <div className="flex items-center gap-1.5">
                      <Layout size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-300">Visual Charts</span>
                    </div>
                  </label>
                </div>

                {/* Document Style */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <FileType size={12} />
                    Document Style
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {PDF_STYLE_LIST.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => updatePdfOption('documentStyle', style.id)}
                        className={`p-2 rounded-lg text-left transition-all border ${pdfOptions.documentStyle === style.id
                          ? 'border-memento-purple-500/50 bg-memento-purple-500/10'
                          : 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{style.icon}</span>
                          <div className="min-w-0">
                            <div className="text-[10px] font-medium text-slate-200 truncate">{style.name}</div>
                            <div className="text-[8px] text-slate-500 truncate">{style.description}</div>
                          </div>
                        </div>
                        {style.category === 'academic' && (
                          <span className="inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[7px]">
                            <GraduationCap size={8} />
                            Academic
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color Theme */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Palette size={12} />
                    Color Theme
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {colorThemes.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => updatePdfOption('colorTheme', theme.id)}
                        className={`p-2 rounded-lg text-center transition-all border ${pdfOptions.colorTheme === theme.id
                          ? 'border-white/30 bg-white/10'
                          : 'border-transparent bg-white/[0.02] hover:bg-white/[0.05]'
                          }`}
                      >
                        <div
                          className="w-4 h-4 rounded-full mx-auto mb-1 ring-2 ring-white/20"
                          style={{ backgroundColor: theme.color }}
                        />
                        <span className="text-[9px] text-slate-400">{theme.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Author Name */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <User size={12} />
                    Author Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={pdfOptions.authorName || ''}
                    onChange={(e) => updatePdfOption('authorName', e.target.value)}
                    placeholder="Your name for the cover page"
                    className="w-full bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-purple-500/50"
                  />
                </div>

                {/* Subtitle */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 flex items-center gap-1.5">
                    <FileText size={12} />
                    Subtitle (Optional)
                  </label>
                  <input
                    type="text"
                    value={pdfOptions.subtitle || ''}
                    onChange={(e) => updatePdfOption('subtitle', e.target.value)}
                    placeholder="Add a subtitle for your report"
                    className="w-full bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-memento-purple-500/50"
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 bg-[#0B0E13]/50 shrink-0 space-y-3">
          {/* Progress Indicator */}
          {isGenerating && progress && (
            <div className="space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-memento-purple-400" />
                  <span className="capitalize">{progress.stage.replace('_', ' ')}</span>
                </span>
                <span className="text-memento-purple-400 font-semibold">{progress.overallProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-memento-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progress.overallProgress}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 truncate">{progress.message}</p>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={isGenerating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerate}
              isLoading={isGenerating}
              icon={!isGenerating ? <Play size={14} /> : undefined}
              className="flex-[2]"
            >
              {isGenerating
                ? (progress ? `${progress.stage.charAt(0).toUpperCase() + progress.stage.slice(1).replace('_', ' ')}...` : 'Starting...')
                : 'Generate Multi-Agent Report'
              }
            </Button>
          </div>
        </div>
      </GlassPanel >
    </div >
  );
};
