/**
 * MermaidDiagram Component
 * 
 * Renders Mermaid diagram code as SVG visualizations
 */
import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid with dark theme
mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
        primaryColor: '#8B5CF6',
        primaryTextColor: '#fff',
        primaryBorderColor: '#6D28D9',
        lineColor: '#6D28D9',
        secondaryColor: '#1E1B4B',
        tertiaryColor: '#0F172A',
        background: '#0F172A',
        mainBkg: '#1E293B',
        nodeBkg: '#1E293B',
        nodeBorder: '#8B5CF6',
        clusterBkg: '#1E293B',
        clusterBorder: '#6D28D9',
        titleColor: '#fff',
        edgeLabelBackground: '#1E293B',
    },
    flowchart: {
        htmlLabels: false,
        curve: 'basis',
        padding: 15,
    },
    securityLevel: 'strict',
});

interface MermaidDiagramProps {
    code: string;
    caption?: string;
    className?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
    code,
    caption,
    className = ''
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const renderDiagram = async () => {
            if (!code) {
                setError('No diagram code provided');
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                setError(null);

                // Clean the code - remove any Diagram: prefix or caption
                let cleanCode = code.trim();
                cleanCode = cleanCode.replace(/^Diagram:.*$/gm, '').trim();
                cleanCode = cleanCode.replace(/^\*.*\*$/gm, '').trim();

                // Validate that it looks like mermaid code
                const validStart = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|requirementDiagram|gitGraph|timeline|mindmap|quadrantChart|xychart|sankey|block)/i;
                if (!validStart.test(cleanCode)) {
                    throw new Error('Invalid mermaid syntax - must start with diagram type');
                }

                // Generate unique ID
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).substring(7)}`;

                // Render the diagram with timeout
                const renderPromise = mermaid.render(id, cleanCode);
                const timeoutPromise = new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Diagram render timeout')), 10000)
                );

                const { svg: renderedSvg } = await Promise.race([renderPromise, timeoutPromise]);

                if (isMounted) {
                    setSvg(renderedSvg);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error('Mermaid rendering error:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err.message : 'Failed to render diagram');
                    setIsLoading(false);
                }
            }
        };

        // Small delay to ensure React has mounted
        const timer = setTimeout(renderDiagram, 100);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, [code]);

    if (isLoading) {
        return (
            <div className={`flex items-center justify-center p-8 bg-slate-800/50 rounded-xl border border-white/10 ${className}`}>
                <div className="flex items-center gap-3 text-slate-400">
                    <div className="w-5 h-5 border-2 border-memento-purple-500 border-t-transparent rounded-full animate-spin" />
                    <span>Rendering diagram...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`p-4 bg-red-500/10 rounded-xl border border-red-500/30 ${className}`}>
                <p className="text-red-400 text-sm font-medium mb-2">Diagram Error</p>
                <pre className="text-xs text-slate-400 overflow-x-auto whitespace-pre-wrap">
                    {code}
                </pre>
            </div>
        );
    }

    const srcDoc = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; background: transparent; color: white; }
    body { display: flex; justify-content: center; align-items: flex-start; min-height: 100%; }
    svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>${svg}</body>
</html>`;

    return (
        <figure className={`my-8 ${className}`}>
            <div
                ref={containerRef}
                className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-memento-purple-500/20 p-6 overflow-x-auto shadow-xl"
            >
                <iframe
                    title={caption || 'Mermaid diagram'}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts"
                    className="w-full min-h-[360px] border-0 bg-transparent"
                />
            </div>
            {caption && (
                <figcaption className="text-center text-sm text-slate-400 mt-3 italic">
                    {caption}
                </figcaption>
            )}
        </figure>
    );
};

export function extractMermaidBlocks(content: string): {
    content: string;
    blocks: Array<{ code: string; caption?: string; placeholder: string }>
} {
    const blocks: Array<{ code: string; caption?: string; placeholder: string }> = [];
    let processedContent = content;
    let placeholderIndex = 0;

    // Match ```mermaid ... ``` blocks (standard markdown code blocks)
    const mermaidCodeBlockRegex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = mermaidCodeBlockRegex.exec(content)) !== null) {
        const code = match[1].trim();
        const placeholder = `__MERMAID_BLOCK_${placeholderIndex}__`;

        // Look for caption after the code block
        const afterBlock = content.slice(match.index + match[0].length);
        const captionMatch = afterBlock.match(/^\s*\n?\*([^*\n]+)\*/);
        const caption = captionMatch?.[1]?.trim();

        blocks.push({ code, caption, placeholder });

        // Replace including caption if found
        const replaceText = captionMatch
            ? match[0] + captionMatch[0]
            : match[0];
        processedContent = processedContent.replace(replaceText, placeholder);
        placeholderIndex++;
    }

    // Match standalone flowchart/graph blocks that are clearly mermaid
    // Only match when it's a complete block with proper structure
    const looseMermaidRegex = /^((?:flowchart|graph)\s+(?:TD|TB|LR|RL|BT)\s*\n(?:\s+[A-Z]\[[^\]]+\].*\n?)+)/gm;

    // Reset regex lastIndex
    looseMermaidRegex.lastIndex = 0;

    while ((match = looseMermaidRegex.exec(processedContent)) !== null) {
        // Skip if already processed
        if (match[0].includes('__MERMAID_BLOCK_')) continue;

        const code = match[1].trim();
        const placeholder = `__MERMAID_BLOCK_${placeholderIndex}__`;

        // Look for caption after
        const afterBlock = processedContent.slice(match.index + match[0].length);
        const captionMatch = afterBlock.match(/^\s*\n?\*([^*\n]+)\*/);
        const caption = captionMatch?.[1]?.trim();

        blocks.push({ code, caption, placeholder });

        const replaceEnd = captionMatch
            ? match.index + match[0].length + captionMatch[0].length
            : match.index + match[0].length;

        processedContent = processedContent.slice(0, match.index) + placeholder + processedContent.slice(replaceEnd);
        placeholderIndex++;
    }

    return { content: processedContent, blocks };
}

export default MermaidDiagram;
