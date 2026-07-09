/**
 * Professional PDF Styles Library
 * Inspired by markdown-pdf-styles (Apache-2.0)
 * https://github.com/hanggrian/markdown-pdf-styles
 * 
 * These styles are used for HTML-to-PDF generation via browser print
 * and can be applied when generating shareable/printable documents.
 */

// ============================================================================
// TYPES
// ============================================================================

export type PDFDocumentStyle = 
  | 'standard'      // Memento default
  | 'ieee'          // IEEE Academic (double-column, serif)
  | 'apa'           // APA Academic (double-spaced, indented)
  | 'report'        // Classic Report (serif, cover page style)
  | 'letter'        // Business Letter
  | 'resume'        // Clean Resume
  | 'cheatsheet'    // Compact multi-column
  | 'modern';       // Modern sans-serif

export interface PDFStylePreset {
  id: PDFDocumentStyle;
  name: string;
  description: string;
  icon: string; // Emoji for UI
  category: 'default' | 'academic' | 'professional' | 'compact';
  css: string;
  printCss: string;
}

// ============================================================================
// BASE STYLES (shared across all presets)
// ============================================================================

const BASE_RESET = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  @page {
    size: A4;
    margin: 1in;
  }
`;

const BASE_TYPOGRAPHY = `
  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }
  
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
  }
  
  p, li, blockquote {
    orphans: 3;
    widows: 3;
  }
  
  pre, code, table, figure {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  img {
    max-width: 100%;
    height: auto;
  }
  
  a {
    color: inherit;
    text-decoration: none;
  }
  
  /* Code blocks */
  pre {
    background: #f5f5f5;
    border-radius: 4px;
    padding: 12px;
    overflow-x: auto;
  }
  
  code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 0.9em;
  }
  
  pre code {
    display: block;
    line-height: 1.5;
  }
  
  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
  }
  
  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }
  
  th {
    background: #f5f5f5;
    font-weight: 600;
  }
  
  /* Blockquotes */
  blockquote {
    border-left: 4px solid #ddd;
    padding-left: 16px;
    margin: 1em 0;
    color: #555;
    font-style: italic;
  }
  
  /* Lists */
  ul, ol {
    padding-left: 1.5em;
    margin: 1em 0;
  }
  
  li {
    margin: 0.25em 0;
  }
  
  /* Horizontal rules */
  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 2em 0;
  }
`;

// ============================================================================
// STANDARD (Memento Default)
// ============================================================================

const STANDARD_STYLE: PDFStylePreset = {
  id: 'standard',
  name: 'Memento Standard',
  description: 'Clean, modern styling with Memento branding',
  icon: '📄',
  category: 'default',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #0f0f0f;
    }
    
    h1 { font-size: 24pt; border-bottom: 2px solid #8B5CF6; padding-bottom: 0.3em; }
    h2 { font-size: 18pt; color: #1f2937; }
    h3 { font-size: 14pt; color: #374151; }
    h4 { font-size: 12pt; color: #4b5563; }
    
    p {
      margin: 1em 0;
      text-align: justify;
    }
    
    strong { font-weight: 600; }
    em { font-style: italic; }
    
    ${BASE_TYPOGRAPHY}
    
    /* Memento accent colors */
    a { color: #8B5CF6; }
    blockquote { border-left-color: #8B5CF6; }
    th { background: #f3f0ff; }
  `,
  printCss: `
    @media print {
      body { padding: 0; }
      @page { margin: 0.75in; }
    }
  `
};

// ============================================================================
// IEEE ACADEMIC
// ============================================================================

const IEEE_STYLE: PDFStylePreset = {
  id: 'ieee',
  name: 'IEEE Academic',
  description: 'Double-column academic format with serif fonts',
  icon: '📚',
  category: 'academic',
  css: `
    ${BASE_RESET}
    
    body {
      font-family: 'Times New Roman', 'Georgia', serif;
      font-size: 10pt;
      line-height: 1.0;
      color: #000;
      padding: 0;
      column-count: 2;
      column-gap: 0.25in;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Times New Roman', serif;
      column-span: all;
    }
    
    h1 {
      font-size: 24pt;
      font-weight: normal;
      text-align: center;
      margin-bottom: 0.5em;
    }
    
    h2 {
      font-size: 12pt;
      font-weight: normal;
      font-variant: small-caps;
      text-align: center;
      margin-top: 1em;
      margin-bottom: 0.5em;
    }
    
    h3, h4, h5, h6 {
      font-size: 10pt;
      font-style: italic;
      font-weight: normal;
      margin-top: 0.8em;
      margin-bottom: 0.3em;
    }
    
    p {
      text-align: justify;
      text-indent: 0.2in;
      margin: 0;
    }
    
    p:first-of-type,
    h1 + p, h2 + p, h3 + p, h4 + p {
      text-indent: 0;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* IEEE-specific overrides */
    pre, code {
      font-family: 'Courier New', monospace;
      font-size: 8pt;
      line-height: 1.1;
    }
    
    pre {
      padding: 4pt;
    }
    
    blockquote {
      font-style: normal;
      margin-left: 0.2in;
      margin-right: 0.2in;
    }
    
    /* Abstract styling */
    .abstract {
      font-style: italic;
      font-weight: bold;
      column-span: all;
      margin-bottom: 1em;
    }
    
    /* References section */
    .references {
      font-size: 8pt;
    }
    
    .references ol {
      padding-left: 0;
      list-style: none;
      counter-reset: ref;
    }
    
    .references li {
      counter-increment: ref;
      padding-left: 1.5em;
      text-indent: -1.5em;
      margin-bottom: 0.25em;
    }
    
    .references li::before {
      content: "[" counter(ref) "] ";
    }
    
    img {
      display: block;
      margin: 1em auto;
    }
    
    figure {
      text-align: center;
      margin: 1em 0;
    }
    
    figcaption {
      font-size: 8pt;
      margin-top: 0.5em;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 0.75in 0.625in; }
      body { column-count: 2; }
    }
  `
};

// ============================================================================
// APA ACADEMIC
// ============================================================================

const APA_STYLE: PDFStylePreset = {
  id: 'apa',
  name: 'APA 7th Edition',
  description: 'Double-spaced academic format with hanging indents',
  icon: '🎓',
  category: 'academic',
  css: `
    ${BASE_RESET}
    
    body {
      font-family: 'Times New Roman', 'Georgia', serif;
      font-size: 12pt;
      line-height: 2.0;
      color: #000;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      font-weight: bold;
      line-height: 2.0;
      margin: 0;
    }
    
    h1 {
      text-align: center;
      margin-top: 0;
    }
    
    h2 {
      text-align: center;
    }
    
    h3 {
      text-align: left;
      font-style: italic;
    }
    
    h4 {
      text-indent: 0.5in;
      font-style: italic;
    }
    
    h5 {
      text-indent: 0.5in;
      font-style: italic;
      font-weight: normal;
    }
    
    p {
      text-align: left;
      text-indent: 0.5in;
      margin: 0;
    }
    
    /* First paragraph after heading - no indent */
    h1 + p, h2 + p, h3 + p, h4 + p, h5 + p {
      text-indent: 0.5in;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* APA-specific overrides */
    pre, code {
      font-family: 'Lucida Console', 'Courier New', monospace;
      font-size: 10pt;
      line-height: 1.15;
    }
    
    blockquote {
      text-indent: 0;
      margin: 0 0.5in;
      font-style: normal;
    }
    
    /* Block quotes over 40 words */
    blockquote p {
      text-indent: 0;
      text-align: left;
    }
    
    /* Title page styles */
    .title {
      text-align: center;
      font-weight: bold;
      margin-top: 3in;
    }
    
    .subtitle {
      text-align: center;
      margin-top: 2em;
      page-break-after: always;
    }
    
    /* Abstract */
    .abstract {
      text-indent: 0;
    }
    
    .abstract p {
      text-indent: 0;
    }
    
    /* References - hanging indent */
    .references p {
      text-indent: -0.5in;
      margin-left: 0.5in;
      text-align: left;
    }
    
    /* Figures */
    figure {
      margin: 1em 0;
    }
    
    figcaption {
      font-size: 10pt;
      font-style: italic;
      margin-top: 0.5em;
    }
    
    /* Running header would go here in @page */
  `,
  printCss: `
    @media print {
      @page { margin: 1in; }
      body { line-height: 2.0; }
    }
  `
};

// ============================================================================
// CLASSIC REPORT
// ============================================================================

const REPORT_STYLE: PDFStylePreset = {
  id: 'report',
  name: 'Professional Report',
  description: 'Classic serif styling for formal reports',
  icon: '📋',
  category: 'professional',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
    
    body {
      font-family: 'Noto Serif', 'Georgia', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Noto Serif', serif;
      font-weight: 700;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #000;
    }
    
    h1 {
      font-size: 28pt;
      text-align: center;
      margin-top: 0;
      margin-bottom: 0.3em;
      border-bottom: none;
    }
    
    h2 {
      font-size: 16pt;
      padding-bottom: 0.2em;
      border-bottom: 1px solid #ddd;
    }
    
    h3 { font-size: 14pt; }
    h4 { font-size: 12pt; }
    
    p {
      text-align: justify;
      margin: 1em 0;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* Report-specific styles */
    .title {
      font-size: 28pt;
      text-align: center;
      margin-top: 2in;
      margin-bottom: 0.5em;
    }
    
    .subtitle {
      font-size: 16pt;
      text-align: center;
      color: #555;
      margin-top: 0.5em;
      margin-bottom: 1in;
    }
    
    .attributions {
      text-align: center;
      font-size: 12pt;
      line-height: 2.0;
      margin-bottom: 2in;
    }
    
    /* Table of contents */
    .toc {
      page-break-after: always;
    }
    
    .toc h2 {
      text-align: center;
      border-bottom: none;
    }
    
    .toc ul {
      list-style: none;
      padding-left: 0;
    }
    
    .toc li {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dotted #ccc;
      padding: 0.5em 0;
    }
    
    code {
      font-family: 'JetBrains Mono', monospace;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 1in; }
      .title { margin-top: 3in; }
    }
  `
};

// ============================================================================
// BUSINESS LETTER
// ============================================================================

const LETTER_STYLE: PDFStylePreset = {
  id: 'letter',
  name: 'Business Letter',
  description: 'Formal business correspondence format',
  icon: '✉️',
  category: 'professional',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700&display=swap');
    
    body {
      font-family: 'Noto Serif', 'Georgia', serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Noto Serif', serif;
    }
    
    h1 {
      font-size: 20pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 0.5em;
    }
    
    p {
      margin: 1em 0;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* Letter-specific styles */
    .sender {
      font-weight: bold;
      font-size: 20pt;
      text-align: center;
      margin-bottom: 1em;
    }
    
    .contact {
      text-align: center;
      line-height: 1.5;
      margin: 1em 0 2em 0;
      color: #555;
    }
    
    .date {
      margin: 2em 0;
    }
    
    .recipient {
      line-height: 1.5;
      margin: 1.5em 0;
    }
    
    .salutation {
      margin: 1.5em 0 1em 0;
    }
    
    .body p {
      text-indent: 0;
      margin: 1em 0;
    }
    
    .closing {
      margin-top: 2em;
    }
    
    .signature {
      margin-top: 3em;
      font-style: italic;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 1in 1.25in; }
    }
  `
};

// ============================================================================
// RESUME
// ============================================================================

const RESUME_STYLE: PDFStylePreset = {
  id: 'resume',
  name: 'Clean Resume',
  description: 'Professional CV/Resume layout',
  icon: '👤',
  category: 'professional',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap');
    
    body {
      font-family: 'Noto Sans', -apple-system, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #2d2d2d;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Noto Sans', sans-serif;
      font-weight: 600;
      margin-bottom: 0.3em;
    }
    
    h1 {
      font-size: 24pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 0.1em;
      color: #1a1a1a;
    }
    
    h2 {
      font-size: 12pt;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
      border-bottom: 2px solid #333;
      padding-bottom: 0.2em;
      margin-top: 1.2em;
    }
    
    h3 {
      font-size: 11pt;
      margin-top: 0.8em;
    }
    
    p {
      margin: 0.4em 0;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* Resume-specific styles */
    .name {
      font-size: 28pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 0.1em;
    }
    
    .job-title {
      font-size: 14pt;
      text-align: center;
      color: #555;
      margin-bottom: 0.5em;
    }
    
    .contact-info {
      text-align: center;
      font-size: 9pt;
      color: #666;
      margin-bottom: 1.5em;
    }
    
    .contact-info a {
      color: #0066cc;
    }
    
    .experience-item {
      margin-bottom: 1em;
    }
    
    .experience-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    
    .company {
      font-weight: 600;
    }
    
    .date-range {
      font-size: 9pt;
      color: #666;
    }
    
    ul {
      padding-left: 1.2em;
      margin: 0.3em 0;
    }
    
    li {
      margin: 0.15em 0;
    }
    
    .skills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
    }
    
    .skill-tag {
      background: #f0f0f0;
      padding: 0.2em 0.6em;
      border-radius: 3px;
      font-size: 9pt;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 0.5in 0.6in; }
    }
  `
};

// ============================================================================
// CHEATSHEET (Compact)
// ============================================================================

const CHEATSHEET_STYLE: PDFStylePreset = {
  id: 'cheatsheet',
  name: 'Compact Cheatsheet',
  description: 'Ultra-compact multi-column reference sheet',
  icon: '📑',
  category: 'compact',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
    
    body {
      font-family: 'Roboto Condensed', sans-serif;
      font-size: 7pt;
      line-height: 1.1;
      color: #1a1a1a;
      padding: 0;
      column-count: 3;
      column-gap: 0.15in;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Roboto Condensed', sans-serif;
      font-weight: 700;
      margin: 0.4em 0 0.2em 0;
      column-span: none;
    }
    
    h1 {
      font-size: 11pt;
      padding-bottom: 0.1em;
      border-bottom: 1px solid #333;
      column-span: all;
    }
    
    h2 {
      font-size: 10pt;
      background: #333;
      color: #fff;
      padding: 0.15em 0.3em;
      margin-left: -0.3em;
      margin-right: -0.3em;
    }
    
    h3 { font-size: 9pt; color: #333; }
    h4 { font-size: 8pt; color: #555; }
    
    p {
      margin: 0.3em 0;
      text-align: left;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* Cheatsheet-specific overrides */
    pre, code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 6pt;
      line-height: 1.1;
    }
    
    pre {
      padding: 0.2em 0.3em;
      margin: 0.2em 0;
      background: #f5f5f5;
    }
    
    ul, ol {
      padding-left: 1em;
      margin: 0.2em 0;
    }
    
    li {
      margin: 0.1em 0;
    }
    
    table {
      font-size: 7pt;
      margin: 0.2em 0;
    }
    
    th, td {
      padding: 0.15em 0.3em;
    }
    
    blockquote {
      padding-left: 0.3em;
      margin: 0.2em 0;
      border-left-width: 2px;
    }
    
    hr {
      margin: 0.4em 0;
    }
    
    img {
      max-height: 1in;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 0.25in; size: landscape; }
      body { column-count: 4; }
    }
  `
};

// ============================================================================
// MODERN SANS-SERIF
// ============================================================================

const MODERN_STYLE: PDFStylePreset = {
  id: 'modern',
  name: 'Modern Clean',
  description: 'Contemporary sans-serif design',
  icon: '✨',
  category: 'default',
  css: `
    ${BASE_RESET}
    
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono&display=swap');
    
    body {
      font-family: 'Noto Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      padding: 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Noto Sans', sans-serif;
      font-weight: 600;
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      color: #1a1a1a;
    }
    
    h1 {
      font-size: 24pt;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    
    h2 {
      font-size: 18pt;
      letter-spacing: -0.01em;
    }
    
    h3 { font-size: 14pt; }
    h4 { font-size: 12pt; }
    
    p {
      margin: 1em 0;
    }
    
    ${BASE_TYPOGRAPHY}
    
    /* Modern accents */
    a { color: #0066cc; }
    
    blockquote {
      border-left-color: #0066cc;
      background: #f8f9fa;
      padding: 1em 1em 1em 1.5em;
      margin: 1em 0;
      border-radius: 0 4px 4px 0;
    }
    
    pre {
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 6px;
      padding: 1em;
    }
    
    code {
      font-family: 'JetBrains Mono', monospace;
    }
    
    pre code {
      color: #d4d4d4;
    }
    
    th {
      background: #f0f0f0;
    }
    
    tr:nth-child(even) {
      background: #fafafa;
    }
  `,
  printCss: `
    @media print {
      @page { margin: 0.75in; }
      pre { background: #f5f5f5 !important; color: #333 !important; }
      pre code { color: #333 !important; }
    }
  `
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * All available PDF style presets
 */
export const PDF_STYLE_PRESETS: Record<PDFDocumentStyle, PDFStylePreset> = {
  standard: STANDARD_STYLE,
  ieee: IEEE_STYLE,
  apa: APA_STYLE,
  report: REPORT_STYLE,
  letter: LETTER_STYLE,
  resume: RESUME_STYLE,
  cheatsheet: CHEATSHEET_STYLE,
  modern: MODERN_STYLE,
};

/**
 * Get all presets as an array for UI rendering
 */
export const PDF_STYLE_LIST: PDFStylePreset[] = Object.values(PDF_STYLE_PRESETS);

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: PDFStylePreset['category']): PDFStylePreset[] {
  return PDF_STYLE_LIST.filter(preset => preset.category === category);
}

/**
 * Generate full CSS for a given style (combines base + style + print)
 */
export function getFullStyleCSS(styleId: PDFDocumentStyle): string {
  const preset = PDF_STYLE_PRESETS[styleId];
  if (!preset) return PDF_STYLE_PRESETS.standard.css + PDF_STYLE_PRESETS.standard.printCss;
  return preset.css + preset.printCss;
}

/**
 * Generate an HTML document with the specified style applied
 */
export function generateStyledHTML(
  content: string,
  title: string,
  styleId: PDFDocumentStyle,
  metadata?: {
    author?: string;
    date?: string;
    subtitle?: string;
    format?: string;
    wordCount?: number;
  }
): string {
  const fullCSS = getFullStyleCSS(styleId);
  const preset = PDF_STYLE_PRESETS[styleId];
  
  // Enhanced math/formula styles for better visibility
  const mathStyles = `
    /* KaTeX Math Rendering Styles */
    .katex {
      font-size: 1.1em !important;
      font-weight: 500 !important;
    }
    
    .katex-display {
      display: block !important;
      margin: 1.5em 0 !important;
      text-align: center !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      padding: 1em 0 !important;
    }
    
    .katex-display > .katex {
      font-size: 1.21em !important;
      text-align: center !important;
    }
    
    /* Math formula container styling */
    .math, .math-inline, .math-display {
      font-family: 'KaTeX_Main', 'Times New Roman', serif !important;
    }
    
    /* Equation blocks */
    .katex-display .katex-html {
      padding: 0.5em 1em !important;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%) !important;
      border-radius: 8px !important;
      border: 1px solid #dee2e6 !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important;
    }
    
    /* Inline math */
    .katex:not(.katex-display .katex) {
      padding: 0.1em 0.3em !important;
      background: rgba(102, 126, 234, 0.08) !important;
      border-radius: 4px !important;
    }
    
    /* Fractions */
    .katex .frac-line {
      border-bottom-width: 0.08em !important;
    }
    
    /* Subscripts and superscripts */
    .katex .msupsub {
      text-align: left !important;
    }
    
    /* Greek letters and operators */
    .katex .mathnormal,
    .katex .mathit {
      font-style: italic !important;
    }
    
    /* Bold math symbols */
    .katex .mathbf {
      font-weight: bold !important;
    }
    
    /* Summation, integral, and other big operators */
    .katex .op-symbol {
      font-size: 1.3em !important;
    }
    
    /* Square roots */
    .katex .sqrt > .sqrt-sign {
      position: relative !important;
    }
    
    /* Matrices and arrays */
    .katex .mtable {
      margin: 0.5em auto !important;
    }
    
    .katex .mtable .col-align-c > .vlist-t {
      text-align: center !important;
    }
    
    /* Print-specific math styles */
    @media print {
      .katex-display .katex-html {
        background: #f5f5f5 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      .katex {
        color: #000 !important;
      }
    }
  `;
  
  const metaSection = metadata ? `
    <div class="meta-footer" style="margin-top: 3em; padding-top: 1em; border-top: 1px solid #ddd; font-size: 9pt; color: #666; text-align: center;">
      <p>Generated with <strong>Memento AI</strong></p>
      ${metadata.format ? `<p style="margin-top: 0.3em;">${metadata.format}${metadata.wordCount ? ` • ${metadata.wordCount.toLocaleString()} words` : ''}</p>` : ''}
      ${metadata.date ? `<p style="margin-top: 0.3em;">${metadata.date}</p>` : ''}
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">
  <style>${fullCSS}</style>
  <style>${mathStyles}</style>
</head>
<body>
  <article class="document-content">
    ${content}
  </article>
  ${metaSection}
</body>
</html>`;
}

/**
 * Default style for quick access
 */
export const DEFAULT_PDF_STYLE: PDFDocumentStyle = 'standard';
