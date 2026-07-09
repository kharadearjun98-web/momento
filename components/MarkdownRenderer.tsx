/**
 * MarkdownRenderer Component
 * 
 * Industry-standard markdown + LaTeX rendering using:
 * - react-markdown for markdown parsing
 * - remark-math for math detection in AST
 * - rehype-katex for KaTeX rendering
 * - remark-gfm for GitHub Flavored Markdown (tables, etc.)
 * 
 * ROBUST LATEX RENDERING SOLUTION:
 * - Handles AI-generated LaTeX with common mistakes (pipes instead of backslashes)
 * - Preprocesses content to normalize delimiters
 * - Properly handles unwrapped/loose math expressions
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * Check if content contains LaTeX-like mathematical patterns
 */
function containsLatexPatterns(content: string): boolean {
    if (!content) return false;
    
    // LaTeX command patterns - comprehensive list
    const hasLatexCommand = /\\(mathcal|mathbb|mathbf|mathrm|mathit|text|frac|sqrt|left|right|sum|int|prod|lim|log|exp|sin|cos|tan|quad|cdot|dots|ldots|mid|sim|big|Big|epsilon|alpha|beta|gamma|delta|theta|sigma|lambda|mu|pi|omega|phi|psi|rho|tau|Sigma|Lambda|Omega|Uniform|approx|neq|leq|geq|times|div|pm|infty|partial|nabla|forall|exists|in|subset|cup|cap|rightarrow|leftarrow|Rightarrow|Leftarrow|circ|cdots|vdots|ddots|binom|choose|over|atop)/i.test(content);
    
    // Has backslash (likely LaTeX)
    const hasBackslash = content.includes('\\');
    
    // Subscript/superscript with braces like x_{t-1} or x^{2}
    const hasSubscriptSuper = /[_^]\{[^}]+\}/.test(content);
    
    // Simple subscript like x_t
    const hasSimpleSubscript = /[a-zA-Z]_[a-zA-Z0-9]/.test(content);
    
    // Has curly braces (common in LaTeX)
    const hasBraces = /\{[^}]+\}/.test(content);
    
    // Has equals with mathematical notation
    const hasEquation = /=.*[_^\\{]/.test(content) || /[_^\\{].*=/.test(content);
    
    return hasLatexCommand || (hasBackslash && hasBraces) || hasSubscriptSuper || 
           (hasSimpleSubscript && (hasBackslash || hasBraces)) || hasEquation;
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
 * Preprocess content to handle AI model output variations
 * Converts non-standard delimiters to standard $...$ and $$...$$ format
 * 
 * ROBUST PREPROCESSING STRATEGY:
 * 1. Protect code blocks
 * 2. Fix AI hallucinations (pipes instead of backslashes)
 * 3. Remove errant dollar signs from within LaTeX commands
 * 4. Standardize delimiters
 * 5. Handle loose/unwrapped math
 * 6. Restore protected blocks
 */

/**
 * Remove errant $ signs from within LaTeX command braces
 * Handles nested braces properly
 */
function cleanDollarsFromBraces(content: string): string {
    // Find LaTeX commands followed by braces and clean $ from inside
    let result = content;
    
    // Pattern to match \command{...} where ... may contain errant $
    const commandPattern = /\\(boxed|frac|sqrt|text|mathbf|mathit|mathrm|mathcal|mathbb|operatorname|left|right|begin|end)\{/g;
    
    let match;
    let lastIndex = 0;
    let output = '';
    
    while ((match = commandPattern.exec(result)) !== null) {
        output += result.slice(lastIndex, match.index);
        
        const cmdStart = match.index;
        const braceStart = cmdStart + match[0].length - 1; // Position of {
        
        // Find the matching closing brace
        let depth = 1;
        let i = braceStart + 1;
        while (i < result.length && depth > 0) {
            if (result[i] === '{') depth++;
            else if (result[i] === '}') depth--;
            i++;
        }
        
        const braceEnd = i - 1; // Position of matching }
        const insideBraces = result.slice(braceStart + 1, braceEnd);
        
        // Remove errant $ signs from inside, but preserve \$ (escaped)
        const cleanedInside = insideBraces
            .replace(/(?<!\\)\$([A-Z])/g, '($1')  // $H -> (H
            .replace(/([A-Z])\$(?!\$)/g, '$1)')    // H$ -> H)
            .replace(/\s*\$\s*(?=[,\s}])/g, '')    // stray $ before comma/space/brace
            .replace(/(?<=[{\s,])\$\s*/g, '');      // stray $ after brace/space/comma
        
        output += match[0] + cleanedInside + '}';
        lastIndex = braceEnd + 1;
        
        // Reset regex lastIndex to continue after this match
        commandPattern.lastIndex = lastIndex;
    }
    
    output += result.slice(lastIndex);
    return output;
}

function preprocessContent(content: string): string {
    if (!content) return '';

    let processed = content;
    
    // ==========================================
    // STEP 1: The AI is using $ as parentheses - convert them!
    // Pattern: $x or $\mu or $\sigma -> just the content
    // Pattern: x) or \mu) or \sigma) -> proper closing  
    // ==========================================
    
    // First, protect legitimate math blocks that are properly formatted
    // These are rare but we should keep them
    const legitimateMath: string[] = [];
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (match, inner) => {
        // Only protect if inner doesn't have the broken patterns
        if (!inner.includes('$') && inner.includes('\\')) {
            legitimateMath.push(match);
            return `__LEGIT_MATH_${legitimateMath.length - 1}__`;
        }
        return match;
    });
    
    // The AI uses $x instead of (x - replace $LETTER with (LETTER
    processed = processed.replace(/\$([a-zA-Z](?![a-zA-Z]))/g, '($1');
    
    // The AI uses $\command instead of (\command - but we want just \command
    processed = processed.replace(/\$\\([a-zA-Z]+)/g, '\\$1');
    
    // The AI uses LETTER) or \command) as closing - these should stay as )
    // But first fix $$ that appear randomly
    processed = processed.replace(/\$\$/g, ' ');
    
    // Now clean remaining stray $
    processed = processed.replace(/\$/g, '');
    
    // Restore legitimate math
    processed = processed.replace(/__LEGIT_MATH_(\d+)__/g, (_, i) => legitimateMath[parseInt(i)]);
    
    // ==========================================
    // STEP 2: Now wrap LaTeX commands in proper $ delimiters
    // ==========================================
    
    // Protect code blocks
    const codeBlocks: string[] = [];
    processed = processed.replace(/(```[\s\S]*?```|`[^`]+`)/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    // Replace Unicode math characters
    const unicodeToLatex: Record<string, string> = {
        '∣': '\\mid', '→': '\\rightarrow', '←': '\\leftarrow',
        '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx',
        '∞': '\\infty', '∑': '\\sum', '∏': '\\prod', '∫': '\\int',
        '∈': '\\in', '×': '\\times', '±': '\\pm', '·': '\\cdot',
        'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
        'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'π': '\\pi',
        'σ': '\\sigma', 'φ': '\\phi', 'ω': '\\omega',
    };
    for (const [u, l] of Object.entries(unicodeToLatex)) {
        processed = processed.split(u).join(l);
    }
    
    // ==========================================
    // STEP 3: Identify and wrap complete math expressions
    // ==========================================
    
    // Wrap display equations: lines starting with f(x) = or containing \frac at start
    processed = processed.replace(
        /^(f\(x\)\s*=\s*\\frac\{[^]*?)$/gm,
        (match) => `$$${match}$$`
    );
    
    // Wrap \frac{...}{...} expressions
    processed = processed.replace(
        /(?<!\$)(\\frac\{[^}]+\}\{[^}]+\})/g,
        (match) => `$${match}$`
    );
    
    // Wrap \sqrt{...} expressions  
    processed = processed.replace(
        /(?<!\$)(\\sqrt\{[^}]+\})/g,
        (match) => `$${match}$`
    );
    
    // Wrap \exp\{...} or \exp(...) expressions
    processed = processed.replace(
        /(?<!\$)(\\exp[^a-zA-Z][^\s,;.]*)/g,
        (match) => `$${match}$`
    );
    
    // Wrap standalone Greek letters: \mu, \sigma, \pi, etc.
    processed = processed.replace(
        /(?<!\$)\\(mu|sigma|pi|alpha|beta|gamma|delta|theta|lambda|epsilon|phi|omega|Sigma|Pi|Omega)(?![a-zA-Z])/g,
        (match) => `$${match}$`
    );
    
    // Wrap expressions with subscripts/superscripts: x_i, x^2, etc.
    processed = processed.replace(
        /(?<!\$)\b([a-zA-Z])([_^])(\{[^}]+\}|\d|[a-zA-Z])/g,
        (match) => `$${match}$`
    );
    
    // ==========================================
    // STEP 4: Clean up the mess
    // ==========================================
    
    // Fix double-wrapped: $$...$$ inside $...$
    processed = processed.replace(/\$\$\$+/g, '$$');
    processed = processed.replace(/\$+\$\$/g, '$$');
    
    // Fix empty math blocks
    processed = processed.replace(/\$\s*\$/g, '');
    processed = processed.replace(/\$\$\s*\$\$/g, '');
    
    // Clean up duplicate $$
    processed = processed.replace(/\$\$\$\$/g, '$$');
    
    // Restore code blocks
    processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_, i) => codeBlocks[parseInt(i)]);

    return processed;
}

/**
 * Citation click handler
 */
function handleCitationClick(num: number) {
    window.dispatchEvent(new CustomEvent('citation-click', { detail: { number: num } }));
}

/**
 * Process children to make citation patterns clickable
 */
function processCitations(children: React.ReactNode): React.ReactNode {
    if (children == null) return children;

    // Handle arrays of children
    if (Array.isArray(children)) {
        return children.map((child, i) => {
            const result = processCitations(child);
            // Return with key for arrays  
            if (Array.isArray(result)) {
                return <React.Fragment key={i}>{result}</React.Fragment>;
            }
            return result;
        });
    }

    // If it's a string, check for citation patterns
    if (typeof children === 'string') {
        if (/\[\d+\]/.test(children)) {
            const parts = children.split(/(\[\d+\])/g);
            return parts.map((part, index) => {
                const match = part.match(/^\[(\d+)\]$/);
                if (match) {
                    const num = parseInt(match[1]);
                    return (
                        <span
                            key={`citation-${num}-${index}`}
                            className="citation-link"
                            onClick={() => handleCitationClick(num)}
                            style={{
                                color: 'rgb(168, 85, 247)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                padding: '0 2px',
                                borderRadius: '2px',
                                transition: 'all 0.2s',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(168, 85, 247, 0.2)')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            [{num}]
                        </span>
                    );
                }
                return part;
            });
        }
        return children;
    }

    // For other primitives, just return
    if (typeof children === 'number' || typeof children === 'boolean') {
        return children;
    }

    // For React elements, we need to clone with processed children
    if (React.isValidElement(children)) {
        const childProps = children.props as { children?: React.ReactNode };
        if (childProps.children) {
            return React.cloneElement(children as React.ReactElement<{ children?: React.ReactNode }>, {
                children: processCitations(childProps.children)
            });
        }
    }

    return children;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
    const processedContent = preprocessContent(content);

    return (
        <div className={`markdown-content ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    // Helper to process citations in any text content
                    p: ({ node, children, ...props }) => {
                        const processedChildren = processCitations(children);
                        return (
                            <p
                                style={{
                                    color: '#cbd5e1',
                                    marginTop: '0.75rem',
                                    marginBottom: '0.75rem',
                                    lineHeight: 1.7,
                                }}
                                {...props}
                            >
                                {processedChildren}
                            </p>
                        );
                    },
                    // Custom link handling for citations
                    a: ({ node, children, href, ...props }) => {
                        // Check if it's a citation reference
                        const text = String(children);
                        const citationMatch = text.match(/^\[(\d+)\]$/);
                        if (citationMatch) {
                            const num = parseInt(citationMatch[1]);
                            return (
                                <span
                                    className="citation-link"
                                    onClick={() => handleCitationClick(num)}
                                    style={{
                                        color: 'rgb(168, 85, 247)',
                                        cursor: 'pointer',
                                        fontWeight: 500,
                                        padding: '0 2px',
                                        borderRadius: '2px',
                                    }}
                                >
                                    {text}
                                </span>
                            );
                        }
                        return <a href={href} {...props}>{children}</a>;
                    },
                    // Style code blocks
                    code: ({ node, className: codeClassName, children, ...props }) => {
                        // Check if it's inline code (no language class = inline)
                        const isInline = !codeClassName;
                        if (isInline) {
                            return (
                                <code
                                    className="inline-code"
                                    style={{
                                        backgroundColor: 'rgba(30, 35, 43, 0.8)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.9em',
                                        color: '#22d3ee',
                                    }}
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }
                        return (
                            <code className={codeClassName} {...props}>
                                {children}
                            </code>
                        );
                    },
                    // Style tables
                    table: ({ node, children, ...props }) => (
                        <div className="table-wrapper" style={{ overflowX: 'auto', margin: '1rem 0' }}>
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'separate',
                                    borderSpacing: 0,
                                    borderRadius: '0.5rem',
                                    overflow: 'hidden',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                                {...props}
                            >
                                {children}
                            </table>
                        </div>
                    ),
                    th: ({ node, children, ...props }) => (
                        <th
                            style={{
                                padding: '0.75rem 1rem',
                                textAlign: 'left',
                                fontWeight: 600,
                                color: '#f1f5f9',
                                backgroundColor: 'rgba(139, 92, 246, 0.15)',
                                borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
                            }}
                            {...props}
                        >
                            {children}
                        </th>
                    ),
                    td: ({ node, children, ...props }) => (
                        <td
                            style={{
                                padding: '0.75rem 1rem',
                                color: '#cbd5e1',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                            {...props}
                        >
                            {children}
                        </td>
                    ),
                    // Style headings
                    h1: ({ node, children, ...props }) => (
                        <h1
                            style={{
                                fontSize: '1.75rem',
                                fontWeight: 700,
                                color: '#f8fafc',
                                marginTop: '1.5rem',
                                marginBottom: '1rem',
                                paddingBottom: '0.5rem',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            }}
                            {...props}
                        >
                            {children}
                        </h1>
                    ),
                    h2: ({ node, children, ...props }) => (
                        <h2
                            style={{
                                fontSize: '1.375rem',
                                fontWeight: 600,
                                color: '#f1f5f9',
                                marginTop: '1.5rem',
                                marginBottom: '0.75rem',
                            }}
                            {...props}
                        >
                            {children}
                        </h2>
                    ),
                    h3: ({ node, children, ...props }) => (
                        <h3
                            style={{
                                fontSize: '1.125rem',
                                fontWeight: 600,
                                color: '#e2e8f0',
                                marginTop: '1.25rem',
                                marginBottom: '0.5rem',
                            }}
                            {...props}
                        >
                            {children}
                        </h3>
                    ),

                    // Style lists
                    ul: ({ node, children, ...props }) => (
                        <ul
                            style={{
                                color: '#cbd5e1',
                                marginTop: '0.5rem',
                                marginBottom: '0.5rem',
                                paddingLeft: '1.5rem',
                            }}
                            {...props}
                        >
                            {children}
                        </ul>
                    ),
                    li: ({ node, children, ...props }) => (
                        <li
                            style={{
                                marginBottom: '0.25rem',
                                lineHeight: 1.6,
                            }}
                            {...props}
                        >
                            {children}
                        </li>
                    ),
                    // Style blockquotes
                    blockquote: ({ node, children, ...props }) => (
                        <blockquote
                            style={{
                                borderLeft: '3px solid rgb(168, 85, 247)',
                                paddingLeft: '1rem',
                                marginLeft: 0,
                                marginTop: '1rem',
                                marginBottom: '1rem',
                                color: '#94a3b8',
                                fontStyle: 'italic',
                            }}
                            {...props}
                        >
                            {children}
                        </blockquote>
                    ),
                    // Style strong text
                    strong: ({ node, children, ...props }) => (
                        <strong style={{ color: '#f1f5f9', fontWeight: 600 }} {...props}>
                            {children}
                        </strong>
                    ),
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
}

export default MarkdownRenderer;
