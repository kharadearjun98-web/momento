import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Sparkles, Bot, User, Quote, Mic, Image as ImageIcon, SplitSquareHorizontal, Lightbulb } from 'lucide-react';
import { GlassPanel } from './ui/Glass';
import { Button } from './ui/Button';
import { SourceViewerModal } from './SourceViewerModal';
import { UploadModal } from './UploadModal';
import { ChatMessage } from '../types';
import { generateChatResponse, generateJsonCompletion, streamChatResponse } from '../lib/aiChat';
import { supabase } from '../lib/supabase/client';
import { useParams } from 'react-router-dom';
import { markdownStyles } from '../lib/markdownRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import 'katex/dist/katex.min.css';

const TOOLS = [
  { id: 'cite', label: 'Cite', icon: <Quote size={14} />, prompt: 'Cite the strongest evidence from my sources for: ' },
  { id: 'figure', label: 'Figure', icon: <ImageIcon size={14} />, prompt: 'Create a figure concept from my sources that shows: ' },
  { id: 'compare', label: 'Compare', icon: <SplitSquareHorizontal size={14} />, prompt: 'Compare the main arguments in my sources about: ' },
  { id: 'brainstorm', label: 'Idea', icon: <Lightbulb size={14} />, prompt: 'Brainstorm study angles and follow-up questions for: ' },
];

export const ChatInterface: React.FC = () => {
  const { id: notebookId } = useParams<{ id: string }>();

  // Load persisted state from localStorage
  const getStorageKey = (key: string) => `memento_notebook_${notebookId}_${key}`;

  // Helper to clean malformed LaTeX in stored messages
  const cleanStoredContent = (content: string): string => {
    if (!content) return content;
    let cleaned = content;
    
    // Replace Unicode math chars
    const unicodeToLatex: Record<string, string> = {
      '∣': '\\mid', '→': '\\to', '←': '\\leftarrow', '≤': '\\leq', '≥': '\\geq',
      '≠': '\\neq', '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∈': '\\in',
      '∂': '\\partial', '∇': '\\nabla', '×': '\\times', '÷': '\\div', '±': '\\pm',
      'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'θ': '\\theta',
      'λ': '\\lambda', 'μ': '\\mu', 'π': '\\pi', 'σ': '\\sigma', 'φ': '\\phi',
    };
    for (const [u, l] of Object.entries(unicodeToLatex)) {
      cleaned = cleaned.split(u).join(l);
    }
    
    // Fix probability notation: P$B \mid A$ -> $P(B \mid A)$
    cleaned = cleaned.replace(/\bP\$([A-Z])\s*(?:\\mid|\|)\s*([A-Z][^$]*?)\$/g, 
      (_, cond, given) => `$P(${cond} \\mid ${given.replace(/\$/g, '')})$`);
    
    // Fix P$B \mid A_i$ patterns
    cleaned = cleaned.replace(/\bP\$([A-Z](?:_\{?[^}$]+\}?)?)\s*(?:\\mid|\|)\s*([A-Z](?:_\{?[^}$]+\}?)?)\$/g,
      (_, a, b) => `$P(${a.replace(/\$/g, '')} \\mid ${b.replace(/\$/g, '')})$`);
    
    // Remove errant $ inside expressions
    cleaned = cleaned.replace(/([A-Z])\$([A-Z])/g, '$1($2');
    cleaned = cleaned.replace(/([A-Z])\$(?=[\s,.\)]|$)/g, '$1)');
    cleaned = cleaned.replace(/\${3,}/g, '$$');
    
    // Wrap unwrapped LaTeX expressions
    cleaned = cleaned.replace(
      /(?<!\$)([A-Z](?:_\{?[^}\s]+\}?)?\s*\\mid\s*[A-Z](?:_\{?[^}\s]+\}?)?)(?!\$)/g,
      (match) => `$${match}$`
    );
    
    // Wrap set notation like \{A_i\}
    cleaned = cleaned.replace(/(?<!\$)(\\{[A-Z]_[^}]+\\})(?!\$)/g, (match) => `$${match}$`);
    
    return cleaned;
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!notebookId) return [];
    const saved = localStorage.getItem(getStorageKey('messages'));
    if (!saved) return [];
    
    try {
      const parsed = JSON.parse(saved);
      // Clean any malformed content in stored messages
      return parsed.map((msg: ChatMessage) => ({
        ...msg,
        content: cleanStoredContent(msg.content)
      }));
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [summary, setSummary] = useState(() => {
    if (!notebookId) return '';
    return localStorage.getItem(getStorageKey('summary')) || '';
  });
  const [notebookTitle, setNotebookTitle] = useState('Notebook');
  const [sourceCount, setSourceCount] = useState(0);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(() => {
    if (!notebookId) return [];
    const saved = localStorage.getItem(getStorageKey('suggestedPrompts'));
    return saved ? JSON.parse(saved) : [];
  });
  const [isAnalyzing, setIsAnalyzing] = useState(true);
  const lastPromptRefresh = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceBaseInputRef = useRef('');

  // Generate dynamic suggested prompts based on context
  const generateDynamicPrompts = async (sources: any[], recentMessages: ChatMessage[]) => {
    try {
      const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);
      if (sourcesWithContent.length === 0) return;

      const combinedContent = sourcesWithContent
        .map(s => `${s.title}:\n${s.content?.substring(0, 1500)}`)
        .join('\n\n');

      // Include recent conversation context for more relevant suggestions
      const recentContext = recentMessages.slice(-4).map(m =>
        `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.substring(0, 200)}`
      ).join('\n');

      const promptGeneration = `You are an AI assistant helping users explore documents deeply. Based on the documents and recent conversation, generate 4 NEW, SPECIFIC, and INSIGHTFUL follow-up questions.

Documents (excerpts):
${combinedContent.substring(0, 6000)}

${recentContext ? `Recent conversation:\n${recentContext}\n\n` : ''}

Generate questions that:
- Are SHORT (max 8-10 words each) - brevity is critical
- Encourage active learning and deeper understanding
- Ask "why", "how", or "what if" to promote critical thinking
- Are specific to the content, not generic
- Cover different aspects of the material
- Help learners connect concepts and apply knowledge

Bad example: "What specific alignment loss is employed to improve terrain navigation without extensive environmental data?"
Good example: "Why does this alignment loss work?"

Respond ONLY with a JSON object:
{"questions": ["...", "...", "...", "..."]}`;

      const response = await generateChatResponse(
        [{ role: 'user', content: promptGeneration }],
        notebookId || ''
      );

      const result = JSON.parse(response.message || '{}');
      if (result.questions && result.questions.length > 0) {
        setSuggestedPrompts(result.questions);
        lastPromptRefresh.current = Date.now();
      }
    } catch (error) {
      console.error('Error generating dynamic prompts:', error);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<any[]>([]);

  // Source Viewer Modal State
  const [viewingSource, setViewingSource] = useState<{ id: string, highlight?: string, citationNum?: number } | null>(null);

  // Listen for citation clicks from inline [1], [2] etc in messages
  useEffect(() => {
    const handleCitationClick = (e: CustomEvent<{ number: number }>) => {
      const citationNum = e.detail.number;
      console.log(`📖 Citation [${citationNum}] clicked`);

      // Better approach: Since we don't pass the message ID in the event, 
      // let's try to find the details in the messages state
      let foundDetails = null;

      // Search from newest to oldest
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'ai' && messages[i].citationDetails && messages[i].citationDetails![citationNum]) {
          foundDetails = messages[i].citationDetails![citationNum];
          break;
        }
      }

      if (foundDetails) {
        console.log('✅ Found citation details:', foundDetails);
        setViewingSource({
          id: foundDetails.sourceId,
          highlight: foundDetails.text,
          citationNum: citationNum
        });
      } else {
        console.log('⚠️ No details found for citation, falling back to source panel scroll');
        // Fallback: scoll to source panel
        const sourceElement = document.querySelector(`[data-source-index="${citationNum}"]`);
        if (sourceElement) {
          sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (sourceElement as HTMLElement).style.transition = 'all 0.3s';
          (sourceElement as HTMLElement).style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.5)';
          setTimeout(() => {
            (sourceElement as HTMLElement).style.boxShadow = '';
          }, 2000);
        } else {
          const sourcesPanel = document.querySelector('[data-panel="sources"]');
          if (sourcesPanel) {
            sourcesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    };

    window.addEventListener('citation-click', handleCitationClick as EventListener);
    return () => window.removeEventListener('citation-click', handleCitationClick as EventListener);
  }, [messages]);

  // Analyze sources and generate dynamic content
  useEffect(() => {
    if (!notebookId) return;

    const analyzeNotebook = async () => {
      try {
        setIsAnalyzing(true);

        // Fetch notebook info (always needed for title)
        const { data: notebook } = await supabase
          .from('notebooks')
          .select('title, description')
          .eq('id', notebookId)
          .single();

        if (notebook) {
          setNotebookTitle(notebook.title || 'Notebook');
        }

        // Fetch source count (always needed)
        const { data: sources, count } = await supabase
          .from('sources')
          .select('id, title, content, type', { count: 'exact' })
          .eq('notebook_id', notebookId);

        setSourceCount(count || sources?.length || 0);

        // Store sources for prompt regeneration
        if (sources) {
          sourcesRef.current = sources;
        }

        // Check if we have existing chat history - if so, skip full AI analysis but refresh prompts
        const existingMessages = localStorage.getItem(getStorageKey('messages'));
        const existingSummary = localStorage.getItem(getStorageKey('summary'));

        if (existingMessages && JSON.parse(existingMessages).length > 0) {
          console.log('✅ Loading existing chat history from cache');
          // Messages are already loaded in useState initializer

          // Load summary from cache
          if (existingSummary) {
            setSummary(existingSummary);
          }

          // Generate fresh prompts even for existing sessions
          if (sources && sources.length > 0) {
            console.log('🔄 Generating fresh suggested prompts...');
            const parsedMessages = JSON.parse(existingMessages);
            generateDynamicPrompts(sources, parsedMessages);
          }

          setIsAnalyzing(false);
          return;
        }

        // No existing chat - perform initial analysis
        console.log('🔍 No chat history found, analyzing sources...');

        if (!sources || sources.length === 0) {
          setMessages([{
            id: '1',
            role: 'ai',
            content: "Upload some documents to get started! I'll analyze them and help you explore the content.",
            timestamp: new Date(),
            citations: []
          }]);
          setSummary('No documents uploaded yet. Add sources to begin.');
          setIsAnalyzing(false);
          return;
        }

        // Combine source content
        const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);
        if (sourcesWithContent.length === 0) {
          setMessages([{
            id: '1',
            role: 'ai',
            content: "Your documents are being processed. This may take a moment...",
            timestamp: new Date(),
            citations: []
          }]);
          setSummary('Documents are being processed...');
          setIsAnalyzing(false);
          return;
        }

        const combinedContent = sourcesWithContent
          .map(s => `${s.title}:\n${s.content?.substring(0, 2000)}`)
          .join('\n\n');

        // Generate summary and questions using AI
        const analysisPrompt = `Analyze these documents and provide:
1. A concise, descriptive title (3-6 words) that captures the main topic
2. A concise 2-3 sentence summary highlighting the main themes
3. 4 specific, insightful questions a user might ask about this content

Documents:
${combinedContent.substring(0, 8000)}

Respond in JSON format:
{
  "title": "...",
  "summary": "...",
  "questions": ["...", "...", "...", "..."]
}`;

        // Force the model to return strict JSON so the reasoning model can't
        // reply with prose (which was causing intermittent parse failures).
        const rawResponse = await generateJsonCompletion(
          [{ role: 'user', content: analysisPrompt }],
          { maxTokens: 1200 }
        );

        // Even in JSON mode, defensively strip any <think>...</think> and
        // isolate the JSON object before parsing. If parsing still fails, fall
        // back to a friendly summary instead of showing an error.
        let analysis: { title?: string; summary?: string; questions?: string[] } = {};
        try {
          const rawMessage = (rawResponse || '{}').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          const firstBrace = rawMessage.indexOf('{');
          const lastBrace = rawMessage.lastIndexOf('}');
          const jsonText = firstBrace !== -1 && lastBrace > firstBrace
            ? rawMessage.slice(firstBrace, lastBrace + 1)
            : '{}';
          analysis = JSON.parse(jsonText);
        } catch (parseError) {
          console.warn('Auto-summary JSON parse failed, using fallback', parseError);
          analysis = {
            summary: `This notebook has ${sourcesWithContent.length} source${sourcesWithContent.length > 1 ? 's' : ''} ready to explore. Ask a question below to get started.`,
          };
        }

        // Update notebook title based on content
        if (analysis.title && analysis.title !== notebook?.title) {
          setNotebookTitle(analysis.title);

          // Update in database
          await supabase
            .from('notebooks')
            .update({ title: analysis.title })
            .eq('id', notebookId);
        }

        setSummary(analysis.summary || 'Analysis complete.');
        setSuggestedPrompts(analysis.questions || [
          'Explain the key concepts',
          'Create a study plan',
          'Compare arguments',
          'Find missing perspectives'
        ]);

        // Set initial AI message
        setMessages([{
          id: '1',
          role: 'ai',
          content: `Hello! I've analyzed your ${sourcesWithContent.length} source${sourcesWithContent.length > 1 ? 's' : ''}. What would you like to explore?`,
          timestamp: new Date(),
          citations: []
        }]);

      } catch (error) {
        console.error('Error analyzing notebook:', error);
        const readySources = sourcesRef.current?.length || 0;
        setSummary(
          readySources > 0
            ? `Your ${readySources} source${readySources > 1 ? 's are' : ' is'} ready. Ask a question below to explore the content.`
            : 'Upload documents to begin exploring.'
        );
        setMessages([{
          id: '1',
          role: 'ai',
          content: "I'm ready to help! What would you like to know?",
          timestamp: new Date(),
          citations: []
        }]);
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeNotebook();
  }, [notebookId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // Persist messages to localStorage
  useEffect(() => {
    if (!notebookId || messages.length === 0) return;
    localStorage.setItem(getStorageKey('messages'), JSON.stringify(messages));
  }, [messages, notebookId]);

  // Persist summary to localStorage
  useEffect(() => {
    if (!notebookId || !summary) return;
    localStorage.setItem(getStorageKey('summary'), summary);
  }, [summary, notebookId]);

  // Persist suggested prompts to localStorage
  useEffect(() => {
    if (!notebookId) return;
    localStorage.setItem(getStorageKey('suggestedPrompts'), JSON.stringify(suggestedPrompts));
  }, [suggestedPrompts, notebookId]);

  // Regenerate prompts after AI response (after loading is done)
  useEffect(() => {
    // Only regenerate after a conversation update (not initial load)
    if (!notebookId || isLoading || isAnalyzing || messages.length < 2) return;

    // Rate limit: wait at least 30 seconds between refreshes
    const timeSinceLastRefresh = Date.now() - lastPromptRefresh.current;
    if (timeSinceLastRefresh < 30000) return;

    // Check if the last message was from AI (means user just finished a turn)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'ai' && sourcesRef.current.length > 0) {
      console.log('🔄 Regenerating prompts after conversation...');
      generateDynamicPrompts(sourcesRef.current, messages);
    }
  }, [messages, isLoading, isAnalyzing, notebookId]);

  const handleSend = async (contentOrEvent?: string | React.FormEvent) => {
    // Determine content: if string passed, use it; otherwise use input state
    const msgContent = typeof contentOrEvent === 'string' ? contentOrEvent : input;

    if (!msgContent.trim() || isLoading) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: msgContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsLoading(true);

    // Create placeholder AI message for streaming
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: 'ai',
      content: '',
      timestamp: new Date(),
      citations: [],
      citationDetails: {}, // Placeholder
    };
    setMessages(prev => [...prev, aiMsg]);

    try {
      // Convert messages to the format expected by AI
      const chatHistory = [...messages, newMsg].map(m => ({
        role: m.role === 'ai' ? 'assistant' as const : 'user' as const,
        content: m.content,
      }));

      // Stream AI response with callback
      const result = await streamChatResponse(
        chatHistory,
        notebookId,
        (chunk, fullText) => {
          // Update the AI message with accumulated content
          setMessages(prev => prev.map(msg =>
            msg.id === aiMsgId
              ? { ...msg, content: fullText }
              : msg
          ));
        }
      );

      // Final update with citations
      setMessages(prev => prev.map(msg =>
        msg.id === aiMsgId
          ? { ...msg, content: result.message, citations: result.citations, citationDetails: result.citationDetails }
          : msg
      ));
    } catch (error) {
      console.error('Chat error:', error);
      // Update the placeholder message with error
      setMessages(prev => prev.map(msg =>
        msg.id === aiMsgId
          ? { ...msg, content: "I'm sorry, I encountered an error. Please make sure your API key is configured correctly." }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolClick = (prompt: string) => {
    setInput((current) => current.trim() ? `${prompt}${current}` : prompt);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const length = textareaRef.current?.value.length || 0;
      textareaRef.current?.setSelectionRange(length, length);
    });
  };

  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInput((current) => current || 'Voice input is not supported in this browser. ');
      textareaRef.current?.focus();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    recognitionRef.current = recognition;
    voiceBaseInputRef.current = input.trim();
    setIsListening(true);

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const spokenText = `${finalTranscript}${interimTranscript}`.trim();
      if (spokenText) {
        const base = voiceBaseInputRef.current;
        setInput(base ? `${base} ${spokenText}` : spokenText);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h1 className="font-display text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            {notebookTitle}
          </h1>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            AI Assistant Active • {sourceCount} Source{sourceCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto pr-4 pb-4 custom-scrollbar space-y-8">
        {/* Summary Block (Canvas style) */}
        {summary && (
          <GlassPanel className="border-l-2 border-l-memento-purple-500 bg-gradient-to-r from-memento-purple-900/20 to-transparent relative overflow-hidden group">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2 text-memento-purple-400">
                <Sparkles size={16} className={isAnalyzing ? 'animate-spin' : 'animate-pulse'} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isAnalyzing ? 'Analyzing...' : 'Auto-Summary'}
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed text-sm font-light">
                {summary}
              </p>
            </div>
          </GlassPanel>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-backwards`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'ai' ? 'bg-gradient-to-br from-memento-purple-500 to-memento-purple-700 shadow-glow' : 'bg-slate-700'}`}>
              {msg.role === 'ai' ? <Bot size={16} className="text-white" /> : <User size={16} className="text-slate-300" />}
            </div>
            <div className={`max-w-[80%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
              <GlassPanel
                className={`${msg.role === 'user'
                  ? 'bg-memento-purple-600/25 border-memento-purple-500/50 shadow-[0_0_12px_rgba(139,92,246,0.4),inset_0_0_20px_rgba(139,92,246,0.05)]'
                  : 'bg-white/5 shadow-[0_0_15px_rgba(139,92,246,0.3),inset_0_0_25px_rgba(139,92,246,0.03)] border-memento-purple-500/25'}`}
                variant="card"
              >
                <div className="px-7 py-5">
                  <div
                    id={`msg-${msg.id}`}
                    className={`text-sm text-slate-200 leading-relaxed ${markdownStyles}`}
                  >
                    <MarkdownRenderer content={msg.content} />
                  </div>
                </div>
              </GlassPanel>

              {/* Citations */}
              {msg.citations && (
                <div className="flex gap-2 flex-wrap">
                  {msg.citations.map(cid => {
                    // Extract citation number from cid (e.g. "[1]" => 1)
                    const citationNum = parseInt(cid.replace(/[^\d]/g, ''), 10);
                    return (
                      <button
                        key={cid}
                        onClick={() => {
                          // Flash the message to highlight it
                          const messageEl = document.getElementById(`msg-${msg.id}`);
                          if (messageEl) {
                            messageEl.style.transition = 'background-color 0.3s';
                            messageEl.style.backgroundColor = 'rgba(168, 85, 247, 0.2)';
                            setTimeout(() => {
                              messageEl.style.backgroundColor = 'transparent';
                            }, 1000);
                          }

                          // Open SourceViewerModal if citationDetails are available
                          if (msg.citationDetails && msg.citationDetails[citationNum]) {
                            const details = msg.citationDetails[citationNum];
                            setViewingSource({
                              id: details.sourceId,
                              highlight: details.text,
                              citationNum: citationNum
                            });
                          } else {
                            // Fallback: scroll to source panel
                            const sourceElement = document.querySelector(`[data-source-index="${citationNum}"]`);
                            if (sourceElement) {
                              sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              (sourceElement as HTMLElement).style.transition = 'all 0.3s';
                              (sourceElement as HTMLElement).style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.5)';
                              setTimeout(() => {
                                (sourceElement as HTMLElement).style.boxShadow = '';
                              }, 2000);
                            }
                          }
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/5 hover:bg-memento-purple-500/20 text-[10px] text-slate-400 hover:text-memento-purple-300 border border-white/5 hover:border-memento-purple-500/30 transition-all cursor-pointer group"
                      >
                        <Quote size={10} className="group-hover:text-memento-accent-cyan transition-colors" />
                        Source {cid}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-4 z-20 flex flex-col gap-3">
        {/* Suggested Prompts */}
        <div className="flex gap-2 overflow-x-auto pt-1 pb-3 px-3 custom-scrollbar">
          {suggestedPrompts.map(prompt => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full bg-white/5 hover:bg-memento-purple-500/20 border border-white/10 hover:border-memento-purple-500/50 text-xs text-slate-300 hover:text-white transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_4px_12px_rgba(168,85,247,0.15)] active:scale-95"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Composer */}
        <GlassPanel className="bg-[#0F1218] overflow-hidden shadow-[0_0_20px_rgba(139,92,246,0.08)] border-0" intensity="high" variant="panel" noShine>
          <div className="flex flex-col gap-0 w-full">
            {/* Tools Bar */}
            <div className="flex items-center gap-1 p-1.5">
              {TOOLS.map(tool => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleToolClick(tool.prompt)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 text-xs text-slate-400 hover:text-memento-purple-300 transition-colors"
                  title={`${tool.label} with this notebook`}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder="Ask to compare, brainstorm, or generate..."
              className="w-full bg-transparent border-none resize-none focus:ring-0 focus:outline-none outline-none text-sm p-3 min-h-[60px] text-slate-200 placeholder:text-slate-600"
            />

            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsUploadOpen(true)}
                  className="h-8 w-8 text-slate-500 hover:text-memento-accent-cyan"
                  title="Upload sources"
                >
                  <Paperclip size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleVoiceInput}
                  className={`h-8 w-8 ${isListening ? 'text-rose-300 bg-rose-500/10' : 'text-slate-500 hover:text-memento-accent-cyan'}`}
                  title={isListening ? 'Stop voice input' : 'Start voice input'}
                >
                  <Mic size={16} />
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-600 font-mono">⌘ + Enter</span>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className={`${input.trim() ? 'opacity-100 shadow-glow' : 'opacity-50'} transition-all`}
                >
                  <Send size={14} />
                </Button>
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>
      {/* Source Viewer Modal */}
      <SourceViewerModal
        isOpen={!!viewingSource}
        onClose={() => setViewingSource(null)}
        sourceId={viewingSource?.id || ''}
        initialHighlight={viewingSource?.highlight}
        citationNumber={viewingSource?.citationNum}
      />
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        notebookId={notebookId || ''}
      />
    </div>
  );
};
