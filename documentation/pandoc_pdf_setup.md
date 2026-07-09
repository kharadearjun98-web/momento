# Pandoc PDF Generation Setup

This guide explains how to set up professional PDF generation using Pandoc with the Eisvogel LaTeX template.

## Overview

Memento supports two PDF generation methods:

1. **jsPDF (Default)** - Client-side JavaScript PDF generation. Works out of the box, no setup required.
2. **Pandoc + Eisvogel** - Server-side LaTeX-based PDF generation. Produces high-quality, professional documents.

## Prerequisites for Pandoc PDF Generation

### Option 1: Docker (Recommended)

The easiest way to get started is using Docker with the `pandoc/extra` image which includes Pandoc, LaTeX, and the Eisvogel template pre-installed.

```bash
# Pull the pandoc/extra image
docker pull pandoc/extra

# Test PDF generation
echo "# Test Document" > test.md
docker run --rm -v "$(pwd):/data" pandoc/extra test.md -o test.pdf --template eisvogel
```

### Option 2: Local Installation

For native installation:

1. **Install Pandoc**
   - Download from: https://pandoc.org/installing.html
   - Or use package manager:
     - macOS: `brew install pandoc`
     - Ubuntu: `sudo apt install pandoc`
     - Windows: `choco install pandoc` or `winget install pandoc`

2. **Install LaTeX**
   - macOS: `brew install --cask mactex` or `brew install basictex`
   - Ubuntu: `sudo apt install texlive-full`
   - Windows: Install MiKTeX from https://miktex.org/

3. **Install Eisvogel Template**
   ```bash
   # Download the latest release
   curl -LO https://github.com/Wandmalfarbe/pandoc-latex-template/releases/latest/download/Eisvogel.tar.gz
   
   # Extract and install
   tar -xzf Eisvogel.tar.gz
   
   # Copy to Pandoc templates folder
   # macOS/Linux:
   mkdir -p ~/.local/share/pandoc/templates
   cp Eisvogel-*/eisvogel.latex ~/.local/share/pandoc/templates/
   
   # Windows:
   # Copy eisvogel.latex to %APPDATA%\pandoc\templates\
   ```

4. **Install Required LaTeX Packages** (if using minimal LaTeX)
   ```bash
   tlmgr install adjustbox babel-german background bidi collectbox csquotes everypage filehook footmisc footnotebackref framed fvextra letltxmacro ly1 mdframed mweights needspace pagecolor sourcecodepro sourcesanspro titling ucharcat unicode-math upquote xecjk xurl zref draftwatermark
   ```

## API Configuration

### Environment Variables

Add these to your `.env.local`:

```bash
# Pandoc PDF Generation API
VITE_PANDOC_API_ENDPOINT=http://localhost:3001/api/generate-pdf
VITE_PANDOC_API_KEY=your-api-key-here

# Feature flag to enable Pandoc PDF generation
VITE_USE_PANDOC_PDF=true
```

### Running the PDF API Server

For local development, you can run the PDF generation API:

```bash
# Using Docker (recommended)
docker run -p 3001:3001 -v /tmp:/data memento-pdf-api

# Or build and run locally (requires Pandoc + LaTeX)
npm run dev:pdf-api
```

## Usage in Code

```typescript
import { 
  prepareMarkdownForEisvogel, 
  generatePDFViaAPI,
  EISVOGEL_THEMES 
} from '../lib/pandocPdfGenerator';

// Prepare markdown with Eisvogel frontmatter
const markdown = prepareMarkdownForEisvogel(report, {
  author: 'John Doe',
  'titlepage-logo': '/path/to/logo.png',
}, 'memento');

// Generate PDF via API
const pdfBlob = await generatePDFViaAPI(markdown, {
  pdfEngine: 'xelatex',
  syntaxHighlighting: 'idiomatic',
  numberSections: true,
}, {
  endpoint: import.meta.env.VITE_PANDOC_API_ENDPOINT,
  apiKey: import.meta.env.VITE_PANDOC_API_KEY,
});
```

## Eisvogel Theme Options

### Built-in Themes

| Theme | Description |
|-------|-------------|
| `memento` | Dark purple theme matching Memento branding |
| `professional` | Blue corporate theme |
| `academic` | Clean white/black theme for academic papers |
| `vibrant` | Purple/pink vibrant theme |
| `forest` | Green nature-inspired theme |

### Custom Configuration

```typescript
const customConfig = {
  titlepage: true,
  'titlepage-color': 'FF5733',      // Orange
  'titlepage-text-color': 'FFFFFF',
  'titlepage-rule-color': 'FFC300',
  toc: true,
  'toc-own-page': true,
  numbersections: true,
  fontsize: '12pt',
  geometry: 'margin=2cm',
  lang: 'de',  // German
};
```

## Template Variables

Full list of Eisvogel template variables:

### Title Page
- `titlepage` - Enable title page (true/false)
- `titlepage-color` - Background color (hex without #)
- `titlepage-text-color` - Text color
- `titlepage-rule-color` - Decorative line color
- `titlepage-rule-height` - Line height in points
- `titlepage-background` - Background image path
- `titlepage-logo` - Logo image path

### Headers & Footers
- `disable-header-and-footer` - Disable headers/footers
- `header-left`, `header-center`, `header-right` - Header text
- `footer-left`, `footer-center`, `footer-right` - Footer text

### Typography
- `mainfont`, `sansfont`, `monofont` - Font families
- `fontsize` - Font size (e.g., "11pt", "12pt")
- `linestretch` - Line spacing multiplier

### Layout
- `geometry` - Page margins (e.g., "margin=2.5cm")
- `papersize` - Paper size ("a4", "letter")
- `classoption` - Document class options

### Table of Contents
- `toc` - Enable TOC (true/false)
- `toc-own-page` - Start TOC on new page
- `toc-depth` - TOC depth level

### Code Blocks
- `listings-disable-line-numbers` - Disable line numbers
- `listings-no-page-break` - Prevent page breaks in listings

## Troubleshooting

### Common Errors

1. **"LaTeX Error: File 'footnotebackref.sty' not found"**
   - Install missing LaTeX packages (see Prerequisites)

2. **"Missing \\begin{document}"**
   - Ensure eisvogel.latex is properly installed in templates folder

3. **Font errors with XeLaTeX**
   - Install required fonts or use LuaLaTeX: `--pdf-engine=lualatex`

4. **Unicode characters not rendering**
   - Use XeLaTeX or LuaLaTeX instead of pdflatex

### Testing Your Setup

```bash
# Create a test document
cat > test.md << 'EOF'
---
title: "Test Document"
author: "Memento AI"
date: "2025-01-23"
titlepage: true
titlepage-color: "8B5CF6"
titlepage-text-color: "FFFFFF"
toc: true
---

# Introduction

This is a test document to verify the Pandoc + Eisvogel setup.

## Features

- Professional title page
- Table of contents
- Code syntax highlighting

\`\`\`javascript
console.log("Hello, Memento!");
\`\`\`
EOF

# Generate PDF
pandoc test.md -o test.pdf --template eisvogel --pdf-engine xelatex

# Or with Docker
docker run --rm -v "$(pwd):/data" pandoc/extra test.md -o test.pdf --template eisvogel
```

## Resources

- [Eisvogel GitHub Repository](https://github.com/Wandmalfarbe/pandoc-latex-template)
- [Pandoc User's Guide](https://pandoc.org/MANUAL.html)
- [Eisvogel Examples](https://github.com/Wandmalfarbe/pandoc-latex-template/tree/main/examples)
