import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, RotateCcw, Download, ChevronRight, ChevronLeft, ThumbsUp, ThumbsDown, Expand, Shrink } from 'lucide-react';
import { GeneratedMindMap, MindMapNode, MindMapEdge } from '../types';
import { loadMindMapProgress, saveMindMapProgress } from '../lib/mindmapGenerator';

interface MindMapPlaybackProps {
  mindmap: GeneratedMindMap;
  onClose: () => void;
}

// Build tree structure from flat nodes/edges
interface TreeNode extends MindMapNode {
  children: TreeNode[];
  parent?: string;
}

function buildTree(nodes: MindMapNode[], edges: MindMapEdge[]): TreeNode {
  // Create node map
  const nodeMap = new Map<string, TreeNode>();
  nodes.forEach(n => {
    nodeMap.set(n.id, { ...n, children: [] });
  });

  // Build parent-child relationships
  const childIds = new Set<string>();
  edges.forEach(e => {
    const parent = nodeMap.get(e.source);
    const child = nodeMap.get(e.target);
    if (parent && child) {
      child.parent = e.source;
      parent.children.push(child);
      childIds.add(e.target);
    }
  });

  // Find root (node without parent, or central node)
  let root = nodes.find(n => n.type === 'central');
  if (!root) {
    root = nodes.find(n => !childIds.has(n.id));
  }
  if (!root && nodes.length > 0) {
    root = nodes[0];
  }

  return root ? nodeMap.get(root.id)! : { id: 'empty', label: 'Empty', type: 'central', children: [] };
}

export const MindMapPlayback: React.FC<MindMapPlaybackProps> = ({ mindmap, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feedback, setFeedback] = useState<'good' | 'bad' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build tree structure
  const tree = useMemo(() => buildTree(mindmap.nodes, mindmap.edges), [mindmap.nodes, mindmap.edges]);

  // Load previous progress
  useEffect(() => {
    const progress = loadMindMapProgress(mindmap.id);
    if (progress && progress.expandedNodes) {
      // Convert expanded to collapsed (inverse)
      const allIds = mindmap.nodes.map(n => n.id);
      const expanded = new Set(progress.expandedNodes);
      const collapsed = allIds.filter(id => !expanded.has(id));
      setCollapsedNodes(new Set(collapsed));
    }
  }, [mindmap.id, mindmap.nodes]);

  // Add wheel event listener with passive: false to fix the preventDefault error
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(0.3, Math.min(2, prev + delta)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedNode) {
          setSelectedNode(null);
        } else {
          onClose();
        }
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, onClose]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.3));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Toggle node collapse
  const toggleCollapse = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      // Save progress (store expanded nodes)
      const allIds = mindmap.nodes.map(n => n.id);
      const expandedNodes = allIds.filter(id => !next.has(id));
      saveMindMapProgress(mindmap.id, expandedNodes);
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    setCollapsedNodes(new Set());
    saveMindMapProgress(mindmap.id, mindmap.nodes.map(n => n.id));
  };

  const collapseAll = () => {
    const nodesWithChildren = mindmap.nodes.filter(n => {
      return mindmap.edges.some(e => e.source === n.id);
    }).map(n => n.id);
    setCollapsedNodes(new Set(nodesWithChildren));
    saveMindMapProgress(mindmap.id, []);
  };

  // Check if all nodes are collapsed
  const allCollapsed = useMemo(() => {
    const nodesWithChildren = mindmap.nodes.filter(n => 
      mindmap.edges.some(e => e.source === n.id)
    );
    return nodesWithChildren.every(n => collapsedNodes.has(n.id));
  }, [collapsedNodes, mindmap.nodes, mindmap.edges]);

  // Render a tree node recursively - NotebookLM horizontal style
  const renderTreeNode = (node: TreeNode, level: number = 0): React.ReactNode => {
    const isCollapsed = collapsedNodes.has(node.id);
    const hasChildren = node.children.length > 0;
    const isSelected = selectedNode?.id === node.id;
    const isCentral = node.type === 'central';

    return (
      <div key={node.id} className="flex items-center">
        {/* Left collapse button for central node */}
        {isCentral && hasChildren && (
          <button
            onClick={(e) => toggleCollapse(node.id, e)}
            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors mr-1 shrink-0"
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        )}

        {/* Node box */}
        <button
          onClick={() => setSelectedNode(isSelected ? null : node)}
          className={`
            relative px-4 py-2.5 rounded-lg border transition-all duration-200 text-left shrink-0
            ${isCentral 
              ? 'bg-gradient-to-r from-slate-700/80 to-slate-800/80 border-slate-500/50 text-white font-medium shadow-lg'
              : 'bg-slate-800/60 border-slate-600/40 text-slate-200 hover:bg-slate-700/60 hover:border-slate-500/50'
            }
            ${isSelected ? 'ring-2 ring-cyan-400/60 border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : ''}
          `}
        >
          <span className={`${isCentral ? 'text-sm' : 'text-xs'} whitespace-nowrap`}>
            {node.label}
          </span>
        </button>
        
        {/* Right collapse button for non-central nodes */}
        {!isCentral && hasChildren && (
          <button
            onClick={(e) => toggleCollapse(node.id, e)}
            className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors ml-1 shrink-0"
          >
            {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        )}

        {/* Children */}
        {hasChildren && !isCollapsed && (
          <div className="flex items-center ml-1">
            {/* Horizontal connector */}
            <svg width="24" height="2" className="shrink-0">
              <line x1="0" y1="1" x2="24" y2="1" stroke="#475569" strokeWidth="1.5" />
            </svg>
            
            {/* Children container with vertical lines */}
            <div className="relative flex flex-col gap-3">
              {/* Vertical connector line */}
              {node.children.length > 1 && (
                <div 
                  className="absolute left-0 top-0 bottom-0 w-px bg-slate-600"
                  style={{
                    top: node.children.length > 0 ? '50%' : 0,
                    height: `calc(100% - ${node.children.length > 1 ? '20px' : '0px'})`,
                    transform: 'translateY(-50%)',
                  }}
                />
              )}
              
              {node.children.map((child, idx) => (
                <div key={child.id} className="flex items-center">
                  {/* Branch connector */}
                  <svg width="16" height="2" className="shrink-0">
                    <line x1="0" y1="1" x2="16" y2="1" stroke="#475569" strokeWidth="1.5" />
                  </svg>
                  {renderTreeNode(child, level + 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col bg-[#0a0a0a] animate-in fade-in duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Studio</span>
          <ChevronRight size={14} />
          <span className="text-white font-medium">Mindmap</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Download"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Title Section */}
      <div className="px-6 py-6 border-b border-white/5 shrink-0">
        <h1 className="text-2xl font-semibold text-white mb-2">
          {mindmap.centralTopic || mindmap.title}
        </h1>
        <p className="text-sm text-slate-400">
          Based on {mindmap.metadata.sourceCount} source{mindmap.metadata.sourceCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Controls */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          {/* Expand/Collapse All */}
          <button
            onClick={allCollapsed ? expandAll : collapseAll}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-2"
            title={allCollapsed ? "Expand All" : "Collapse All"}
          >
            {allCollapsed ? <Expand size={18} /> : <Shrink size={18} />}
          </button>
        </div>
        
        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={18} />
          </button>
          <span className="text-sm text-slate-400 w-16 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={18} />
          </button>
          <div className="w-px h-5 bg-white/10 mx-2" />
          <button
            onClick={handleResetView}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Reset View"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {/* Mind Map Canvas */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Content */}
        <div 
          className="mindmap-content absolute inset-0 flex items-center justify-start p-12"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'left center',
          }}
        >
          {renderTreeNode(tree)}
        </div>
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="absolute right-6 top-36 w-80 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl animate-in slide-in-from-right-4 duration-200 overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-gradient-to-r from-cyan-500/5 to-purple-500/5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white truncate pr-2">{selectedNode.label}</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="p-4 space-y-4">
            {selectedNode.description && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-slate-300 leading-relaxed">{selectedNode.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Type</p>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                selectedNode.type === 'central' ? 'bg-cyan-500/20 text-cyan-400' :
                selectedNode.type === 'main' ? 'bg-purple-500/20 text-purple-400' :
                selectedNode.type === 'sub' ? 'bg-pink-500/20 text-pink-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                {selectedNode.type.charAt(0).toUpperCase() + selectedNode.type.slice(1)}
              </span>
            </div>
            {selectedNode.children.length > 0 && (
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Connected Topics ({selectedNode.children.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedNode.children.map(child => (
                    <button 
                      key={child.id} 
                      className="px-2.5 py-1 text-xs bg-white/5 text-slate-300 rounded-md hover:bg-white/10 hover:text-white transition-colors"
                      onClick={() => setSelectedNode(child)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback Footer */}
      <div className="px-6 py-4 border-t border-white/10 flex items-center justify-center gap-4 shrink-0">
        <button
          type="button"
          onClick={() => setFeedback('good')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-colors border ${
            feedback === 'good'
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
          }`}
        >
          <ThumbsUp size={16} />
          <span className="text-sm">Good content</span>
        </button>
        <button
          type="button"
          onClick={() => setFeedback('bad')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-colors border ${
            feedback === 'bad'
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
          }`}
        >
          <ThumbsDown size={16} />
          <span className="text-sm">Bad content</span>
        </button>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="absolute bottom-20 right-6 flex items-center gap-4 text-[10px] text-slate-600">
        <span>+/- Zoom</span>
        <span>0: Reset</span>
        <span>Esc: Close</span>
      </div>
    </div>
  );
};
