import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveWithLightRAG, retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';
import { ReportFormat, ReportTone, GeneratedReport, ReportSection, ReportImage } from '../types';
import { generateReportImage, GeneratedImage, ImageGenerationRequest } from './imageGenerator';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

const openai = createServerOnlyProviderClient('image');

export interface ReportGenerationOptions {
  format: ReportFormat;
  tone: ReportTone;
  customPrompt?: string;
  generateImages?: boolean;
  imageCount?: number;
  modelQuality?: 'standard' | 'high';
}

/**
 * Get format-specific instructions for the report (Deep Research Style)
 */
function getFormatInstructions(format: ReportFormat): string {
  switch (format) {
    case 'Executive Summary':
      return `Create a COMPREHENSIVE executive summary designed for senior decision-makers with:
        
        ## Executive Overview
        - High-impact opening that frames the strategic importance
        - 3-4 sentence synthesis of the most critical insights
        
        ## Key Findings
        - 5-8 major findings with supporting data points
        - Each finding should include: the insight, evidence, and business implication
        - Use specific numbers, percentages, or metrics where available
        
        ## Strategic Implications
        - Analysis of how these findings affect strategy/operations
        - Risk factors and opportunities identified
        - Competitive or market positioning insights
        
        ## Recommendations & Next Steps
        - Prioritized action items (high/medium/low priority)
        - Resource or timeline considerations
        - Success metrics and KPIs to track
        
        ## Conclusion
        - Forward-looking summary with clear call to action
        
        Aim for 800-1200 words. Include data visualizations concepts (describe what charts/graphs would show).`;

    case 'Research Paper':
      return `Create a RIGOROUS academic-style research paper with deep analysis:
        
        ## Abstract
        - Comprehensive 200-word abstract covering purpose, methodology, findings, and conclusions
        
        ## 1. Introduction
        - Research context and significance
        - Problem statement and research questions
        - Scope and objectives
        - Overview of paper structure
        
        ## 2. Background & Literature Review
        - Historical context and evolution of the topic
        - Key theories and frameworks
        - Analysis of existing research and perspectives
        - Identification of research gaps
        
        ## 3. Methodology
        - Analytical framework used
        - Data sources and their credibility
        - Approach to synthesis and analysis
        
        ## 4. Findings & Analysis
        - Detailed presentation of key findings (use subheadings)
        - Data-driven insights with supporting evidence
        - Cross-source validation and triangulation
        - Unexpected or notable discoveries
        
        ## 5. Discussion
        - Interpretation of findings
        - Theoretical and practical implications
        - Limitations and caveats
        - Comparison with existing literature
        
        ## 6. Conclusion
        - Summary of contributions
        - Future research directions
        - Closing insights
        
        ## References
        - Properly formatted citations
        
        Aim for 2000-3000 words. Use academic language, cite sources inline, and maintain scholarly objectivity.`;

    case 'Technical Memo':
      return `Create a DETAILED technical memorandum for technical stakeholders:
        
        ## MEMORANDUM HEADER
        TO: Technical Leadership / Engineering Team
        FROM: Analysis Team
        RE: [Topic derived from sources]
        DATE: [Current date]
        
        ## 1. Purpose & Scope
        - Clear statement of the memo's objective
        - Technical scope and boundaries
        - Intended audience and use cases
        
        ## 2. Background
        - Technical context and prerequisites
        - System/process overview
        - Relevant history or prior decisions
        
        ## 3. Technical Analysis
        - Deep dive into technical details
        - Architecture or system considerations
        - Data structures, algorithms, or processes involved
        - Performance metrics and benchmarks
        - Code examples or technical specifications (if applicable)
        
        ## 4. Findings
        - Technical discoveries organized by category
        - Root cause analysis (if applicable)
        - Dependencies and relationships
        - Technical debt or constraints identified
        
        ## 5. Risk Assessment
        - Technical risks and their likelihood/impact
        - Security considerations
        - Scalability concerns
        - Compatibility issues
        
        ## 6. Recommendations
        - Prioritized technical recommendations
        - Implementation approach
        - Required resources and expertise
        - Timeline estimates
        
        ## 7. Action Items
        - Specific next steps with owners
        - Decision points requiring input
        - Milestones and checkpoints
        
        ## Appendix
        - Technical diagrams (described)
        - Reference materials
        - Glossary of terms
        
        Aim for 1500-2500 words. Use precise technical terminology and include specific details.`;

    case 'Literature Review':
      return `Create a COMPREHENSIVE literature review with critical analysis:
        
        ## Abstract
        - Overview of the review scope, methodology, and key themes (150 words)
        
        ## 1. Introduction
        - Topic overview and significance
        - Review objectives and research questions
        - Scope and selection criteria
        - Review methodology
        
        ## 2. Background & Context
        - Historical development of the field
        - Key milestones and paradigm shifts
        - Current state of knowledge
        
        ## 3. Thematic Analysis
        
        ### 3.1 Theme A: [Derived from sources]
        - Overview of the theme
        - Key works and contributions
        - Points of consensus
        - Areas of debate or contradiction
        
        ### 3.2 Theme B: [Derived from sources]
        - [Same structure as above]
        
        ### 3.3 Theme C: [Derived from sources]
        - [Same structure as above]
        
        ## 4. Critical Synthesis
        - Integration of findings across themes
        - Patterns and trends identified
        - Methodological approaches compared
        - Evolution of thought over time
        
        ## 5. Gaps & Opportunities
        - Identified gaps in the literature
        - Under-researched areas
        - Methodological limitations
        - Opportunities for future research
        
        ## 6. Implications
        - Theoretical implications
        - Practical applications
        - Policy considerations (if applicable)
        
        ## 7. Conclusion
        - Summary of key insights
        - State of the field assessment
        - Recommendations for future research
        
        ## References
        - Comprehensive bibliography
        
        Aim for 2500-4000 words. Critically analyze sources, compare perspectives, and synthesize insights.`;

    default:
      return 'Create a well-structured, comprehensive report with multiple sections covering all major topics from the sources.';
  }
}

/**
 * Get tone-specific instructions for the report
 */
function getToneInstructions(tone: ReportTone): string {
  switch (tone) {
    case 'Professional':
      return 'Use a professional, business-appropriate tone. Be clear, direct, and formal but accessible.';
    case 'Academic':
      return 'Use an academic tone with proper scholarly language. Cite sources and maintain objectivity.';
    case 'Persuasive':
      return 'Use a persuasive tone that builds compelling arguments. Include evidence and make clear recommendations.';
    case 'Neutral':
      return 'Use a neutral, balanced tone. Present information objectively without bias or opinion.';
    default:
      return 'Use a clear and professional tone.';
  }
}

/**
 * Generate a report from notebook sources using OpenAI and LightRAG
 */
export async function generateReport(
  notebookId: string,
  options: ReportGenerationOptions
): Promise<GeneratedReport> {
  try {
    console.log('📝 Generating report...');
    console.log('   Notebook ID:', notebookId);
    console.log('   Format:', options.format);
    console.log('   Tone:', options.tone);

    // Fetch notebook title
    const { data: notebook, error: notebookError } = await supabase
      .from('notebooks')
      .select('title')
      .eq('id', notebookId)
      .single();

    if (notebookError) throw notebookError;

    // Fetch all sources for the notebook
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id, title, content, type')
      .eq('notebook_id', notebookId);

    if (sourcesError) throw sourcesError;

    console.log(`📚 Found ${sources?.length || 0} sources`);

    if (!sources || sources.length === 0) {
      throw new Error('No sources found for this notebook. Please upload some documents first.');
    }

    // Filter sources with content
    const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);

    if (sourcesWithContent.length === 0) {
      throw new Error('Sources found but none have been processed yet. Try uploading again.');
    }

    console.log(`✅ Using ${sourcesWithContent.length} sources with content`);

    // Retrieve Knowledge Graph Data (LightRAG)
    console.log('📊 Retrieving knowledge graph data...');
    let graphData: { entities: any[]; relationships: any[] } = { entities: [], relationships: [] };

    try {
      if (options.customPrompt) {
        // Focused retrieval based on key directives
        graphData = await retrieveGraphForTopic(options.customPrompt, notebookId, {
          entityCount: 30,
          relationshipCount: 25
        });
      } else {
        // Broad retrieval for comprehensive report
        graphData = await getAllGraphData(notebookId, 60);
      }
    } catch (graphError) {
      console.warn('⚠️ Knowledge graph retrieval failed, continuing without graph data:', graphError);
    }

    // Retrieve RAG context - use custom prompt if provided, otherwise use general query
    const query = options.customPrompt || `Generate a ${options.format} about ${notebook.title}`;
    let ragContext: { chunks: any[]; entities: any[]; relationships: any[]; formattedContext: string } = {
      chunks: [],
      entities: [],
      relationships: [],
      formattedContext: ''
    };

    try {
      ragContext = await retrieveWithLightRAG(query, notebookId, { chunkCount: 20 });
    } catch (ragError) {
      console.warn('⚠️ RAG retrieval failed, using source content directly:', ragError);
    }

    console.log(`   ✓ RAG: ${ragContext.chunks.length} chunks, ${graphData.entities.length} entities, ${graphData.relationships.length} relationships`);

    // Combine source content (using more content for reports)
    const combinedContent = sourcesWithContent
      .map(s => `📄 ${s.title}\n${s.content?.substring(0, 4000) || ''}`)
      .join('\n\n');

    // Format RAG context - use chunk content if no graph data
    let entitiesContext = '';
    let relationshipsContext = '';
    let chunksContext = '';

    if (graphData.entities.length > 0) {
      entitiesContext = `**Key Concepts from Knowledge Graph:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`;
    }

    if (graphData.relationships.length > 0) {
      relationshipsContext = `**Key Connections:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}: ${r.description}`).join('\n')}`;
    }

    if (ragContext.chunks.length > 0) {
      chunksContext = `**Relevant Document Excerpts:**\n${ragContext.chunks.map((c, i) => `[${i + 1}] ${c.content.substring(0, 600)}${c.content.length > 600 ? '...' : ''}`).join('\n\n')}`;
    }

    // Build the prompt
    const formatInstructions = getFormatInstructions(options.format);
    const toneInstructions = getToneInstructions(options.tone);

    // Build context sections dynamically based on what's available
    const hasGraphData = graphData.entities.length > 0 || graphData.relationships.length > 0;
    const hasChunks = ragContext.chunks.length > 0;

    let contextSection = '';
    if (hasGraphData || hasChunks) {
      contextSection = `RETRIEVED CONTEXT:\n`;
      if (entitiesContext) contextSection += `\n${entitiesContext}\n`;
      if (relationshipsContext) contextSection += `\n${relationshipsContext}\n`;
      if (chunksContext) contextSection += `\n${chunksContext}\n`;
    }

    const prompt = `You are an expert research analyst and document writer specializing in creating comprehensive, publication-quality reports. Your task is to generate a detailed ${options.format} based on extensive source materials.

${contextSection}
SOURCE DOCUMENTS:
${combinedContent.substring(0, 16000)}

DOCUMENT REQUIREMENTS:
${formatInstructions}

WRITING STYLE & TONE:
${toneInstructions}

${options.customPrompt ? `SPECIAL FOCUS/DIRECTIVES:\n${options.customPrompt}\n` : ''}
CRITICAL INSTRUCTIONS FOR DEEP RESEARCH QUALITY:

1. STRUCTURE & FORMATTING
   - Use proper Markdown: # for title, ## for main sections, ### for subsections
   - Create a logical flow with clear transitions between sections
   - Use bullet points for lists, numbered lists for sequences or rankings
   - Include horizontal rules (---) to separate major sections

2. DEPTH & ANALYSIS
   - Go beyond surface-level summarization - provide genuine insight and analysis
   - Identify patterns, trends, and relationships across sources
   - Include specific data points, statistics, and metrics where available
   - Explain the "so what" - why each finding matters

3. SOURCE INTEGRATION
   - Synthesize information from ALL provided sources
   - Cross-reference and validate claims across multiple sources
   - Note areas of agreement and disagreement between sources
   - Cite specific sources when making claims (e.g., "According to [source]...")

4. VISUAL CONCEPTS
   - Where appropriate, describe charts, graphs, or diagrams that would enhance understanding
   - Use tables (markdown format) for comparative data
   - Suggest infographic elements for key statistics

5. ACTIONABLE INSIGHTS
   - Provide concrete, actionable recommendations
   - Prioritize findings by importance or urgency
   - Include implementation considerations

6. QUALITY MARKERS
   - Define technical terms when first used
   - Use specific examples to illustrate abstract concepts
   - Maintain consistent terminology throughout
   - End sections with transitional statements

Return ONLY the report content in Markdown format. Do not include any JSON wrapper or metadata.
Start directly with an appropriate title as a # heading.
Ensure the report is comprehensive, well-researched, and provides genuine value to the reader.`;

    console.log('🤖 Generating deep research report with Grok 4.1 Fast...');

    // Use GPT 5.4 Mini via Lingshi for report generation
    const model = 'gpt-5.4-mini';
    console.log(`   Using model: ${model}`);

    const response = await chatProvider.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert research analyst and professional document writer. You create comprehensive, publication-quality reports that provide deep insights and actionable recommendations. Your reports are known for their thoroughness, analytical depth, and clarity. You synthesize complex information from multiple sources into cohesive, well-structured narratives with genuine insights rather than superficial summaries.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const reportContent = response.choices[0]?.message?.content;

    if (!reportContent) {
      throw new Error('No content generated from Nemotron');
    }

    console.log('✅ Report content generated');

    // Parse sections from the markdown content
    const sections = parseReportSections(reportContent);

    // Calculate word count
    const wordCount = reportContent.split(/\s+/).length;

    // Generate report title
    const reportTitle = extractTitleFromContent(reportContent) ||
      `${options.format}: ${notebook.title}`;

    // Generate and place images using Nemotron analysis + GPT Image 1
    let images: GeneratedImage[] = [];
    let finalContent = reportContent;

    if (options.generateImages && openai) {
      console.log('🖼️ Analyzing report for image placements with Nemotron...');
      try {
        // Use Nemotron to analyze where images should go
        const imagePlacements = await analyzeImagePlacements(reportContent, reportTitle, options.imageCount || 4);

        if (imagePlacements.length > 0) {
          console.log(`📍 Found ${imagePlacements.length} optimal image locations`);

          // Generate images with GPT Image 1 and insert into report
          const result = await generateAndInsertImages(reportContent, imagePlacements);
          finalContent = result.content;
          images = result.images;

          console.log(`✅ Generated and inserted ${images.length} images with GPT Image 1`);
        }
      } catch (imageError) {
        console.warn('⚠️ Image generation failed, continuing without images:', imageError);
      }
    }

    // Create the report object
    const report: GeneratedReport = {
      id: crypto.randomUUID(),
      notebookId,
      title: reportTitle,
      content: finalContent,
      sections: parseReportSections(finalContent), // Re-parse with images included
      images,
      metadata: {
        format: options.format,
        tone: options.tone,
        createdAt: new Date().toISOString(),
        customPrompt: options.customPrompt,
        sourceCount: sourcesWithContent.length,
        wordCount,
        model: 'gpt-5.4-mini',
        hasImages: images.length > 0,
      },
    };

    console.log(`✅ Report generated: "${report.title}" (${wordCount} words, ${sections.length} sections, ${images.length} images)`);

    return report;
  } catch (error) {
    console.error('❌ Report generation error:', error);
    throw error;
  }
}

/**
 * Image placement suggestion from Nemotron
 */
interface ImagePlacement {
  sectionTitle: string;
  insertAfter: string; // Text to insert image after
  type: 'chart' | 'diagram' | 'infographic' | 'illustration';
  description: string;
  context: string;
}

/**
 * Use Nemotron to analyze report and determine optimal image placements
 */
async function analyzeImagePlacements(
  reportContent: string,
  reportTitle: string,
  maxImages: number = 4
): Promise<ImagePlacement[]> {
  const analysisPrompt = `Analyze this report and identify ${maxImages} specific locations where images would enhance understanding.

REPORT TITLE: ${reportTitle}

REPORT CONTENT:
${reportContent.substring(0, 10000)}

For each image placement, provide:
1. sectionTitle: The section where the image should appear
2. insertAfter: A unique sentence or phrase from the report text after which to insert the image (MUST be exact text from the report)
3. type: "chart" | "diagram" | "infographic" | "illustration"
4. description: What the image should show
5. context: Why this visualization helps at this location

Return ONLY a valid JSON array:
[
  {
    "sectionTitle": "Key Findings",
    "insertAfter": "The data shows a 45% increase in efficiency.",
    "type": "chart",
    "description": "Bar chart comparing efficiency metrics before and after implementation",
    "context": "Visualizes the key statistic mentioned"
  }
]

Focus on:
- Data-heavy sections that need visualization
- Complex processes that need diagrams
- Key findings that deserve visual emphasis
- Logical flow points in the document

Return ONLY the JSON array, no other text.`;

  try {
    const analysisResponse = await chatProvider.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a visual communication expert. Analyze reports and identify optimal image placements. Return only valid JSON arrays.',
        },
        { role: 'user', content: analysisPrompt },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    });

    const analysisContent = analysisResponse.choices[0]?.message?.content || '[]';

    // Parse the suggestions
    try {
      const cleaned = analysisContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const placements = JSON.parse(cleaned) as ImagePlacement[];
      return placements.slice(0, maxImages);
    } catch (parseError) {
      console.warn('Could not parse image placement suggestions from Nemotron');
      return [];
    }
  } catch (error) {
    console.error('Error analyzing image placements:', error);
    return [];
  }
}

/**
 * Generate images with GPT Image 1 and insert them into the report
 */
async function generateAndInsertImages(
  content: string,
  placements: ImagePlacement[]
): Promise<{ content: string; images: GeneratedImage[] }> {
  const images: GeneratedImage[] = [];
  let modifiedContent = content;

  for (const placement of placements) {
    try {
      console.log(`🎨 Generating image for: ${placement.sectionTitle}`);

      // Generate image with GPT Image 1
      const image = await generateReportImage({
        type: placement.type,
        description: placement.description,
        context: placement.context,
        style: 'professional',
      });

      images.push(image);

      // Find the insertion point and add image markdown
      if (placement.insertAfter && modifiedContent.includes(placement.insertAfter)) {
        const imageMarkdown = `\n\n![${placement.description}](${image.base64 || image.url})\n*Figure: ${placement.description}*\n`;
        modifiedContent = modifiedContent.replace(
          placement.insertAfter,
          placement.insertAfter + imageMarkdown
        );
        console.log(`📍 Inserted image after: "${placement.insertAfter.substring(0, 50)}..."`);
      } else {
        console.warn(`⚠️ Could not find insertion point: "${placement.insertAfter?.substring(0, 50)}..."`);
      }
    } catch (error) {
      console.warn(`Failed to generate image for ${placement.sectionTitle}:`, error);
    }
  }

  return { content: modifiedContent, images };
}

/**
 * Parse markdown content into sections
 */
function parseReportSections(content: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const lines = content.split('\n');

  let currentSection: ReportSection | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if exists
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        id: crypto.randomUUID(),
        title: headerMatch[2],
        content: '',
        level: headerMatch[1].length,
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    } else {
      // Content before first header - create intro section
      if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            id: crypto.randomUUID(),
            title: 'Introduction',
            content: '',
            level: 1,
          };
        }
        currentContent.push(line);
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract title from markdown content (first # heading)
 */
function extractTitleFromContent(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : null;
}

/**
 * Save report to database
 */
export async function saveReport(report: GeneratedReport): Promise<void> {
  console.log('💾 Saving report to database...');

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError || new Error('Authentication required.');

  const { data: saved, error } = await supabase
    .from('reports')
    .insert({
      id: report.id,
      notebook_id: report.notebookId,
      user_id: user.id,
      title: report.title,
      format: report.metadata.format,
      tone: report.metadata.tone,
      custom_prompt: report.metadata.customPrompt,
      source_count: report.metadata.sourceCount,
      word_count: report.metadata.wordCount,
      model: report.metadata.model,
      has_images: report.metadata.hasImages || false,
      created_at: report.metadata.createdAt,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error saving report:', error);
    throw error;
  }

  const { error: sectionsError } = await supabase
    .from('report_sections')
    .insert(report.sections.map((section, index) => ({
      id: section.id,
      report_id: saved.id,
      level: section.level,
      title: section.title,
      content_markdown: section.content,
      order_index: index,
    })));

  if (sectionsError) {
    console.error('Error saving report sections:', sectionsError);
    throw sectionsError;
  }

  console.log('✅ Report saved successfully');
}

/**
 * Load saved reports for a notebook
 */
export async function loadReports(notebookId: string): Promise<GeneratedReport[]> {
  const { data, error } = await supabase
    .from('generated_assets')
    .select('*')
    .eq('notebook_id', notebookId)
    .eq('type', 'report')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading reports:', error);
    throw error;
  }

  return (data || []).map(item => item.metadata.reportData as GeneratedReport);
}

/**
 * Delete a report from database
 */
export async function deleteReport(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('generated_assets')
    .delete()
    .eq('id', reportId);

  if (error) {
    console.error('Error deleting report:', error);
    throw error;
  }

  console.log('✅ Report deleted successfully');
}

/**
 * Generate PDF from report content (client-side using browser print)
 */
export function generateReportPDF(report: GeneratedReport): void {
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Unable to open print window. Please allow popups.');
  }

  // Convert markdown to basic HTML
  const htmlContent = markdownToHtml(report.content);

  // Write the HTML content
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${report.title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #1a1a1a;
          padding: 40px 60px;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 {
          font-size: 24pt;
          margin-bottom: 24px;
          color: #111;
          border-bottom: 2px solid #333;
          padding-bottom: 12px;
        }
        h2 {
          font-size: 18pt;
          margin-top: 28px;
          margin-bottom: 12px;
          color: #222;
        }
        h3 {
          font-size: 14pt;
          margin-top: 20px;
          margin-bottom: 8px;
          color: #333;
        }
        p {
          margin-bottom: 12px;
          text-align: justify;
        }
        ul, ol {
          margin: 12px 0;
          padding-left: 24px;
        }
        li {
          margin-bottom: 6px;
        }
        blockquote {
          border-left: 3px solid #666;
          margin: 16px 0;
          padding-left: 16px;
          color: #444;
          font-style: italic;
        }
        code {
          background: #f4f4f4;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Consolas', monospace;
          font-size: 10pt;
        }
        pre {
          background: #f4f4f4;
          padding: 16px;
          margin: 16px 0;
          overflow-x: auto;
          border-radius: 4px;
        }
        strong {
          font-weight: 600;
        }
        hr {
          border: none;
          border-top: 1px solid #ddd;
          margin: 24px 0;
        }
        .metadata {
          font-size: 10pt;
          color: #666;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
        }
        @media print {
          body {
            padding: 0;
          }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
      <div class="metadata">
        <p>Format: ${report.metadata.format} | Tone: ${report.metadata.tone}</p>
        <p>Sources: ${report.metadata.sourceCount} | Word Count: ${report.metadata.wordCount}</p>
        <p>Generated: ${new Date(report.metadata.createdAt).toLocaleDateString()}</p>
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();

  // Wait for content to load, then trigger print
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

/**
 * Convert basic markdown to HTML
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/g, '').replace(/```/g, '');
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists (simple conversion)
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Paragraphs (lines that aren't already wrapped)
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    if (line.trim() &&
      !line.startsWith('<') &&
      !line.match(/^[\-\*\d]/) &&
      line.trim() !== '') {
      return `<p>${line}</p>`;
    }
    return line;
  });

  html = processedLines.join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}
