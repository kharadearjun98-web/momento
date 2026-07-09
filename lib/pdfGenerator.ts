import jsPDF from 'jspdf';
import { GeneratedReport, ReportSection, ReportImage, GeneratedHandbook } from '../types';
import { PDFDocumentStyle, DEFAULT_PDF_STYLE } from './pdfStyles';

/**
 * Draw the Memento flower/asterisk logo using jsPDF drawing primitives
 * The logo is a 6-petal flower shape similar to the app header
 */
function drawMementoLogo(doc: jsPDF, centerX: number, centerY: number, size: number, color: [number, number, number] = [255, 255, 255]): void {
  const petalLength = size * 0.45;
  const petalWidth = size * 0.22;
  const centerRadius = size * 0.15;

  doc.setFillColor(color[0], color[1], color[2]);

  // Draw 6 petals (ellipses rotated around center)
  const angles = [0, 60, 120, 180, 240, 300];

  angles.forEach(angle => {
    const rad = (angle * Math.PI) / 180;

    // Calculate petal center position
    const petalCenterX = centerX + (petalLength * 0.5) * Math.cos(rad);
    const petalCenterY = centerY + (petalLength * 0.5) * Math.sin(rad);

    // Draw petal as an ellipse (approximated with a rounded rectangle)
    doc.ellipse(petalCenterX, petalCenterY, petalWidth * 0.5, petalLength * 0.5, 'F');
  });

  // Draw center circle
  doc.circle(centerX, centerY, centerRadius, 'F');
}

// Brand colors
const COLORS = {
  primary: '#8B5CF6',       // Memento purple
  primaryDark: '#7C3AED',   // Darker purple
  accent: '#D946EF',        // Pink accent
  dark: '#0B0E13',          // Dark background
  text: '#1a1a1a',          // Main text
  textLight: '#4a4a4a',     // Secondary text
  textMuted: '#6b7280',     // Muted text
  border: '#e5e7eb',        // Light border
  white: '#ffffff',
};

export interface PDFGenerationOptions {
  includeCoverPage: boolean;
  includeTableOfContents: boolean;
  includeCharts: boolean;
  includeBranding: boolean;
  colorTheme: 'purple' | 'blue' | 'green' | 'professional';
  documentStyle: PDFDocumentStyle;
  authorName?: string;
  companyName?: string;
  subtitle?: string;
}

export const DEFAULT_PDF_OPTIONS: PDFGenerationOptions = {
  includeCoverPage: true,
  includeTableOfContents: true,
  includeCharts: true,
  includeBranding: true,
  colorTheme: 'purple',
  documentStyle: DEFAULT_PDF_STYLE,
  authorName: '',
  companyName: 'Memento AI',
  subtitle: '',
};

interface PDFContext {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;
  currentY: number;
  pageNumber: number;
  options: PDFGenerationOptions;
  report: GeneratedReport;
  tocEntries: { title: string; page: number; level: number }[];
}

/**
 * Generate a professional PDF from a report
 */
export async function generateProfessionalPDF(
  report: GeneratedReport,
  options: Partial<PDFGenerationOptions> = {}
): Promise<Blob> {
  const fullOptions: PDFGenerationOptions = { ...DEFAULT_PDF_OPTIONS, ...options };

  // Create PDF document (A4 size)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = { top: 25, right: 20, bottom: 25, left: 20 };

  const ctx: PDFContext = {
    doc,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin.left - margin.right,
    currentY: margin.top,
    pageNumber: 1,
    options: fullOptions,
    report,
    tocEntries: [],
  };

  // Generate cover page
  if (fullOptions.includeCoverPage) {
    await generateCoverPage(ctx);
    addNewPage(ctx);
  }

  // Generate table of contents placeholder (we'll fill it after content)
  let tocPageStart = ctx.pageNumber;
  if (fullOptions.includeTableOfContents) {
    // Reserve page for TOC
    ctx.currentY = margin.top;
    addNewPage(ctx);
  }

  // Generate main content
  await generateMainContent(ctx);

  // Add generated images if available
  if (fullOptions.includeCharts && report.images && report.images.length > 0) {
    await generateImagePages(ctx, report.images);
  }

  // Go back and fill in TOC if needed
  if (fullOptions.includeTableOfContents && ctx.tocEntries.length > 0) {
    generateTableOfContents(ctx, tocPageStart);
  }

  // Add page numbers and headers to all pages
  addHeadersAndFooters(ctx);

  // Return as Blob
  return doc.output('blob');
}

/**
 * Generate the cover page
 */
async function generateCoverPage(ctx: PDFContext): Promise<void> {
  const { doc, pageWidth, pageHeight, report, options } = ctx;
  const centerX = pageWidth / 2;

  // Background gradient effect (using rectangles)
  doc.setFillColor(11, 14, 19); // Dark background
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Purple gradient accent at top
  doc.setFillColor(139, 92, 246); // Memento purple
  doc.rect(0, 0, pageWidth, 8, 'F');

  // Add logo - draw the Memento flower logo
  if (options.includeBranding) {
    drawMementoLogo(doc, centerX, 45, 30, [255, 255, 255]);
  }

  // Company name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(139, 92, 246);
  doc.text(options.companyName || 'Memento AI', centerX, 75, { align: 'center' });

  // Main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);

  // Word wrap title
  const titleLines = doc.splitTextToSize(report.title, pageWidth - 40);
  let titleY = 110;
  titleLines.forEach((line: string, i: number) => {
    doc.text(line, centerX, titleY + (i * 12), { align: 'center' });
  });

  // Subtitle/Custom prompt if provided
  if (options.subtitle || report.metadata.customPrompt) {
    const subtitle = options.subtitle || report.metadata.customPrompt || '';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(156, 163, 175); // Gray text
    const subtitleLines = doc.splitTextToSize(subtitle.substring(0, 200), pageWidth - 60);
    let subtitleY = titleY + (titleLines.length * 12) + 20;
    subtitleLines.slice(0, 3).forEach((line: string, i: number) => {
      doc.text(line, centerX, subtitleY + (i * 6), { align: 'center' });
    });
  }

  // Document type badge
  const badgeY = 180;
  doc.setFillColor(139, 92, 246, 0.3);
  const badgeText = report.metadata.format;
  const badgeWidth = doc.getTextWidth(badgeText) + 20;
  doc.roundedRect(centerX - badgeWidth / 2, badgeY - 5, badgeWidth, 12, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(167, 139, 250);
  doc.text(badgeText, centerX, badgeY + 3, { align: 'center' });

  // Tone badge
  const toneY = badgeY + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(156, 163, 175);
  doc.text(`${report.metadata.tone} Tone`, centerX, toneY, { align: 'center' });

  // Bottom section with metadata
  const bottomY = pageHeight - 50;

  // Horizontal line
  doc.setDrawColor(75, 85, 99);
  doc.setLineWidth(0.3);
  doc.line(40, bottomY - 15, pageWidth - 40, bottomY - 15);

  // Metadata row
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);

  const metaItems = [
    `${report.metadata.sourceCount} Sources`,
    `${report.metadata.wordCount} Words`,
    `~${Math.ceil(report.metadata.wordCount / 200)} min read`,
  ];

  const metaSpacing = (pageWidth - 80) / (metaItems.length - 1);
  metaItems.forEach((item, i) => {
    doc.text(item, 40 + (i * metaSpacing), bottomY, { align: i === 0 ? 'left' : i === metaItems.length - 1 ? 'right' : 'center' });
  });

  // Date
  const dateStr = new Date(report.metadata.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  doc.text(dateStr, centerX, bottomY + 10, { align: 'center' });

  // Author if provided
  if (options.authorName) {
    doc.text(`Prepared by: ${options.authorName}`, centerX, bottomY + 20, { align: 'center' });
  }
}

/**
 * Generate table of contents
 */
function generateTableOfContents(ctx: PDFContext, tocPage: number): void {
  const { doc, margin, contentWidth } = ctx;

  // Go to TOC page
  doc.setPage(tocPage);

  let y = margin.top;

  // TOC Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(26, 26, 26);
  doc.text('Table of Contents', margin.left, y);
  y += 15;

  // Underline
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.5);
  doc.line(margin.left, y, margin.left + 50, y);
  y += 15;

  // TOC entries
  doc.setFont('helvetica', 'normal');

  for (const entry of ctx.tocEntries) {
    const indent = (entry.level - 1) * 8;
    const fontSize = entry.level === 1 ? 11 : 10;
    const isBold = entry.level === 1;

    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(entry.level === 1 ? 26 : 74, entry.level === 1 ? 26 : 74, entry.level === 1 ? 26 : 74);

    // Title
    const titleX = margin.left + indent;
    const maxTitleWidth = contentWidth - indent - 15;
    const titleText = entry.title.length > 60 ? entry.title.substring(0, 57) + '...' : entry.title;
    doc.text(titleText, titleX, y);

    // Page number
    doc.setTextColor(107, 114, 128);
    doc.text(String(entry.page), margin.left + contentWidth, y, { align: 'right' });

    // Dotted line
    const titleWidth = doc.getTextWidth(titleText);
    const pageNumWidth = doc.getTextWidth(String(entry.page));
    const dotsStart = titleX + titleWidth + 3;
    const dotsEnd = margin.left + contentWidth - pageNumWidth - 3;

    if (dotsEnd > dotsStart) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([1, 2], 0);
      doc.line(dotsStart, y, dotsEnd, y);
      doc.setLineDashPattern([], 0);
    }

    y += entry.level === 1 ? 8 : 6;

    // Check for page break
    if (y > ctx.pageHeight - margin.bottom - 20) {
      // Need more pages for TOC - this is a simplified version
      break;
    }
  }
}

/**
 * Generate main content pages
 */
async function generateMainContent(ctx: PDFContext): Promise<void> {
  const { doc, margin, contentWidth, report } = ctx;

  // Start with white background
  doc.setFillColor(255, 255, 255);

  ctx.currentY = margin.top;

  // Parse and render markdown content
  const lines = report.content.split('\n');
  let currentListType: 'ul' | 'ol' | null = null;
  let listItemNumber = 0;

  for (const line of lines) {
    // Check for page break needed
    if (ctx.currentY > ctx.pageHeight - margin.bottom - 20) {
      addNewPage(ctx);
    }

    // Headers
    if (line.startsWith('# ')) {
      currentListType = null;
      renderH1(ctx, line.slice(2));
    } else if (line.startsWith('## ')) {
      currentListType = null;
      renderH2(ctx, line.slice(3));
    } else if (line.startsWith('### ')) {
      currentListType = null;
      renderH3(ctx, line.slice(4));
    }
    // Lists
    else if (line.match(/^[\-\*] /)) {
      if (currentListType !== 'ul') {
        currentListType = 'ul';
        ctx.currentY += 2;
      }
      renderListItem(ctx, line.slice(2), 'bullet');
    }
    else if (line.match(/^\d+\. /)) {
      if (currentListType !== 'ol') {
        currentListType = 'ol';
        listItemNumber = 0;
        ctx.currentY += 2;
      }
      listItemNumber++;
      renderListItem(ctx, line.replace(/^\d+\. /, ''), 'number', listItemNumber);
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      currentListType = null;
      renderBlockquote(ctx, line.slice(2));
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      currentListType = null;
      renderHorizontalRule(ctx);
    }
    // Empty line
    else if (line.trim() === '') {
      currentListType = null;
      ctx.currentY += 4;
    }
    // Regular paragraph
    else if (line.trim()) {
      currentListType = null;
      renderParagraph(ctx, line);
    }
  }

  // Add footer section
  ctx.currentY += 20;
  if (ctx.currentY > ctx.pageHeight - margin.bottom - 40) {
    addNewPage(ctx);
  }

  // Footer divider
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(margin.left, ctx.currentY, margin.left + contentWidth, ctx.currentY);
  ctx.currentY += 10;

  // Generated with Memento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(139, 92, 246);
  doc.text('Generated with Memento AI', margin.left + contentWidth / 2, ctx.currentY, { align: 'center' });
  ctx.currentY += 6;

  // Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  const metaText = `${report.metadata.format} • ${report.metadata.tone} Tone • ${report.metadata.wordCount} words • ${report.metadata.sourceCount} sources`;
  doc.text(metaText, margin.left + contentWidth / 2, ctx.currentY, { align: 'center' });
}

/**
 * Render H1 heading
 */
function renderH1(ctx: PDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 8;

  // Add to TOC
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 1 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string, i: number) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 8;
  });

  // Underline
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.8);
  doc.line(margin.left, ctx.currentY, margin.left + Math.min(80, contentWidth), ctx.currentY);
  ctx.currentY += 8;
}

/**
 * Render H2 heading
 */
function renderH2(ctx: PDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 10;

  // Add to TOC
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 2 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string, i: number) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 7;
  });

  ctx.currentY += 3;
}

/**
 * Render H3 heading
 */
function renderH3(ctx: PDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 6;

  // Add to TOC
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 3 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(55, 65, 81);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string, i: number) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 6;
  });

  ctx.currentY += 2;
}

/**
 * Render paragraph
 */
function renderParagraph(ctx: PDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  // Process inline formatting (remove markdown syntax for PDF)
  let cleanText = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);

  const lines = doc.splitTextToSize(cleanText, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 10) {
      addNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 3;
}

/**
 * Render list item
 */
function renderListItem(ctx: PDFContext, text: string, type: 'bullet' | 'number', number?: number): void {
  const { doc, margin, contentWidth } = ctx;

  const indent = 8;
  const bulletX = margin.left + indent;
  const textX = margin.left + indent + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);

  // Bullet or number
  if (type === 'bullet') {
    doc.setFillColor(139, 92, 246);
    doc.circle(bulletX, ctx.currentY - 1.5, 1, 'F');
  } else {
    doc.setTextColor(139, 92, 246);
    doc.text(`${number}.`, bulletX - 2, ctx.currentY);
    doc.setTextColor(55, 65, 81);
  }

  // Text
  const lines = doc.splitTextToSize(text, contentWidth - indent - 8);
  lines.forEach((line: string, i: number) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 10) {
      addNewPage(ctx);
    }
    doc.text(line, i === 0 ? textX : textX, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 1;
}

/**
 * Render blockquote
 */
function renderBlockquote(ctx: PDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 3;

  // Left border
  doc.setFillColor(139, 92, 246);
  doc.rect(margin.left, ctx.currentY - 3, 2, 12, 'F');

  // Background
  doc.setFillColor(249, 250, 251);
  doc.rect(margin.left + 4, ctx.currentY - 5, contentWidth - 4, 14, 'F');

  // Text
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);

  const lines = doc.splitTextToSize(text, contentWidth - 16);
  lines.forEach((line: string) => {
    doc.text(line, margin.left + 8, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 5;
}

/**
 * Render horizontal rule
 */
function renderHorizontalRule(ctx: PDFContext): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 6;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(margin.left, ctx.currentY, margin.left + contentWidth, ctx.currentY);
  ctx.currentY += 8;
}

/**
 * Add a new page
 */
function addNewPage(ctx: PDFContext): void {
  ctx.doc.addPage();
  ctx.pageNumber++;
  ctx.currentY = ctx.margin.top;
}

/**
 * Add headers and footers to all pages
 */
function addHeadersAndFooters(ctx: PDFContext): void {
  const { doc, pageWidth, pageHeight, margin, options, report } = ctx;
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Skip cover page header/footer
    if (options.includeCoverPage && i === 1) continue;

    // Header line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin.left, 15, pageWidth - margin.right, 15);

    // Header text - document title (truncated)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const headerTitle = report.title.length > 50 ? report.title.substring(0, 47) + '...' : report.title;
    doc.text(headerTitle, margin.left, 12);

    // Header - Memento branding
    if (options.includeBranding) {
      doc.setTextColor(139, 92, 246);
      doc.text('Memento', pageWidth - margin.right, 12, { align: 'right' });
    }

    // Footer line
    doc.line(margin.left, pageHeight - 15, pageWidth - margin.right, pageHeight - 15);

    // Footer - page number
    doc.setTextColor(107, 114, 128);
    const pageText = `Page ${i - (options.includeCoverPage ? 1 : 0)} of ${totalPages - (options.includeCoverPage ? 1 : 0)}`;
    doc.text(pageText, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Footer - date
    const dateStr = new Date(report.metadata.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    doc.text(dateStr, pageWidth - margin.right, pageHeight - 10, { align: 'right' });
  }
}

/**
 * Download PDF directly
 */
export async function downloadReportPDF(
  report: GeneratedReport,
  options?: Partial<PDFGenerationOptions>
): Promise<void> {
  const blob = await generateProfessionalPDF(report, options);

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.title.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate pages for AI-generated images
 */
async function generateImagePages(ctx: PDFContext, images: ReportImage[]): Promise<void> {
  const { doc, margin, pageWidth, contentWidth } = ctx;

  if (images.length === 0) return;

  // Start a new page for images section
  addNewPage(ctx);

  // Section header
  ctx.currentY = margin.top;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);
  doc.text('Visual Appendix', margin.left, ctx.currentY);
  ctx.currentY += 8;

  // Underline
  doc.setDrawColor(139, 92, 246);
  doc.setLineWidth(0.8);
  doc.line(margin.left, ctx.currentY, margin.left + 50, ctx.currentY);
  ctx.currentY += 10;

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text('AI-generated visualizations to support the research findings', margin.left, ctx.currentY);
  ctx.currentY += 15;

  // Add TOC entry for visual appendix
  ctx.tocEntries.push({ title: 'Visual Appendix', page: ctx.pageNumber, level: 1 });

  // Render each image
  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    // Check if we need a new page (images are about 100mm tall + caption)
    if (ctx.currentY > ctx.pageHeight - margin.bottom - 130) {
      addNewPage(ctx);
      ctx.currentY = margin.top;
    }

    // Image number and type badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(55, 65, 81);
    doc.text(`Figure ${i + 1}: ${image.type.charAt(0).toUpperCase() + image.type.slice(1)}`, margin.left, ctx.currentY);
    ctx.currentY += 8;

    // Try to add the image
    if (image.base64) {
      try {
        // Calculate image dimensions (max width: contentWidth, max height: 90mm)
        const maxWidth = contentWidth;
        const maxHeight = 90;

        // Add image centered
        const imgX = margin.left;
        const imgY = ctx.currentY;

        doc.addImage(image.base64, 'PNG', imgX, imgY, maxWidth, maxHeight, undefined, 'MEDIUM');
        ctx.currentY += maxHeight + 5;
      } catch (e) {
        console.warn(`Could not add image ${i + 1} to PDF:`, e);
        // Draw placeholder
        doc.setFillColor(243, 244, 246);
        doc.rect(margin.left, ctx.currentY, contentWidth, 60, 'F');
        doc.setTextColor(156, 163, 175);
        doc.setFontSize(10);
        doc.text('Image could not be loaded', margin.left + contentWidth / 2, ctx.currentY + 30, { align: 'center' });
        ctx.currentY += 65;
      }
    } else if (image.url) {
      // Draw placeholder with URL reference
      doc.setFillColor(243, 244, 246);
      doc.rect(margin.left, ctx.currentY, contentWidth, 40, 'F');
      doc.setTextColor(139, 92, 246);
      doc.setFontSize(9);
      doc.text('View image online (base64 not available)', margin.left + contentWidth / 2, ctx.currentY + 20, { align: 'center' });
      ctx.currentY += 45;
    }

    // Caption
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    const captionLines = doc.splitTextToSize(image.caption, contentWidth);
    captionLines.forEach((line: string) => {
      doc.text(line, margin.left, ctx.currentY);
      ctx.currentY += 4;
    });

    ctx.currentY += 10; // Space before next image
  }
}

// =============================================================================
// HANDBOOK PDF GENERATION
// =============================================================================

interface HandbookPDFContext {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;
  currentY: number;
  pageNumber: number;
  handbook: GeneratedHandbook;
  tocEntries: { title: string; page: number; level: number }[];
}

/**
 * Convert LaTeX formulas to readable plain text for PDF rendering
 */
function cleanLatexForPDF(text: string): string {
  let cleaned = text;

  // Remove display math delimiters and convert to readable format
  cleaned = cleaned.replace(/\\\[/g, '');
  cleaned = cleaned.replace(/\\\]/g, '');
  cleaned = cleaned.replace(/\$\$/g, '');
  cleaned = cleaned.replace(/\$/g, '');

  // Handle common LaTeX commands - convert to readable text
  cleaned = cleaned.replace(/\\mathcal\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\mathbb\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\textbf\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\textit\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\hat\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\bar\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\vec\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\tilde\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\boldsymbol\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\bm\{([^}]+)\}/g, '$1');

  // Handle underbrace with label - extract the content and label
  cleaned = cleaned.replace(/\\underbrace\{([^}]+)\}_\{([^}]+)\}/g, '[$1 ($2)]');
  cleaned = cleaned.replace(/\\underbrace\{([^}]+)\}\{([^}]+)\}/g, '[$1 ($2)]');
  cleaned = cleaned.replace(/\\overbrace\{([^}]+)\}\^\{([^}]+)\}/g, '[$1 ($2)]');

  // Handle fractions
  cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
  cleaned = cleaned.replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
  cleaned = cleaned.replace(/\\tfrac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');

  // Handle subscripts and superscripts
  cleaned = cleaned.replace(/(\w+)_\{([^}]+)\}/g, '$1_$2');
  cleaned = cleaned.replace(/(\w+)\^\{([^}]+)\}/g, '$1^$2');
  cleaned = cleaned.replace(/_\{([^}]+)\}/g, '_$1');
  cleaned = cleaned.replace(/\^\{([^}]+)\}/g, '^$1');

  // Handle square roots
  cleaned = cleaned.replace(/\\sqrt\[(\d+)\]\{([^}]+)\}/g, '($1-root of $2)');
  cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');

  // Handle limits, sums, integrals
  cleaned = cleaned.replace(/\\lim_\{([^}]+)\}/g, 'lim($1)');
  cleaned = cleaned.replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, 'sum from $1 to $2 of');
  cleaned = cleaned.replace(/\\sum/g, 'Σ');
  cleaned = cleaned.replace(/\\prod/g, 'Π');
  cleaned = cleaned.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, 'integral from $1 to $2 of');
  cleaned = cleaned.replace(/\\int/g, '∫');

  // Greek letters (common ones)
  cleaned = cleaned.replace(/\\alpha/g, 'α');
  cleaned = cleaned.replace(/\\beta/g, 'β');
  cleaned = cleaned.replace(/\\gamma/g, 'γ');
  cleaned = cleaned.replace(/\\delta/g, 'δ');
  cleaned = cleaned.replace(/\\epsilon/g, 'ε');
  cleaned = cleaned.replace(/\\varepsilon/g, 'ε');
  cleaned = cleaned.replace(/\\zeta/g, 'ζ');
  cleaned = cleaned.replace(/\\eta/g, 'η');
  cleaned = cleaned.replace(/\\theta/g, 'θ');
  cleaned = cleaned.replace(/\\iota/g, 'ι');
  cleaned = cleaned.replace(/\\kappa/g, 'κ');
  cleaned = cleaned.replace(/\\lambda/g, 'λ');
  cleaned = cleaned.replace(/\\mu/g, 'μ');
  cleaned = cleaned.replace(/\\nu/g, 'ν');
  cleaned = cleaned.replace(/\\xi/g, 'ξ');
  cleaned = cleaned.replace(/\\pi/g, 'π');
  cleaned = cleaned.replace(/\\rho/g, 'ρ');
  cleaned = cleaned.replace(/\\sigma/g, 'σ');
  cleaned = cleaned.replace(/\\tau/g, 'τ');
  cleaned = cleaned.replace(/\\upsilon/g, 'υ');
  cleaned = cleaned.replace(/\\phi/g, 'φ');
  cleaned = cleaned.replace(/\\varphi/g, 'φ');
  cleaned = cleaned.replace(/\\chi/g, 'χ');
  cleaned = cleaned.replace(/\\psi/g, 'ψ');
  cleaned = cleaned.replace(/\\omega/g, 'ω');
  cleaned = cleaned.replace(/\\Gamma/g, 'Γ');
  cleaned = cleaned.replace(/\\Delta/g, 'Δ');
  cleaned = cleaned.replace(/\\Theta/g, 'Θ');
  cleaned = cleaned.replace(/\\Lambda/g, 'Λ');
  cleaned = cleaned.replace(/\\Xi/g, 'Ξ');
  cleaned = cleaned.replace(/\\Pi/g, 'Π');
  cleaned = cleaned.replace(/\\Sigma/g, 'Σ');
  cleaned = cleaned.replace(/\\Phi/g, 'Φ');
  cleaned = cleaned.replace(/\\Psi/g, 'Ψ');
  cleaned = cleaned.replace(/\\Omega/g, 'Ω');

  // Mathematical operators and symbols
  cleaned = cleaned.replace(/\\cdot/g, '·');
  cleaned = cleaned.replace(/\\times/g, '×');
  cleaned = cleaned.replace(/\\div/g, '÷');
  cleaned = cleaned.replace(/\\pm/g, '±');
  cleaned = cleaned.replace(/\\mp/g, '∓');
  cleaned = cleaned.replace(/\\leq/g, '≤');
  cleaned = cleaned.replace(/\\geq/g, '≥');
  cleaned = cleaned.replace(/\\neq/g, '≠');
  cleaned = cleaned.replace(/\\approx/g, '≈');
  cleaned = cleaned.replace(/\\equiv/g, '≡');
  cleaned = cleaned.replace(/\\sim/g, '~');
  cleaned = cleaned.replace(/\\propto/g, '∝');
  cleaned = cleaned.replace(/\\infty/g, '∞');
  cleaned = cleaned.replace(/\\partial/g, '∂');
  cleaned = cleaned.replace(/\\nabla/g, '∇');
  cleaned = cleaned.replace(/\\forall/g, '∀');
  cleaned = cleaned.replace(/\\exists/g, '∃');
  cleaned = cleaned.replace(/\\in/g, '∈');
  cleaned = cleaned.replace(/\\notin/g, '∉');
  cleaned = cleaned.replace(/\\subset/g, '⊂');
  cleaned = cleaned.replace(/\\supset/g, '⊃');
  cleaned = cleaned.replace(/\\cup/g, '∪');
  cleaned = cleaned.replace(/\\cap/g, '∩');
  cleaned = cleaned.replace(/\\implies/g, '⟹');
  cleaned = cleaned.replace(/\\Rightarrow/g, '⟹');
  cleaned = cleaned.replace(/\\Leftarrow/g, '⟸');
  cleaned = cleaned.replace(/\\Leftrightarrow/g, '⟺');
  cleaned = cleaned.replace(/\\rightarrow/g, '→');
  cleaned = cleaned.replace(/\\leftarrow/g, '←');
  cleaned = cleaned.replace(/\\to/g, '→');
  cleaned = cleaned.replace(/\\mapsto/g, '↦');

  // Special spacing and formatting
  cleaned = cleaned.replace(/\\quad/g, '  ');
  cleaned = cleaned.replace(/\\qquad/g, '    ');
  cleaned = cleaned.replace(/\\,/g, ' ');
  cleaned = cleaned.replace(/\\;/g, ' ');
  cleaned = cleaned.replace(/\\:/g, ' ');
  cleaned = cleaned.replace(/\\!/g, '');
  cleaned = cleaned.replace(/\\ /g, ' ');
  cleaned = cleaned.replace(/\\&/g, '&');

  // Handle left/right delimiters
  cleaned = cleaned.replace(/\\left\(/g, '(');
  cleaned = cleaned.replace(/\\right\)/g, ')');
  cleaned = cleaned.replace(/\\left\[/g, '[');
  cleaned = cleaned.replace(/\\right\]/g, ']');
  cleaned = cleaned.replace(/\\left\{/g, '{');
  cleaned = cleaned.replace(/\\right\}/g, '}');
  cleaned = cleaned.replace(/\\left\|/g, '|');
  cleaned = cleaned.replace(/\\right\|/g, '|');
  cleaned = cleaned.replace(/\\left\./g, '');
  cleaned = cleaned.replace(/\\right\./g, '');
  cleaned = cleaned.replace(/\\langle/g, '⟨');
  cleaned = cleaned.replace(/\\rangle/g, '⟩');

  // Functions
  cleaned = cleaned.replace(/\\sin/g, 'sin');
  cleaned = cleaned.replace(/\\cos/g, 'cos');
  cleaned = cleaned.replace(/\\tan/g, 'tan');
  cleaned = cleaned.replace(/\\log/g, 'log');
  cleaned = cleaned.replace(/\\ln/g, 'ln');
  cleaned = cleaned.replace(/\\exp/g, 'exp');
  cleaned = cleaned.replace(/\\min/g, 'min');
  cleaned = cleaned.replace(/\\max/g, 'max');
  cleaned = cleaned.replace(/\\arg/g, 'arg');

  // Handle textsc (small caps) and other text formatting
  cleaned = cleaned.replace(/\\textsc\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\texttt\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\emph\{([^}]+)\}/g, '$1');
  cleaned = cleaned.replace(/\\underline\{([^}]+)\}/g, '$1');

  // Remove remaining backslash commands
  cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

  // Clean up curly braces
  cleaned = cleaned.replace(/\{/g, '');
  cleaned = cleaned.replace(/\}/g, '');

  // Fix letter-spaced text patterns (e.g., "h u m a n" -> "human")
  // Detect sequences of single letters separated by single spaces (3+ letters)
  cleaned = cleaned.replace(/\b((?:[a-zA-Z] ){2,}[a-zA-Z])\b/g, (match) => {
    // Join single-spaced letters into a word
    return match.replace(/ /g, '');
  });

  // Clean up multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Clean up empty brackets
  cleaned = cleaned.replace(/\[\s*\]/g, '');
  cleaned = cleaned.replace(/\(\s*\)/g, '');

  return cleaned.trim();
}

/**
 * Get theme colors based on handbook format
 */
function getHandbookThemeColors(format: string): { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] } {
  switch (format) {
    case 'Study Guide':
      return { primary: [59, 130, 246], accent: [96, 165, 250], bg: [239, 246, 255] }; // Blue
    case 'Cheatsheet':
      return { primary: [245, 158, 11], accent: [251, 191, 36], bg: [255, 251, 235] }; // Amber
    case 'Briefing':
      return { primary: [139, 92, 246], accent: [167, 139, 250], bg: [245, 243, 255] }; // Purple
    case 'Comprehensive':
      return { primary: [16, 185, 129], accent: [52, 211, 153], bg: [236, 253, 245] }; // Emerald
    default:
      return { primary: [139, 92, 246], accent: [167, 139, 250], bg: [249, 250, 251] }; // Default purple
  }
}

/**
 * Generate a professional PDF from a handbook
 */
export async function generateHandbookPDF(handbook: GeneratedHandbook): Promise<Blob> {
  // Create PDF document (A4 size)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = { top: 25, right: 20, bottom: 25, left: 20 };

  const ctx: HandbookPDFContext = {
    doc,
    pageWidth,
    pageHeight,
    margin,
    contentWidth: pageWidth - margin.left - margin.right,
    currentY: margin.top,
    pageNumber: 1,
    handbook,
    tocEntries: [],
  };

  // Generate cover page
  await generateHandbookCoverPage(ctx);
  addHandbookNewPage(ctx);

  // Reserve page for TOC
  const tocPageStart = ctx.pageNumber;
  ctx.currentY = margin.top;
  addHandbookNewPage(ctx);

  // Generate main content
  await generateHandbookMainContent(ctx);

  // Go back and fill in TOC
  if (ctx.tocEntries.length > 0) {
    generateHandbookTableOfContents(ctx, tocPageStart);
  }

  // Add page numbers and headers to all pages
  addHandbookHeadersAndFooters(ctx);

  // Return as Blob
  return doc.output('blob');
}

/**
 * Generate handbook cover page
 */
async function generateHandbookCoverPage(ctx: HandbookPDFContext): Promise<void> {
  const { doc, pageWidth, pageHeight, handbook } = ctx;
  const centerX = pageWidth / 2;
  const colors = getHandbookThemeColors(handbook.format);

  // Dark background
  doc.setFillColor(11, 14, 19);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Colored accent bar at top
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(0, 0, pageWidth, 8, 'F');

  // Draw Memento logo
  drawMementoLogo(doc, centerX, 45, 30, [255, 255, 255]);

  // Company name
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text('Memento AI', centerX, 75, { align: 'center' });

  // Main title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);

  const titleLines = doc.splitTextToSize(handbook.title, pageWidth - 40);
  let titleY = 110;
  titleLines.forEach((line: string, i: number) => {
    doc.text(line, centerX, titleY + (i * 12), { align: 'center' });
  });

  // Subtitle/Custom prompt if provided
  if (handbook.metadata.customPrompt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(156, 163, 175);
    const subtitleLines = doc.splitTextToSize(handbook.metadata.customPrompt.substring(0, 200), pageWidth - 60);
    let subtitleY = titleY + (titleLines.length * 12) + 20;
    subtitleLines.slice(0, 3).forEach((line: string, i: number) => {
      doc.text(line, centerX, subtitleY + (i * 6), { align: 'center' });
    });
  }

  // Format badge
  const badgeY = 180;
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  const badgeText = handbook.format;
  const badgeWidth = doc.getTextWidth(badgeText) + 20;
  doc.roundedRect(centerX - badgeWidth / 2, badgeY - 5, badgeWidth, 12, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, centerX, badgeY + 3, { align: 'center' });

  // Length badge
  const lengthY = badgeY + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(156, 163, 175);
  doc.text(handbook.length, centerX, lengthY, { align: 'center' });

  // Bottom section with metadata
  const bottomY = pageHeight - 50;

  // Horizontal line
  doc.setDrawColor(75, 85, 99);
  doc.setLineWidth(0.3);
  doc.line(40, bottomY - 15, pageWidth - 40, bottomY - 15);

  // Metadata row
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175);

  const metaItems = [
    `${handbook.metadata.sourceCount} Sources`,
    `${handbook.metadata.wordCount.toLocaleString()} Words`,
    `~${handbook.metadata.pageEstimate} Pages`,
  ];

  const metaSpacing = (pageWidth - 80) / (metaItems.length - 1);
  metaItems.forEach((item, i) => {
    doc.text(item, 40 + (i * metaSpacing), bottomY, { align: i === 0 ? 'left' : i === metaItems.length - 1 ? 'right' : 'center' });
  });

  // Date
  const dateStr = new Date(handbook.metadata.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  doc.text(dateStr, centerX, bottomY + 10, { align: 'center' });
}

/**
 * Generate handbook table of contents
 */
function generateHandbookTableOfContents(ctx: HandbookPDFContext, tocPage: number): void {
  const { doc, margin, contentWidth, handbook } = ctx;
  const colors = getHandbookThemeColors(handbook.format);

  doc.setPage(tocPage);
  let y = margin.top;

  // TOC Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(26, 26, 26);
  doc.text('Table of Contents', margin.left, y);
  y += 15;

  // Colored underline
  doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setLineWidth(0.5);
  doc.line(margin.left, y, margin.left + 50, y);
  y += 15;

  // TOC entries
  doc.setFont('helvetica', 'normal');

  for (const entry of ctx.tocEntries) {
    const indent = (entry.level - 1) * 8;
    const fontSize = entry.level === 1 ? 11 : 10;
    const isBold = entry.level === 1;

    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(entry.level === 1 ? 26 : 74, entry.level === 1 ? 26 : 74, entry.level === 1 ? 26 : 74);

    const titleX = margin.left + indent;
    const titleText = entry.title.length > 60 ? entry.title.substring(0, 57) + '...' : entry.title;
    doc.text(titleText, titleX, y);

    // Page number
    doc.setTextColor(107, 114, 128);
    doc.text(String(entry.page), margin.left + contentWidth, y, { align: 'right' });

    // Dotted line
    const titleWidth = doc.getTextWidth(titleText);
    const pageNumWidth = doc.getTextWidth(String(entry.page));
    const dotsStart = titleX + titleWidth + 3;
    const dotsEnd = margin.left + contentWidth - pageNumWidth - 3;

    if (dotsEnd > dotsStart) {
      doc.setDrawColor(200, 200, 200);
      doc.setLineDashPattern([1, 2], 0);
      doc.line(dotsStart, y, dotsEnd, y);
      doc.setLineDashPattern([], 0);
    }

    y += entry.level === 1 ? 8 : 6;

    if (y > ctx.pageHeight - margin.bottom - 20) {
      break;
    }
  }
}

/**
 * Generate handbook main content
 */
async function generateHandbookMainContent(ctx: HandbookPDFContext): Promise<void> {
  const { doc, margin, contentWidth, handbook } = ctx;
  const colors = getHandbookThemeColors(handbook.format);

  doc.setFillColor(255, 255, 255);
  ctx.currentY = margin.top;

  const lines = handbook.content.split('\n');
  let currentListType: 'ul' | 'ol' | null = null;
  let listItemNumber = 0;

  for (const line of lines) {
    // Check for page break
    if (ctx.currentY > ctx.pageHeight - margin.bottom - 20) {
      addHandbookNewPage(ctx);
    }

    // H1 Headers
    if (line.startsWith('# ')) {
      currentListType = null;
      renderHandbookH1(ctx, line.slice(2), colors);
    }
    // H2 Headers
    else if (line.startsWith('## ')) {
      currentListType = null;
      renderHandbookH2(ctx, line.slice(3), colors);
    }
    // H3 Headers
    else if (line.startsWith('### ')) {
      currentListType = null;
      renderHandbookH3(ctx, line.slice(4), colors);
    }
    // H4 Headers
    else if (line.startsWith('#### ')) {
      currentListType = null;
      renderHandbookH4(ctx, line.slice(5));
    }
    // Unordered lists
    else if (line.match(/^[\-\*] /)) {
      if (currentListType !== 'ul') {
        currentListType = 'ul';
        ctx.currentY += 2;
      }
      renderHandbookListItem(ctx, line.slice(2), 'bullet', colors);
    }
    // Ordered lists
    else if (line.match(/^\d+\. /)) {
      if (currentListType !== 'ol') {
        currentListType = 'ol';
        listItemNumber = 0;
        ctx.currentY += 2;
      }
      listItemNumber++;
      renderHandbookListItem(ctx, line.replace(/^\d+\. /, ''), 'number', colors, listItemNumber);
    }
    // Blockquote
    else if (line.startsWith('> ')) {
      currentListType = null;
      renderHandbookBlockquote(ctx, line.slice(2), colors);
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      currentListType = null;
      renderHandbookHorizontalRule(ctx);
    }
    // Empty line
    else if (line.trim() === '') {
      currentListType = null;
      ctx.currentY += 4;
    }
    // Regular paragraph
    else if (line.trim()) {
      currentListType = null;
      renderHandbookParagraph(ctx, line);
    }
  }

  // Footer section
  ctx.currentY += 20;
  if (ctx.currentY > ctx.pageHeight - margin.bottom - 40) {
    addHandbookNewPage(ctx);
  }

  // Footer divider
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(margin.left, ctx.currentY, margin.left + contentWidth, ctx.currentY);
  ctx.currentY += 10;

  // Generated with Memento
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.text('Generated with Memento AI', margin.left + contentWidth / 2, ctx.currentY, { align: 'center' });
  ctx.currentY += 6;

  // Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  const metaText = `${handbook.format} • ${handbook.metadata.wordCount.toLocaleString()} words • ${handbook.metadata.sourceCount} sources`;
  doc.text(metaText, margin.left + contentWidth / 2, ctx.currentY, { align: 'center' });
}

/**
 * Render handbook H1 heading
 */
function renderHandbookH1(ctx: HandbookPDFContext, text: string, colors: { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] }): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 8;
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 1 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(17, 24, 39);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 8;
  });

  // Colored underline
  doc.setDrawColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.setLineWidth(0.8);
  doc.line(margin.left, ctx.currentY, margin.left + Math.min(80, contentWidth), ctx.currentY);
  ctx.currentY += 8;
}

/**
 * Render handbook H2 heading
 */
function renderHandbookH2(ctx: HandbookPDFContext, text: string, colors: { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] }): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 10;
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 2 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(31, 41, 55);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 7;
  });

  ctx.currentY += 3;
}

/**
 * Render handbook H3 heading
 */
function renderHandbookH3(ctx: HandbookPDFContext, text: string, colors: { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] }): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 6;
  ctx.tocEntries.push({ title: text, page: ctx.pageNumber, level: 3 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(55, 65, 81);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 6;
  });

  ctx.currentY += 2;
}

/**
 * Render handbook H4 heading
 */
function renderHandbookH4(ctx: HandbookPDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);

  const lines = doc.splitTextToSize(text, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 15) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 2;
}

/**
 * Render handbook paragraph
 */
function renderHandbookParagraph(ctx: HandbookPDFContext, text: string): void {
  const { doc, margin, contentWidth } = ctx;

  // Clean markdown syntax and LaTeX formulas
  let cleanText = text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');

  // Clean LaTeX formulas for readable text
  cleanText = cleanLatexForPDF(cleanText);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);

  const lines = doc.splitTextToSize(cleanText, contentWidth);
  lines.forEach((line: string) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 10) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, margin.left, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 3;
}

/**
 * Render handbook list item
 */
function renderHandbookListItem(ctx: HandbookPDFContext, text: string, type: 'bullet' | 'number', colors: { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] }, number?: number): void {
  const { doc, margin, contentWidth } = ctx;

  const indent = 8;
  const bulletX = margin.left + indent;
  const textX = margin.left + indent + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);

  if (type === 'bullet') {
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.circle(bulletX, ctx.currentY - 1.5, 1, 'F');
  } else {
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text(`${number}.`, bulletX - 2, ctx.currentY);
    doc.setTextColor(55, 65, 81);
  }

  // Clean text and LaTeX formulas
  let cleanText = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
  cleanText = cleanLatexForPDF(cleanText);

  const lines = doc.splitTextToSize(cleanText, contentWidth - indent - 8);
  lines.forEach((line: string, i: number) => {
    if (ctx.currentY > ctx.pageHeight - ctx.margin.bottom - 10) {
      addHandbookNewPage(ctx);
    }
    doc.text(line, i === 0 ? textX : textX, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 1;
}

/**
 * Render handbook blockquote
 */
function renderHandbookBlockquote(ctx: HandbookPDFContext, text: string, colors: { primary: [number, number, number], accent: [number, number, number], bg: [number, number, number] }): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 3;

  // Left border with theme color
  doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
  doc.rect(margin.left, ctx.currentY - 3, 2, 12, 'F');

  // Background
  doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
  doc.rect(margin.left + 4, ctx.currentY - 5, contentWidth - 4, 14, 'F');

  // Text
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(75, 85, 99);

  const lines = doc.splitTextToSize(text, contentWidth - 16);
  lines.forEach((line: string) => {
    doc.text(line, margin.left + 8, ctx.currentY);
    ctx.currentY += 5;
  });

  ctx.currentY += 5;
}

/**
 * Render handbook horizontal rule
 */
function renderHandbookHorizontalRule(ctx: HandbookPDFContext): void {
  const { doc, margin, contentWidth } = ctx;

  ctx.currentY += 6;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(margin.left, ctx.currentY, margin.left + contentWidth, ctx.currentY);
  ctx.currentY += 8;
}

/**
 * Add a new page for handbook
 */
function addHandbookNewPage(ctx: HandbookPDFContext): void {
  ctx.doc.addPage();
  ctx.pageNumber++;
  ctx.currentY = ctx.margin.top;
}

/**
 * Add headers and footers to handbook pages
 */
function addHandbookHeadersAndFooters(ctx: HandbookPDFContext): void {
  const { doc, pageWidth, pageHeight, margin, handbook } = ctx;
  const totalPages = doc.getNumberOfPages();
  const colors = getHandbookThemeColors(handbook.format);

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Skip cover page
    if (i === 1) continue;

    // Header line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.2);
    doc.line(margin.left, 15, pageWidth - margin.right, 15);

    // Header text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const headerTitle = handbook.title.length > 50 ? handbook.title.substring(0, 47) + '...' : handbook.title;
    doc.text(headerTitle, margin.left, 12);

    // Memento branding
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text('Memento', pageWidth - margin.right, 12, { align: 'right' });

    // Footer line
    doc.line(margin.left, pageHeight - 15, pageWidth - margin.right, pageHeight - 15);

    // Footer - page number
    doc.setTextColor(107, 114, 128);
    const pageText = `Page ${i - 1} of ${totalPages - 1}`;
    doc.text(pageText, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Footer - format badge
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.text(handbook.format, pageWidth - margin.right, pageHeight - 10, { align: 'right' });
  }
}

/**
 * Download handbook PDF directly
 */
export async function downloadHandbookPDF(handbook: GeneratedHandbook): Promise<void> {
  const blob = await generateHandbookPDF(handbook);

  // Create download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${handbook.title.replace(/[^a-zA-Z0-9]/g, '_')}_${handbook.format.replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
