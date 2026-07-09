/**
 * Markdown Renderer Utility with KaTeX Math Support
 * Use this for rendering AI-generated content with proper formatting
 * 
 * ROBUST LATEX RENDERING SOLUTION:
 * - Handles AI-generated LaTeX with common mistakes (pipes instead of backslashes)
 * - Preprocesses content to normalize delimiters
 * - Uses isolation rendering to prevent markdown parser from mangling math
 * - Properly configures sanitization to preserve KaTeX output
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const SANITIZE_FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed'];
const SANITIZE_FORBID_ATTR = ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout'];

let citationDelegationInitialized = false;

function ensureCitationDelegation() {
    if (citationDelegationInitialized || typeof document === 'undefined' || typeof window === 'undefined') {
        return;
    }

    citationDelegationInitialized = true;
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const citation = target.closest<HTMLElement>('.citation-link[data-citation-id]');
        if (!citation) return;

        const citationId = citation.dataset.citationId;
        if (!citationId || !/^\d+$/.test(citationId)) return;

        event.preventDefault();
        window.dispatchEvent(new CustomEvent('citation-click', {
            detail: { number: Number(citationId) },
        }));
    });
}

// Configure DOMPurify to allow KaTeX-specific elements and classes
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (node.nodeType === 1) { // Element node
        const element = node as Element;
        const classAttr = element.getAttribute('class') || '';
        // Whitelist common KaTeX classes
        if (classAttr.includes('katex') || classAttr.includes('mord') || 
            classAttr.includes('mfrac') || classAttr.includes('sqrt') ||
            classAttr.includes('mbin') || classAttr.includes('mrel') ||
            classAttr.includes('mopen') || classAttr.includes('mclose') ||
            classAttr.includes('mpunct') || classAttr.includes('minner') ||
            classAttr.includes('mop') || classAttr.includes('mtight') ||
            classAttr.includes('vlist') || classAttr.includes('strut') ||
            classAttr.includes('frac-line') || classAttr.includes('base') ||
            classAttr.includes('newline') || classAttr.includes('nulldelimiter') ||
            classAttr.includes('delimsizing') || classAttr.includes('sizing') ||
            classAttr.includes('reset-') || classAttr.includes('size')) {
            data.allowedTags[data.tagName] = true;
        }
    }
});

marked.setOptions({
    breaks: true,
    gfm: true,
});

/**
 * Check if content contains LaTeX-like mathematical patterns
 * This function is intentionally conservative to avoid false positives
 */
function containsLatexPatterns(content: string): boolean {
    if (!content) return false;
    
    // Must have a backslash to be considered LaTeX (essential requirement)
    if (!content.includes('\\')) {
        return false;
    }
    
    // LaTeX command patterns - these are strong indicators
    const hasLatexCommand = /\\(mathcal|mathbb|mathbf|mathrm|mathit|text|frac|sqrt|left|right|sum|int|prod|lim|log|exp|sin|cos|tan|quad|cdot|dots|ldots|mid|sim|big|Big|epsilon|alpha|beta|gamma|delta|theta|sigma|lambda|mu|pi|omega|phi|psi|rho|tau|Sigma|Lambda|Omega|Uniform|approx|neq|leq|geq|times|div|pm|infty|partial|nabla|forall|exists|in|subset|cup|cap|rightarrow|leftarrow|Rightarrow|Leftarrow|circ|cdots|vdots|ddots|binom|choose|over|atop)\b/i.test(content);
    
    // If it has a recognized LaTeX command, it's definitely LaTeX
    if (hasLatexCommand) {
        return true;
    }
    
    // Subscript/superscript with braces like x_{t-1} or x^{2} combined with backslash
    const hasSubscriptSuperWithBackslash = /[_^]\{[^}]+\}/.test(content);
    
    return hasSubscriptSuperWithBackslash;
}

/**
 * CRITICAL: Fix common AI hallucinations
 * AI models often output pipes | instead of backslashes \ for LaTeX commands
 */
const pipeToBackslash: Record<string, string> = {
    '|frac{': '\\frac{',
    '|frac ': '\\frac ',
    '|sum{': '\\sum{',
    '|sum_': '\\sum_',
    '|sum^': '\\sum^',
    '|prod{': '\\prod{',
    '|prod_': '\\prod_',
    '|int_': '\\int_',
    '|int^': '\\int^',
    '|lim_': '\\lim_',
    '|lim{': '\\lim{',
    '|log': '\\log',
    '|exp': '\\exp',
    '|sin': '\\sin',
    '|cos': '\\cos',
    '|tan': '\\tan',
    '|mu': '\\mu',
    '|sigma': '\\sigma',
    '|Sigma': '\\Sigma',
    '|lambda': '\\lambda',
    '|Lambda': '\\Lambda',
    '|alpha': '\\alpha',
    '|beta': '\\beta',
    '|gamma': '\\gamma',
    '|Gamma': '\\Gamma',
    '|delta': '\\delta',
    '|Delta': '\\Delta',
    '|theta': '\\theta',
    '|Theta': '\\Theta',
    '|omega': '\\omega',
    '|Omega': '\\Omega',
    '|phi': '\\phi',
    '|Phi': '\\Phi',
    '|psi': '\\psi',
    '|Psi': '\\Psi',
    '|pi': '\\pi',
    '|Pi': '\\Pi',
    '|epsilon': '\\epsilon',
    '|varepsilon': '\\varepsilon',
    '|rho': '\\rho',
    '|tau': '\\tau',
    '|eta': '\\eta',
    '|zeta': '\\zeta',
    '|nu': '\\nu',
    '|xi': '\\xi',
    '|kappa': '\\kappa',
    '|chi': '\\chi',
    '|iota': '\\iota',
    '|cdot': '\\cdot',
    '|cdots': '\\cdots',
    '|ldots': '\\ldots',
    '|vdots': '\\vdots',
    '|ddots': '\\ddots',
    '|approx': '\\approx',
    '|neq': '\\neq',
    '|leq': '\\leq',
    '|geq': '\\geq',
    '|times': '\\times',
    '|div': '\\div',
    '|pm': '\\pm',
    '|mp': '\\mp',
    '|infty': '\\infty',
    '|partial': '\\partial',
    '|nabla': '\\nabla',
    '|forall': '\\forall',
    '|exists': '\\exists',
    '|in': '\\in',
    '|notin': '\\notin',
    '|subset': '\\subset',
    '|supset': '\\supset',
    '|cup': '\\cup',
    '|cap': '\\cap',
    '|emptyset': '\\emptyset',
    '|sqrt': '\\sqrt',
    '|left': '\\left',
    '|right': '\\right',
    '|rightarrow': '\\rightarrow',
    '|leftarrow': '\\leftarrow',
    '|Rightarrow': '\\Rightarrow',
    '|Leftarrow': '\\Leftarrow',
    '|leftrightarrow': '\\leftrightarrow',
    '|Leftrightarrow': '\\Leftrightarrow',
    '|quad': '\\quad',
    '|qquad': '\\qquad',
    '|text': '\\text',
    '|mathcal': '\\mathcal',
    '|mathbb': '\\mathbb',
    '|mathbf': '\\mathbf',
    '|mathrm': '\\mathrm',
    '|mathit': '\\mathit',
    '|binom': '\\binom',
    '|choose': '\\choose',
    '|over': '\\over',
    '|atop': '\\atop',
    '|big': '\\big',
    '|Big': '\\Big',
    '|bigg': '\\bigg',
    '|Bigg': '\\Bigg',
    '|mid': '\\mid',
    '|sim': '\\sim',
    '|equiv': '\\equiv',
    '|cong': '\\cong',
    '|propto': '\\propto',
    '|perp': '\\perp',
    '|parallel': '\\parallel',
    '|angle': '\\angle',
    '|circ': '\\circ',
    '|prime': '\\prime',
    '|hat': '\\hat',
    '|bar': '\\bar',
    '|tilde': '\\tilde',
    '|vec': '\\vec',
    '|dot': '\\dot',
    '|ddot': '\\ddot',
    '|overbrace': '\\overbrace',
    '|underbrace': '\\underbrace',
    '|overline': '\\overline',
    '|underline': '\\underline',
};

/**
 * Preprocess content to normalize various LaTeX delimiter formats
 * AI models sometimes use different delimiter styles or make syntax errors
 * 
 * ROBUST PREPROCESSING STRATEGY:
 * 1. Protect code blocks
 * 2. Protect existing correct delimiters
 * 3. Protect external placeholders (MERMAID_BLOCK, etc.)
 * 4. Fix AI hallucinations (pipes instead of backslashes)
 * 5. Standardize delimiters
 * 6. Handle loose/unwrapped math
 * 7. Restore protected blocks
 */
export function preprocessMath(content: string): string {
    if (!content) return content;

    let processed = content;

    // 0. Protect external placeholders (like MERMAID_BLOCK) from markdown processing
    const externalPlaceholders: string[] = [];
    processed = processed.replace(/__([A-Z_]+)_(\d+)__/g, (match) => {
        externalPlaceholders.push(match);
        return `__EXTERNAL_PLACEHOLDER_${externalPlaceholders.length - 1}__`;
    });

    // 1. Protect code blocks to avoid replacing math inside them
    const codeBlocks: string[] = [];
    processed = processed.replace(
        /(```[\s\S]*?```|`[^`]+`)/g,
        (match) => {
            // Check if the content inside backticks looks like math
            // If it contains LaTeX commands, treat it as math, not code
            const innerContent = match.replace(/^`+|`+$/g, '');
            if (containsLatexPatterns(innerContent)) {
                // It's math disguised as code - don't protect it
                return innerContent;
            }
            codeBlocks.push(match);
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        }
    );

    // 2. Protect existing math delimiters to avoid processing them again
    const mathBlocks: string[] = [];
    // Protect \[...\] and \(...\)
    processed = processed.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g, (match) => {
        mathBlocks.push(match);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 3. CRITICAL: Fix common AI hallucinations (Pipes instead of Backslashes)
    for (const [from, to] of Object.entries(pipeToBackslash)) {
        processed = processed.split(from).join(to);
    }

    // 4. Convert display math $$...$$ to \[...\]
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, p1) => {
        const result = `\\[${p1.trim()}\\]`;
        mathBlocks.push(result);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 5. Convert inline math $...$ to \(...\)
    processed = processed.replace(/\$([^$\n]+?)\$/g, (match, p1) => {
        if (match.startsWith('$$') || match.endsWith('$$')) return match;
        const result = `\\(${p1}\\)`;
        mathBlocks.push(result);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 6. Handle [...] display math - ROBUST MULTI-LINE DETECTION
    processed = processed.replace(/\[([^\]]+)\]/gs, (match, p1) => {
        // Skip if it's a citation like [1] or [12]
        if (/^\d+$/.test(p1.trim())) return match;

        // Skip if it looks like a simple link reference [text]
        if (/^[a-zA-Z0-9_-]+$/.test(p1.trim())) return match;

        // Skip if already a math block placeholder
        if (p1.includes('__MATH_BLOCK_')) return match;

        // Skip markdown link text patterns like [link text](url)
        if (/^\s*[a-zA-Z][a-zA-Z\s]*\s*$/.test(p1) && !p1.includes('\\')) return match;

        // Check for mathematical content
        if (containsLatexPatterns(p1)) {
            const result = `\\[${p1.trim()}\\]`;
            mathBlocks.push(result);
            return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
        }

        return match;
    });

    // 7. Handle AI-generated ((LaTeX)) patterns
    processed = processed.replace(/\(\(([^)]+)\)\)/g, (match, p1) => {
        if (containsLatexPatterns(p1)) {
            const result = `\\(${p1}\\)`;
            mathBlocks.push(result);
            return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
        }
        return match;
    });

    // 8. Handle \tag{N} patterns - remove them
    processed = processed.replace(/\\tag\{[^}]*\}/g, '');

    // 9. Handle loose \mathcal{N}(... patterns outside of any delimiters
    processed = processed.replace(/(?<![\\$])\\mathcal\s*\{([^}]+)\}\s*\(([^)]+)\)/g, (match, arg1, arg2) => {
        if (match.includes('__MATH_BLOCK_')) return match;
        const result = `\\(\\mathcal{${arg1}}(${arg2})\\)`;
        mathBlocks.push(result);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 10. Handle standalone LaTeX commands that appear outside delimiters
    processed = processed.replace(/(?<![\\$])\\(alpha|beta|gamma|delta|theta|sigma|lambda|mu|pi|omega|phi|psi|rho|tau|epsilon|Sigma|Lambda|Omega)(_\{[^}]+\}|_[a-zA-Z0-9])?/g, (match) => {
        if (match.includes('__MATH_BLOCK_')) return match;
        const result = `\\(${match}\\)`;
        mathBlocks.push(result);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 11. AGGRESSIVE: Detect unwrapped formulas with strong math indicators
    // Look for patterns like \frac{...}{...} that aren't in delimiters
    processed = processed.replace(/(?<![\\$_])\\(frac|sqrt|sum|prod|int|lim)\s*\{[^}]+\}(\s*\{[^}]+\})?(\s*[_^]\s*\{[^}]+\})?/g, (match) => {
        // Skip if already in a math block
        if (match.includes('__MATH_BLOCK_')) return match;
        const result = `\\[${match.trim()}\\]`;
        mathBlocks.push(result);
        return `__MATH_BLOCK_${mathBlocks.length - 1}__`;
    });

    // 12. Handle standalone \dots, \ldots, \cdots - convert to proper ellipsis
    processed = processed.replace(/(?<![\\$])\\(l?dots|cdots)\b/g, '…');

    // 13. Restore math blocks
    processed = processed.replace(/__MATH_BLOCK_(\d+)__/g, (_, p1) => mathBlocks[parseInt(p1)]);

    // 14. Restore code blocks
    processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_, p1) => codeBlocks[parseInt(p1)]);

    // 15. Restore external placeholders (MERMAID_BLOCK, etc.)
    processed = processed.replace(/__EXTERNAL_PLACEHOLDER_(\d+)__/g, (_, p1) => externalPlaceholders[parseInt(p1)]);

    return processed;
}

/**
 * Render markdown content with proper formatting and math support
 * 
 * ISOLATION RENDERING STRATEGY:
 * To ensure marked (the Markdown parser) doesn't mangle detailed LaTeX equations
 * (like treating _ as italics inside a formula), we:
 * 1. Extract the math
 * 2. Render it separately with KaTeX
 * 3. Re-inject the rendered HTML
 */
export function renderMarkdown(content: string): string {
    if (!content) return '';

    ensureCitationDelegation();

    let processed = preprocessMath(content);

    // Debug: Check if preprocessing converted [...] to \[...\]
    if (process.env.NODE_ENV === 'development' && content.includes('[') && content.includes('\\')) {
        console.log('[renderMarkdown] Preprocessed content sample:', processed.substring(0, 500));
    }

    // Protect external placeholders (like __MERMAID_BLOCK_0__) from markdown processing
    // The underscores would be interpreted as emphasis/bold markers
    const externalPlaceholders: string[] = [];
    processed = processed.replace(/__([A-Z_]+)_(\d+)__/g, (match) => {
        externalPlaceholders.push(match);
        return `EXTERNALPLACEHOLDER${externalPlaceholders.length - 1}ENDPLACEHOLDER`;
    });

    // ISOLATION RENDERING: Extract Math Blocks -> Render to HTML -> Store as Placeholder
    const mathReplacements: Record<string, string> = {};
    let mathIndex = 0;

    // Handle Display Math \[...\]
    processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => {
        try {
            const html = katex.renderToString(tex.trim(), {
                displayMode: true,
                throwOnError: false,
                output: 'html',
                trust: false,
                strict: 'warn',
            });
            const key = `KATEXDISPLAYBLOCK${mathIndex++}END`;
            mathReplacements[key] = `<div class="katex-display">${html}</div>`;
            return key;
        } catch (e) {
            console.warn('[renderMarkdown] KaTeX display error:', e, 'for:', tex);
            return match;
        }
    });

    // Handle Inline Math \(...\)
    processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, tex) => {
        try {
            const html = katex.renderToString(tex.trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html',
                trust: false,
                strict: 'warn',
            });
            const key = `KATEXINLINEBLOCK${mathIndex++}END`;
            mathReplacements[key] = html;
            return key;
        } catch (e) {
            console.warn('[renderMarkdown] KaTeX inline error:', e, 'for:', tex);
            return match;
        }
    });

    // Render the Markdown (now free of complex math syntax)
    let html = marked.parse(processed) as string;

    // Swap placeholders back to the rendered Math HTML
    Object.keys(mathReplacements).forEach(key => {
        html = html.split(key).join(mathReplacements[key]);
    });

    // Restore external placeholders
    externalPlaceholders.forEach((placeholder, idx) => {
        html = html.split(`EXTERNALPLACEHOLDER${idx}ENDPLACEHOLDER`).join(placeholder);
    });

    // Debug: Check if KaTeX HTML was injected
    if (process.env.NODE_ENV === 'development' && content.includes('[') && !html.includes('katex')) {
        console.warn('[renderMarkdown] KaTeX not rendered! HTML sample:', html.substring(0, 500));
    }

    // Make citation patterns like [1], [2] clickable
    html = html.replace(/\[(\d+)\]/g, (match, num) => {
        return `<span class="citation-link" data-citation-id="${num}">[${num}]</span>`;
    });

    // Allow KaTeX-specific elements and attributes
    return DOMPurify.sanitize(html, {
        ADD_ATTR: ['data-citation-id', 'aria-hidden', 'focusable', 'role', 'style'],
        ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mtext', 'annotation', 'semantics', 'mspace', 'mover', 'munder', 'mtable', 'mtr', 'mtd', 'menclose', 'mroot', 'msqrt', 'mstyle', 'mpadded', 'mphantom', 'mglyph'],
        ADD_URI_SAFE_ATTR: ['xmlns', 'xmlns:xlink'],
        ALLOW_DATA_ATTR: true,
        // Allow all class names for KaTeX
        FORBID_TAGS: SANITIZE_FORBID_TAGS,
        FORBID_ATTR: SANITIZE_FORBID_ATTR,
    });
}

/**
 * Render inline markdown content (no P tags, for labels/buttons)
 * Uses the same isolation rendering strategy as renderMarkdown
 */
export function renderInlineMarkdown(content: string): string {
    if (!content) return '';

    let processed = preprocessMath(content);

    // ISOLATION RENDERING: Extract Math Blocks -> Render to HTML -> Store as Placeholder
    const mathReplacements: Record<string, string> = {};
    let mathIndex = 0;

    // Handle Display Math \[...\] (convert to inline for this context)
    processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => {
        try {
            const html = katex.renderToString(tex.trim(), {
                displayMode: false, // Keep inline for inline context
                throwOnError: false,
                output: 'html',
                trust: false,
                strict: 'warn',
            });
            const key = `KATEXINLINE${mathIndex++}END`;
            mathReplacements[key] = html;
            return key;
        } catch (e) {
            return match;
        }
    });

    // Handle Inline Math \(...\)
    processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (match, tex) => {
        try {
            const html = katex.renderToString(tex.trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html',
                trust: false,
                strict: 'warn',
            });
            const key = `KATEXINLINE${mathIndex++}END`;
            mathReplacements[key] = html;
            return key;
        } catch (e) {
            return match;
        }
    });

    // marked.parseInline is available in newer marked versions
    const html = marked.parseInline(processed) as string;

    // Swap placeholders back to the rendered Math HTML
    let result = html;
    Object.keys(mathReplacements).forEach(key => {
        result = result.split(key).join(mathReplacements[key]);
    });

    return DOMPurify.sanitize(result, {
        ADD_ATTR: ['aria-hidden', 'focusable', 'role', 'style'],
        ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'mtext', 'annotation', 'semantics', 'mspace', 'mover', 'munder'],
        ADD_URI_SAFE_ATTR: ['xmlns'],
        ALLOW_DATA_ATTR: true,
        FORBID_TAGS: SANITIZE_FORBID_TAGS,
        FORBID_ATTR: SANITIZE_FORBID_ATTR,
    });
}

/**
 * Strip markdown from content (for plain text contexts like TTS)
 */
export function stripMarkdown(content: string): string {
    if (!content) return '';

    return content
        // Remove bold/italic markers
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove links, keep text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bullet points
        .replace(/^[\s]*[-*+]\s+/gm, '')
        // Remove numbered lists
        .replace(/^[\s]*\d+\.\s+/gm, '')
        // Clean up extra whitespace
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
}

/**
 * CSS classes for properly styled markdown content
 */
export const markdownStyles = `
  prose prose-invert prose-base max-w-none
  
  /* Typography & Spacing */
  leading-relaxed
  
  /* Headings - Elegant & Distinct */
  prose-headings:font-display prose-headings:font-semibold prose-headings:text-white prose-headings:tracking-tight
  prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-6 prose-h1:pb-2 prose-h1:border-b prose-h1:border-white/10
  prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-white
  prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-slate-200 prose-h3:font-medium
  prose-h4:text-base prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-slate-300
  
  /* Text Elements */
  prose-p:text-slate-300 prose-p:my-4 prose-p:leading-7 prose-p:text-[15px]
  prose-strong:text-white prose-strong:font-semibold
  prose-em:text-indigo-200 prose-em:italic
  
  /* Code */
  prose-code:text-memento-accent-cyan prose-code:bg-[#1E232B] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm prose-code:font-mono prose-code:border prose-code:border-white/10
  prose-pre:bg-[#0D1117] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-pre:p-4 prose-pre:shadow-lg prose-pre:my-6
  [&_code]:before:content-none [&_code]:after:content-none
  
  /* Links */
  prose-a:text-memento-purple-400 prose-a:font-medium prose-a:no-underline hover:prose-a:text-memento-purple-300 hover:prose-a:underline transition-colors
  [&_.citation-link]:text-memento-purple-400 [&_.citation-link]:font-medium [&_.citation-link]:px-0.5 [&_.citation-link]:rounded-sm [&_.citation-link]:cursor-pointer hover:[&_.citation-link]:bg-memento-purple-500/20
  
  /* Lists */
  prose-ul:text-slate-300 prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-2
  prose-ol:text-slate-300 prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6 prose-ol:space-y-2
  prose-li:text-[15px] prose-li:marker:text-slate-500
  
  /* Blockquotes */
  prose-blockquote:border-l-2 prose-blockquote:border-memento-purple-500 prose-blockquote:bg-white/[0.02] prose-blockquote:text-slate-300 prose-blockquote:rounded-r-lg prose-blockquote:py-3 prose-blockquote:px-5 prose-blockquote:my-6 prose-blockquote:not-italic
  
  /* Horizontal Rules */
  prose-hr:border-white/10 prose-hr:my-8
  
  /* Tables - Elegant & Structured */
  prose-table:text-slate-300 prose-table:border-separate prose-table:border-spacing-0 prose-table:w-full prose-table:my-6 prose-table:text-sm prose-table:rounded-lg prose-table:border prose-table:border-white/10 prose-table:overflow-hidden
  prose-th:text-white prose-th:font-medium prose-th:bg-white/[0.04] prose-th:px-4 prose-th:py-3 prose-th:text-left prose-th:border-b prose-th:border-white/10 first:prose-th:rounded-tl-lg last:prose-th:rounded-tr-lg
  prose-td:px-4 prose-td:py-3 prose-td:border-b prose-td:border-white/5 prose-td:bg-transparent last:prose-tr:prose-td:border-b-0
  
  /* Math (KaTeX) - Display Math - Clean Teal Block Style */
  [&_.katex-display]:my-6 [&_.katex-display]:py-6 [&_.katex-display]:px-8
  [&_.katex-display]:bg-[#0d2a2a]
  [&_.katex-display]:rounded-xl [&_.katex-display]:overflow-x-auto 
  [&_.katex-display]:border [&_.katex-display]:border-cyan-500/15
  [&_.katex-display]:border-l-[3px] [&_.katex-display]:border-l-cyan-500/40
  [&_.katex-display]:shadow-lg
  [&_.katex-display]:text-center
  [&_.katex]:text-[#e2e8f0] [&_.katex]:font-normal [&_.katex]:text-[1.15em]
  [&_.katex-html]:overflow-x-auto [&_.katex-html]:max-w-full
  
  /* Inline math styling - Subtle teal */
  [&_span.katex]:bg-cyan-500/10 [&_span.katex]:px-1.5 [&_span.katex]:py-0.5 [&_span.katex]:rounded [&_span.katex]:text-slate-200
  
  /* Images */
  prose-img:rounded-lg prose-img:shadow-md prose-img:border prose-img:border-white/5 prose-img:my-6
  prose-figure:my-8
  prose-figcaption:text-center prose-figcaption:text-xs prose-figcaption:text-slate-500 prose-figcaption:mt-2
`;

