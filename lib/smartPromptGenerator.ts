/**
 * Smart Visual Prompt Generator
 * Analyzes narration content and generates context-aware image prompts
 * that directly represent the concepts being explained
 */

import { createServerOnlyProviderClient } from './serverOnlyProvider';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

// ============================================================================
// TYPES
// ============================================================================

export interface ConceptVisual {
    type: 'process' | 'comparison' | 'formula' | 'diagram' | 'sequence' | 'concept';
    prompt: string;
    description: string;
    formula?: string;      // LaTeX formula if applicable
    steps?: string[];      // For process/sequence types
}

export interface VisualAnalysis {
    mainConcept: string;
    visualType: ConceptVisual['type'];
    keyElements: string[];
    suggestedPrompt: string;
    formula?: string;
    isProcessBased: boolean;
    processSteps?: string[];
}

// ============================================================================
// CONCEPT-AWARE PROMPT TEMPLATES
// ============================================================================

const CONCEPT_TEMPLATES: Record<string, { type: ConceptVisual['type']; template: string; formula?: string }> = {
    // Machine Learning / AI Concepts
    'forward diffusion': {
        type: 'sequence',
        template: 'A sequence showing an image progressively getting noisier: clear photo on left, gradually adding Gaussian noise across 4 frames, ending with pure static noise on right. Show arrows between each step. Educational diagram style.',
        formula: 'q(x_t|x_{t-1}) = \\mathcal{N}(x_t; \\sqrt{1-\\beta_t}x_{t-1}, \\beta_t I)',
    },
    'reverse diffusion': {
        type: 'sequence',
        template: 'A sequence showing noise transforming into a clear image: pure static noise on left, gradually becoming clearer across 4 frames, ending with sharp photo on right. Show arrows between each step. Educational diagram style.',
        formula: 'p_\\theta(x_{t-1}|x_t) = \\mathcal{N}(x_{t-1}; \\mu_\\theta(x_t, t), \\Sigma_\\theta(x_t, t))',
    },
    'neural network': {
        type: 'diagram',
        template: 'A neural network diagram showing input layer (3 nodes), two hidden layers (5 and 4 nodes), and output layer (2 nodes). Nodes connected by lines showing weights. Activation functions visualized as small graphs on nodes.',
    },
    'backpropagation': {
        type: 'process',
        template: 'A flowchart showing: Input → Forward Pass → Loss Calculation → Gradients flowing backward through layers → Weight Updates. Use arrows and gradient colors (red to blue) to show error flow.',
        formula: '\\frac{\\partial L}{\\partial w} = \\frac{\\partial L}{\\partial a} \\cdot \\frac{\\partial a}{\\partial z} \\cdot \\frac{\\partial z}{\\partial w}',
    },
    'gradient descent': {
        type: 'diagram',
        template: 'A 3D surface plot showing a loss landscape with a ball rolling down the slope. Show the path of descent with dotted line. Mark local and global minima. Include learning rate as step size arrows.',
        formula: 'w_{t+1} = w_t - \\eta \\nabla L(w_t)',
    },
    'attention mechanism': {
        type: 'diagram',
        template: 'Query, Key, Value vectors visualized as colored columns. Show the attention matrix as a heatmap grid. Arrows from queries to keys, weights applied to values. Softmax visualization.',
        formula: '\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
    },
    'transformer': {
        type: 'diagram',
        template: 'Transformer architecture diagram: encoder and decoder stacks, multi-head attention blocks, feed-forward layers, residual connections shown as loops. Input/output embeddings at bottom and top.',
    },
    'embedding': {
        type: 'diagram',
        template: 'Words on left transforming into dense vectors on right. Show words like "king", "queen" as points in 3D space with similar words clustered together. Vector arithmetic visualization.',
    },
    'rag': {
        type: 'process',
        template: 'A flowchart: User query → Vector database search (shown as cylinder with dots) → Retrieved documents → LLM (brain icon) combining query + docs → Generated response. Use arrows for flow.',
    },
    'retrieval augmented generation': {
        type: 'process',
        template: 'A flowchart: User query → Vector database search (shown as cylinder with dots) → Retrieved documents → LLM (brain icon) combining query + docs → Generated response. Use arrows for flow.',
    },

    // Math Concepts
    'derivative': {
        type: 'diagram',
        template: 'A curve with a tangent line touching at one point. Show the slope triangle (rise over run). Mark the point of tangency and the derivative value as the slope angle.',
        formula: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
    },
    'integral': {
        type: 'diagram',
        template: 'A curve with the area underneath shaded. Show Riemann rectangles approximating the area. Include the integration bounds a and b on x-axis.',
        formula: '\\int_a^b f(x)\\,dx = F(b) - F(a)',
    },
    'probability distribution': {
        type: 'diagram',
        template: 'A bell curve (normal distribution) with shaded regions showing probabilities. Mark mean (μ) at center, standard deviations (±1σ, ±2σ, ±3σ) with percentages.',
        formula: 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
    },
    'bayes theorem': {
        type: 'diagram',
        template: 'A Venn diagram showing overlapping circles A and B. Highlight the intersection. Show probability arrows and labels for P(A|B), P(B|A), P(A), P(B).',
        formula: 'P(A|B) = \\frac{P(B|A) \\cdot P(A)}{P(B)}',
    },

    // Physics Concepts
    'wave': {
        type: 'diagram',
        template: 'A sinusoidal wave with labeled amplitude, wavelength, and frequency. Show crest, trough, and equilibrium. Include direction of propagation arrow.',
        formula: 'y = A \\sin(kx - \\omega t)',
    },
    'energy': {
        type: 'comparison',
        template: 'Side by side: kinetic energy (ball in motion with speed arrows) vs potential energy (ball at height with gravity arrow). Show energy bar comparison.',
        formula: 'E = \\frac{1}{2}mv^2 + mgh',
    },
};

// ============================================================================
// SMART PROMPT GENERATION
// ============================================================================

/**
 * Analyze narration text and generate appropriate visual prompt
 */
export async function analyzeAndGeneratePrompt(
    narration: string,
    slideTitle: string,
    slideType: string
): Promise<ConceptVisual> {
    // First, check for known concept templates
    const lowerNarration = narration.toLowerCase();
    const lowerTitle = slideTitle.toLowerCase();

    for (const [conceptKey, template] of Object.entries(CONCEPT_TEMPLATES)) {
        if (lowerNarration.includes(conceptKey) || lowerTitle.includes(conceptKey)) {
            console.log(`📚 Found known concept: "${conceptKey}"`);
            return {
                type: template.type,
                prompt: template.template,
                description: conceptKey,
                formula: template.formula,
            };
        }
    }

    // If no template found, use AI to analyze and generate prompt
    console.log('🤖 Analyzing narration for visual prompt...');

    try {
        const response = await chatProvider.chat.completions.create({
            model: 'gpt-5.4-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert at creating visual representations of concepts for educational slides.
Your job is to analyze narration text and generate an image prompt that DIRECTLY VISUALIZES the concept being explained.

Rules:
1. Focus on SHOWING the concept, not just illustrating it with generic icons
2. For processes, describe step-by-step visual sequences
3. For math concepts, describe visual representations of formulas
4. For comparisons, describe side-by-side visualizations
5. Include specific visual elements that represent the actual mechanism

Output JSON:
{
  "type": "process|comparison|formula|diagram|sequence|concept",
  "prompt": "Detailed image generation prompt that shows the actual concept...",
  "description": "Brief description of what the visual shows",
  "formula": "LaTeX formula if applicable (optional)",
  "steps": ["Step 1", "Step 2"] // For process/sequence types (optional)
}`
                },
                {
                    role: 'user',
                    content: `Slide Title: ${slideTitle}
Slide Type: ${slideType}

Narration:
${narration}

Generate a visual prompt that DIRECTLY REPRESENTS this concept, not just decorative icons.`
                }
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content = response.choices[0]?.message?.content || '';

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                type: parsed.type || 'concept',
                prompt: parsed.prompt || `Educational illustration of ${slideTitle}`,
                description: parsed.description || slideTitle,
                formula: parsed.formula,
                steps: parsed.steps,
            };
        }
    } catch (error) {
        console.warn('⚠️ AI prompt analysis failed, using fallback:', error);
    }

    // Fallback to basic prompt
    return {
        type: 'concept',
        prompt: `Educational illustration showing the concept of "${slideTitle}". Use visual metaphors and diagrams to represent the key ideas. NotebookLM style with warm colors and hand-drawn aesthetic.`,
        description: slideTitle,
    };
}

/**
 * Generate a process visualization prompt
 */
export function generateProcessPrompt(
    processName: string,
    steps: string[],
    direction: 'left-to-right' | 'top-to-bottom' = 'left-to-right'
): string {
    const stepDescriptions = steps.map((step, i) => `Step ${i + 1}: ${step}`).join(', ');
    const layout = direction === 'left-to-right' ? 'horizontally from left to right' : 'vertically from top to bottom';

    return `A process diagram showing "${processName}" arranged ${layout}. 
${steps.length} stages connected by arrows: ${stepDescriptions}. 
Each stage in a rounded rectangle or circle. 
Use consistent visual style with icons representing each stage.
Clean educational diagram style with clear visual hierarchy.`;
}

/**
 * Generate a comparison visualization prompt
 */
export function generateComparisonPrompt(
    concept1: string,
    concept2: string,
    differences: string[]
): string {
    const diffText = differences.length > 0
        ? `Key differences shown: ${differences.join(', ')}.`
        : '';

    return `A side-by-side comparison diagram dividing the image in half.
Left side: Visual representation of "${concept1}" with relevant icons and flow.
Right side: Visual representation of "${concept2}" with corresponding elements.
VS or dividing line in the center.
${diffText}
Use contrasting but harmonious colors for each side.
Clean educational comparison layout.`;
}

/**
 * Generate a formula visualization prompt
 */
export function generateFormulaVisualizationPrompt(
    formula: string,
    conceptName: string,
    variables: { symbol: string; meaning: string }[]
): string {
    const variableDescriptions = variables
        .map(v => `${v.symbol} represents ${v.meaning}`)
        .join('; ');

    return `A visual representation of the concept behind "${conceptName}".
Show the mathematical relationship visually: ${variableDescriptions}.
Use geometric shapes, graphs, or diagrams to illustrate how the variables relate.
Include visual metaphors that make the formula intuitive.
Educational diagram style with clear annotations (but no text labels in the image itself).`;
}

/**
 * Generate a sequence visualization prompt (like diffusion)
 */
export function generateSequencePrompt(
    sequenceName: string,
    startState: string,
    endState: string,
    numSteps: number = 4,
    direction: 'forward' | 'reverse' = 'forward'
): string {
    const stateOrder = direction === 'forward'
        ? `from "${startState}" to "${endState}"`
        : `from "${endState}" to "${startState}"`;

    return `A horizontal sequence of ${numSteps} frames showing the "${sequenceName}" process ${stateOrder}.
Leftmost frame shows the ${direction === 'forward' ? 'initial' : 'final'} state: ${direction === 'forward' ? startState : endState}.
Each subsequent frame shows gradual transformation.
Rightmost frame shows the ${direction === 'forward' ? 'final' : 'initial'} state: ${direction === 'forward' ? endState : startState}.
Arrows between each frame indicating the direction of transformation.
Clean educational diagram style, consistent visual representation across all frames.`;
}

// ============================================================================
// ENHANCED SLIDE IMAGE PROMPT GENERATION
// ============================================================================

/**
 * Enhance a basic image prompt with concept-specific details
 */
export async function enhanceImagePrompt(
    basicPrompt: string,
    narration: string,
    slideTitle: string,
    slideType: string
): Promise<{ prompt: string; formula?: string }> {
    // Get concept-aware analysis
    const analysis = await analyzeAndGeneratePrompt(narration, slideTitle, slideType);

    // Combine basic prompt with concept-specific details
    let enhancedPrompt = analysis.prompt;

    // Add style instructions
    enhancedPrompt += `

Visual Style:
- Hand-drawn illustration aesthetic like Google NotebookLM
- Warm cream/yellow background (#FEF9E7)
- Soft watercolor textures with pencil strokes
- NO text or labels in the image
- High contrast for visibility
- Educational and friendly feel`;

    return {
        prompt: enhancedPrompt,
        formula: analysis.formula,
    };
}

/**
 * Render a LaTeX formula to SVG for slide display
 * (Uses KaTeX which is already in the project)
 */
export function getFormulaLatex(conceptKey: string): string | undefined {
    const template = CONCEPT_TEMPLATES[conceptKey.toLowerCase()];
    return template?.formula;
}
