# Report Generation System

## Overview

The report generation system creates publication-quality documents from notebook sources using **NVIDIA Nemotron** (via OpenRouter) for text generation and intelligent image placement analysis, with **GPT Image 1** for visual generation.

---

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  ReportModal    │───>│ reportGenerator │───>│   pdfGenerator  │
│   (UI/Config)   │    │   (AI Logic)    │    │  (PDF Export)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
            ┌─────────┐ ┌─────────┐ ┌─────────────┐
            │Supabase │ │LightRAG │ │GPT Image 1  │
            │ Sources │ │ Graph   │ │ (OpenAI)    │
            └─────────┘ └─────────┘ └─────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/reportGenerator.ts` | Core generation with Nemotron + image placement |
| `lib/imageGenerator.ts` | GPT Image 1 image generation |
| `lib/pdfGenerator.ts` | Professional PDF export with jsPDF |
| `components/ReportModal.tsx` | UI configuration modal |

---

## Report Formats

| Format | Word Target | Use Case |
|--------|-------------|----------|
| **Executive Summary** | 800-1200 | Senior decision-makers |
| **Research Paper** | 2000-3000 | Academic/scholarly analysis |
| **Technical Memo** | 1500-2500 | Technical stakeholders |
| **Literature Review** | 2500-4000 | Comprehensive source analysis |

---

## Generation Flow

1. **Fetch Sources** - Get notebook sources from Supabase
2. **LightRAG Retrieval** - Query knowledge graph for entities & relationships
3. **Nemotron Generation** - Generate report text via OpenRouter
4. **Nemotron Image Analysis** - Identify optimal image placement locations
5. **GPT Image 1 Generation** - Generate 3-5 images
6. **Insert Images** - Place images inline at analyzed positions
7. **Save to DB** - Store in `generated_assets` table

---

## Configuration Options

```typescript
interface ReportGenerationOptions {
  format: ReportFormat;           // Report type
  tone: ReportTone;               // Professional|Academic|Persuasive|Neutral
  customPrompt?: string;          // Focus directives
  generateImages?: boolean;       // Enable image generation (default: true)
  imageCount?: number;            // Number of images (default: 4)
}
```

---

## Image Placement Analysis

Nemotron analyzes the report and returns structured placements:

```typescript
interface ImagePlacement {
  sectionTitle: string;    // Target section
  insertAfter: string;     // Exact text to insert after
  type: 'chart' | 'diagram' | 'infographic' | 'illustration';
  description: string;     // What to generate
  context: string;         // Why it helps
}
```

---

## PDF Export Options

```typescript
interface PDFGenerationOptions {
  includeCoverPage: boolean;
  includeTableOfContents: boolean;
  includeCharts: boolean;
  includeBranding: boolean;        // Memento branding
  colorTheme: 'purple'|'blue'|'green'|'professional';
  authorName?: string;
  companyName?: string;
  subtitle?: string;
}
```

---

## Data Types

```typescript
interface GeneratedReport {
  id: string;
  notebookId: string;
  title: string;
  content: string;              // Markdown
  sections: ReportSection[];
  images?: ReportImage[];       // DALL-E generated
  metadata: {
    format, tone, createdAt,
    sourceCount, wordCount, model
  };
}
```

---

## API Functions

| Function | Description |
|----------|-------------|
| `generateReport()` | Main generation entry point |
| `saveReport()` | Save to Supabase |
| `loadReports()` | Load saved reports |
| `deleteReport()` | Remove from database |
| `generateProfessionalPDF()` | Export to PDF blob |
| `downloadReportPDF()` | Direct PDF download |

---

## Dependencies

- **Nemotron** (via OpenRouter) - Report text + image analysis
- **GPT Image 1** (OpenAI) - Image generation
- **Supabase** - Source storage, report persistence
- **LightRAG** - Knowledge graph retrieval
- **jsPDF** - Client-side PDF generation
