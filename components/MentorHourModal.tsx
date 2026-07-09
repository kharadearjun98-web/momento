
import React, { useState, useRef, useEffect } from 'react';
import { X, Users, User, MessageSquare, Sparkles, Play, Mic, MicOff, Video, VideoOff, PhoneOff, Settings, Grid, Send, BookOpen, Target, Lightbulb, ChevronDown, Loader2, Volume2, VolumeX, Square } from 'lucide-react';
import { GlassPanel, Glow } from './ui/Glass';
import { Button } from './ui/Button';
import { MentorCount } from '../types';
import { retrieveWithLightRAG, LightRAGResult } from '../lib/lightragRetrieval';
import { createServerOnlyProviderClient } from '../lib/serverOnlyProvider';

// Initialize OpenAI client for TTS (Text-to-Speech)
const openai = createServerOnlyProviderClient('tts');

// Initialize Lingshi-compatible chat client (chat completions)
const chatProvider = createServerOnlyProviderClient('chat');

// OpenAI TTS Voice types
type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

// Voice configurations for mentors using OpenAI TTS
interface MentorVoiceConfig {
  voice: OpenAIVoice;
  speed: number; // 0.25 to 4.0
  description: string;
}

const MENTOR_VOICE_CONFIGS: Record<number, MentorVoiceConfig> = {
  1: { voice: 'nova', speed: 1.0, description: 'Warm, professional female voice' },      // Dr. Sarah Chen
  2: { voice: 'onyx', speed: 1.0, description: 'Deep, authoritative male voice' },       // Marcus Reynolds  
  3: { voice: 'shimmer', speed: 1.05, description: 'Expressive, energetic female voice' }, // Elena Rodriguez
};

interface MentorMessage {
  id: string;
  role: 'user' | 'mentor';
  content: string;
  mentorId?: number;
  timestamp: Date;
}

interface MentorHourModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebookId?: string;
  onSessionEnd?: (sessionSummary: { topic: string; messageCount: number; duration: number }) => void;
}

export const MentorHourModal: React.FC<MentorHourModalProps> = ({ isOpen, onClose, notebookId, onSessionEnd }) => {
  const [view, setView] = useState<'setup' | 'session'>('setup');
  const [mentorCount, setMentorCount] = useState<MentorCount>('1');
  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [coachingObjectives, setCoachingObjectives] = useState<string[]>([]);
  const [newObjective, setNewObjective] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Session States
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  // Chat States
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [ragContext, setRagContext] = useState<LightRAGResult | null>(null);
  const [sessionStartTime] = useState(new Date());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice/TTS States
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup audio on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopSpeaking();
    }
    return () => {
      stopSpeaking();
    };
  }, [isOpen]);

  // Clean text for speech (remove markdown)
  const cleanTextForSpeech = (text: string): string => {
    return text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
      .replace(/•/g, '')
      .replace(/^\s*[-*]\s/gm, '') // Remove list markers
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
  };

  // Generate speech using OpenAI TTS API
  const speakText = async (text: string, mentorId: number) => {
    if (!voiceEnabled) return;

    // Stop any current speech
    stopSpeaking();

    const cleanText = cleanTextForSpeech(text);
    if (!cleanText) return;

    // Limit text length to avoid very long audio generation
    const truncatedText = cleanText.length > 4000 ? cleanText.substring(0, 4000) + '...' : cleanText;

    const config = MENTOR_VOICE_CONFIGS[mentorId] || MENTOR_VOICE_CONFIGS[1];

    setIsLoadingAudio(true);
    abortControllerRef.current = new AbortController();

    try {
      console.log(`🎤 Generating speech with OpenAI TTS (voice: ${config.voice})...`);

      const response = await openai.audio.speech.create({
        model: 'tts-1', // Use 'tts-1-hd' for higher quality (slower, more expensive)
        voice: config.voice,
        input: truncatedText,
        speed: config.speed,
      });

      // Convert response to audio blob
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(blob);

      // Create and play audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        setIsLoadingAudio(false);
        console.log('🔊 Started playing audio');
      };

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        console.log('✅ Audio playback finished');
      };

      audio.onerror = (e) => {
        console.error('❌ Audio playback error:', e);
        setIsSpeaking(false);
        setIsLoadingAudio(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('🛑 Audio generation cancelled');
      } else {
        console.error('❌ Error generating speech:', error);
      }
      setIsSpeaking(false);
      setIsLoadingAudio(false);
    }
  };

  // Stop speaking
  const stopSpeaking = () => {
    // Cancel any pending audio generation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop current audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    setIsSpeaking(false);
    setIsLoadingAudio(false);
  };

  const mentorOptions: { id: MentorCount; label: string; desc: string; icon: React.ReactNode }[] = [
    { id: '1', label: 'One-on-One', desc: 'Deep coaching', icon: <User size={24} /> },
    { id: '2', label: 'Tag Team', desc: 'Dual perspectives', icon: <Users size={24} /> },
    { id: '3', label: 'Roundtable', desc: 'Group discussion', icon: <Users size={24} /> },
  ];

  // Mock Mentor Data with enhanced personalities
  const MENTORS = [
    {
      id: 1,
      name: 'Dr. Sarah Chen',
      role: 'Neuroscientist',
      image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400&h=400',
      personality: 'Analytical and thoughtful. Focuses on evidence-based insights and helps break down complex concepts into understandable parts. Uses scientific thinking to guide discussions.',
      style: 'Socratic questioning with deep explanations'
    },
    {
      id: 2,
      name: 'Marcus Reynolds',
      role: 'Strategy Lead',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=400&h=400',
      personality: 'Strategic and practical. Excels at connecting ideas to real-world applications and business outcomes. Challenges assumptions constructively.',
      style: 'Direct coaching with actionable frameworks'
    },
    {
      id: 3,
      name: 'Elena Rodriguez',
      role: 'Creative Director',
      image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400&h=400',
      personality: 'Creative and empathetic. Brings fresh perspectives and helps think outside the box. Encourages exploration and innovative thinking.',
      style: 'Brainstorming and creative exploration'
    },
  ];

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when session starts
  useEffect(() => {
    if (view === 'session') {
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [view]);

  const addObjective = () => {
    if (newObjective.trim() && coachingObjectives.length < 5) {
      setCoachingObjectives([...coachingObjectives, newObjective.trim()]);
      setNewObjective('');
    }
  };

  const removeObjective = (index: number) => {
    setCoachingObjectives(coachingObjectives.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);

    try {
      // Prime context from the notebook's documents. We no longer require a
      // topic — if none is given we retrieve a general overview so the mentor
      // still has material to draw on. Each user message re-retrieves its own
      // context later in generateMentorResponse.
      if (notebookId) {
        console.log('🎯 Retrieving context for Mentor Hour session...');
        const primingQuery = topic || 'key concepts and overview from the documents';
        const ragResult = await retrieveWithLightRAG(primingQuery, notebookId, {
          chunkCount: 8,
          entityCount: 15,
          relationshipCount: 10,
        });
        setRagContext(ragResult);
        console.log('✅ Context retrieved:', ragResult.chunks.length, 'chunks,', ragResult.entities.length, 'entities');
      }

      // Create initial mentor greeting
      const activeMentors = getActiveMentors();
      const greetingContent = generateInitialGreeting(activeMentors, topic, context);
      const greetingMessage: MentorMessage = {
        id: Date.now().toString(),
        role: 'mentor',
        content: greetingContent,
        mentorId: activeMentors[0].id,
        timestamp: new Date(),
      };

      setMessages([greetingMessage]);
      setView('session');

      // Speak the greeting after a short delay
      setTimeout(() => {
        speakText(greetingContent, activeMentors[0].id);
      }, 500);
    } catch (error) {
      console.error('Error preparing session:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateInitialGreeting = (mentors: typeof MENTORS, sessionTopic: string, sessionContext: string) => {
    const mentorNames = mentors.map(m => m.name.split(' ')[0]).join(' and ');
    const topicIntro = sessionTopic ? `about **${sessionTopic}**` : '';

    if (mentors.length === 1) {
      return `Hello! I'm ${mentors[0].name}, your ${mentors[0].role.toLowerCase()} mentor for this session${topicIntro ? ` ${topicIntro}` : ''}. ${sessionContext ? `\n\nI understand you'd like to explore: "${sessionContext}"` : ''}\n\nI'm here to help you think through your questions, challenge your assumptions, and deepen your understanding. What would you like to start with?`;
    } else if (mentors.length === 2) {
      return `Welcome to your Tag Team session! I'm ${mentors[0].name} (${mentors[0].role}) and I'm joined by ${mentors[1].name} (${mentors[1].role})${topicIntro ? `. We'll be discussing ${topicIntro} today` : ''}. ${sessionContext ? `\n\nWe'll explore: "${sessionContext}"` : ''}\n\nWe each bring different perspectives - feel free to ask us anything and we'll bounce ideas off each other to give you the most comprehensive insights!`;
    } else {
      return `Welcome to your Roundtable session! You have ${mentorNames} here today${topicIntro ? ` to discuss ${topicIntro}` : ''}. ${sessionContext ? `\n\nOur focus: "${sessionContext}"` : ''}\n\nWith three perspectives in the room, expect a rich discussion with diverse viewpoints. Let's dive in - what's on your mind?`;
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isTyping) return;

    // Stop any current speech before processing new message
    stopSpeaking();

    const userMessage: MentorMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    try {
      const response = await generateMentorResponse(userMessage.content);
      const respondingMentorId = getActiveMentors()[Math.floor(Math.random() * parseInt(mentorCount))].id;

      const mentorResponse: MentorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'mentor',
        content: response,
        mentorId: respondingMentorId,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, mentorResponse]);

      // Speak the mentor's response
      speakText(response, respondingMentorId);
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: MentorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'mentor',
        content: "I apologize, but I'm having trouble formulating a response right now. Could you try rephrasing your question?",
        mentorId: getActiveMentors()[0].id,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const generateMentorResponse = async (userMessage: string): Promise<string> => {
    const activeMentors = getActiveMentors();
    const mentorPersonalities = activeMentors.map(m => `${m.name} (${m.role}): ${m.personality}`).join('\n');

    // Retrieve fresh context from the user's documents for THIS question, so
    // the mentor actually reads the material relevant to what was just asked
    // (not only what was fetched once at the start of the session). Falls back
    // to the session-start context, then to nothing, if retrieval fails.
    let liveContext: LightRAGResult | null = null;
    if (notebookId) {
      try {
        liveContext = await retrieveWithLightRAG(userMessage, notebookId, {
          chunkCount: 8,
          entityCount: 15,
          relationshipCount: 10,
        });
      } catch (error) {
        console.error('Mentor Hour: per-message retrieval failed, using primed context', error);
      }
    }

    const effectiveContext = liveContext ?? ragContext;
    let contextSection = '';
    if (effectiveContext && effectiveContext.formattedContext) {
      contextSection = `\n\n**RELEVANT KNOWLEDGE FROM USER'S MATERIALS:**\n${effectiveContext.formattedContext}`;
    }

    // Build objectives section
    let objectivesSection = '';
    if (coachingObjectives.length > 0) {
      objectivesSection = `\n\n**COACHING OBJECTIVES:**\n${coachingObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}`;
    }

    // Build special instructions section
    let instructionsSection = '';
    if (specialInstructions.trim()) {
      instructionsSection = `\n\n**SPECIAL INSTRUCTIONS:**\n${specialInstructions}`;
    }

    const systemPrompt = `You are an AI mentor participating in a coaching session. ${activeMentors.length > 1
        ? `You represent a team of mentors with these personalities:\n${mentorPersonalities}\nBlend their perspectives in your responses.`
        : `You are ${activeMentors[0].name}, a ${activeMentors[0].role}. ${activeMentors[0].personality}`
      }

**SESSION TOPIC:** ${topic || 'General coaching'}
**USER'S CONTEXT:** ${context || 'Not specified'}
${objectivesSection}
${instructionsSection}
${contextSection}

**COACHING GUIDELINES:**
- Be conversational, warm, and encouraging
- Ask probing questions to deepen understanding
- Reference the user's materials when relevant (cite specific concepts)
- Challenge assumptions constructively
- Provide actionable insights and frameworks
- Use markdown formatting for clarity (bold key points, bullet lists for steps)
- Keep responses focused and practical (2-4 paragraphs typically)
- If multiple mentors, occasionally indicate perspective shifts

**CONVERSATION HISTORY:**
${messages.map(m => `${m.role === 'user' ? 'User' : 'Mentor'}: ${m.content}`).join('\n')}`;

    const completion = await chatProvider.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    return completion.choices[0].message.content || "I'm reflecting on that. Could you tell me more?";
  };

  const handleClose = () => {
    // Calculate session duration
    if (view === 'session' && messages.length > 1 && onSessionEnd) {
      const duration = Math.round((new Date().getTime() - sessionStartTime.getTime()) / 60000);
      onSessionEnd({
        topic: topic || 'General coaching',
        messageCount: messages.length,
        duration,
      });
    }

    // Stop any ongoing speech
    stopSpeaking();

    setView('setup');
    setMessages([]);
    setRagContext(null);
    onClose();
  };

  const getActiveMentors = () => {
    return MENTORS.slice(0, parseInt(mentorCount));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#050608]/95 backdrop-blur-lg" onClick={handleClose} />

      {/* Background Glow */}
      <Glow className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[800px] bg-memento-accent-pink/10" />

      <GlassPanel
        variant="panel"
        className="w-[95vw] h-[90vh] relative shadow-2xl border-white/10 overflow-hidden animate-in zoom-in-95 duration-300 bg-[#050608]"
      >
        {/* Inner content wrapper */}
        <div className="flex flex-col h-full w-full relative z-20">
          {view === 'setup' ? (
            <div className="flex flex-col h-full">
              {/* Setup Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02] relative z-10">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-memento-accent-pink/10 text-memento-accent-pink">
                    <Users size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold text-white">Mentor Hour</h2>
                    <p className="text-xs text-slate-400">Configure your AI coaching session</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGenerate}
                    isLoading={isGenerating}
                    className="hidden md:flex bg-memento-accent-pink hover:bg-pink-400 text-white border-none shadow-[0_0_15px_rgba(244,114,182,0.3)]"
                  >
                    {isGenerating ? 'Preparing...' : 'Start Session'}
                  </Button>
                  <button
                    onClick={handleClose}
                    className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Setup Content */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                  {/* Left Column: Format & Topic */}
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Session Format</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {mentorOptions.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => setMentorCount(option.id)}
                            className={`relative p-4 rounded-xl flex items-center gap-4 text-left transition-all duration-200 border group
                              ${mentorCount === option.id
                                ? 'bg-memento-accent-pink/10 border-memento-accent-pink/40 shadow-[inset_0_0_20px_rgba(244,114,182,0.1)]'
                                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                              }`}
                          >
                            <div className={`p-3 rounded-lg transition-colors duration-200 ${mentorCount === option.id ? 'bg-memento-accent-pink/20 text-memento-accent-pink' : 'bg-white/5 text-slate-400 group-hover:text-slate-200'}`}>
                              {option.icon}
                            </div>
                            <div>
                              <div className={`text-base font-semibold ${mentorCount === option.id ? 'text-white' : 'text-slate-300'}`}>
                                {option.label}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">{option.desc}</div>
                            </div>

                            {mentorCount === option.id && (
                              <div className="absolute right-4 w-2 h-2 rounded-full bg-memento-accent-pink shadow-[0_0_8px_#F472B6]" />
                            )}
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare size={14} />
                        Main Topic
                      </h3>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-pink/30 to-rose-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                        <div className="relative bg-[#0B0E13] border border-white/10 rounded-xl flex items-center px-4 h-12 shadow-inner">
                          <input
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g., Strategic Planning, Leadership Styles"
                            className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-600 h-full"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Coaching Objectives */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Target size={14} />
                        Coaching Objectives
                      </h3>
                      <div className="space-y-2">
                        {coachingObjectives.map((objective, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 bg-memento-accent-pink/5 border border-memento-accent-pink/20 rounded-lg px-3 py-2 group"
                          >
                            <div className="w-5 h-5 rounded-full bg-memento-accent-pink/20 flex items-center justify-center text-xs text-memento-accent-pink">
                              {index + 1}
                            </div>
                            <span className="flex-1 text-sm text-slate-200">{objective}</span>
                            <button
                              onClick={() => removeObjective(index)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400 transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {coachingObjectives.length < 5 && (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newObjective}
                              onChange={(e) => setNewObjective(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addObjective()}
                              placeholder="Add an objective..."
                              className="flex-1 bg-[#0B0E13] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-memento-accent-pink/30"
                            />
                            <button
                              onClick={addObjective}
                              disabled={!newObjective.trim()}
                              className="px-3 py-2 bg-memento-accent-pink/10 hover:bg-memento-accent-pink/20 disabled:opacity-50 disabled:hover:bg-memento-accent-pink/10 border border-memento-accent-pink/30 rounded-lg text-memento-accent-pink text-sm transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-slate-600">Up to 5 objectives • Press Enter to add</p>
                      </div>
                    </section>
                  </div>

                  {/* Middle Column: Context & Goals */}
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <BookOpen size={14} />
                        Context & Goals
                      </h3>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-pink/20 to-rose-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                        <textarea
                          value={context}
                          onChange={(e) => setContext(e.target.value)}
                          placeholder="What challenges are you facing? What outcome are you looking for? Provide background so your mentor can tailor their guidance."
                          className="relative w-full h-40 bg-[#0B0E13] border border-white/10 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner leading-relaxed"
                        />
                      </div>
                    </section>

                    {/* Preview mentors */}
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Your Mentor{parseInt(mentorCount) > 1 ? 's' : ''}</h3>
                      <div className="space-y-3">
                        {getActiveMentors().map((mentor) => (
                          <div key={mentor.id} className="flex items-center gap-3 bg-white/[0.02] border border-white/5 rounded-xl p-3">
                            <img
                              src={mentor.image}
                              alt={mentor.name}
                              className="w-12 h-12 rounded-full object-cover ring-2 ring-memento-accent-pink/30"
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-white">{mentor.name}</h4>
                              <p className="text-xs text-memento-accent-pink">{mentor.role}</p>
                              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{mentor.style}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* Right Column: Special Instructions */}
                  <div className="space-y-6">
                    <section className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Lightbulb size={14} />
                        Special Instructions
                      </h3>
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/20 to-memento-accent-pink/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                        <textarea
                          value={specialInstructions}
                          onChange={(e) => setSpecialInstructions(e.target.value)}
                          placeholder="Add any special instructions for your mentor session:

• Communication style preferences
• Areas to focus on or avoid
• Specific frameworks to use
• Level of challenge desired
• How direct/gentle feedback should be"
                          className="relative w-full h-48 bg-[#0B0E13] border border-white/10 rounded-xl p-4 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-0 resize-none shadow-inner leading-relaxed"
                        />
                        <Sparkles size={16} className="absolute bottom-4 right-4 text-slate-600" />
                      </div>
                    </section>

                    {/* Knowledge Base Indicator */}
                    {notebookId && (
                      <section className="space-y-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/20">
                              <BookOpen size={18} className="text-emerald-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-emerald-300">Knowledge Connected</h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Your mentor will reference your notebook's content using LightRAG for context-aware coaching.
                              </p>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {!notebookId && (
                      <section className="space-y-3">
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-500/20">
                              <Lightbulb size={18} className="text-amber-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-amber-300">General Coaching</h4>
                              <p className="text-xs text-slate-400 mt-0.5">
                                No notebook connected. Your mentor will provide general guidance without document context.
                              </p>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>

              {/* Setup Footer */}
              <div className="p-6 border-t border-white/10 bg-[#0B0E13] shrink-0 flex justify-end gap-4 z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                <Button variant="ghost" size="lg" onClick={handleClose}>Cancel</Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleGenerate}
                  isLoading={isGenerating}
                  icon={!isGenerating ? <Play size={18} /> : undefined}
                  className="min-w-[200px] !bg-memento-accent-pink hover:!bg-pink-400 text-white shadow-[0_0_30px_rgba(244,114,182,0.2)]"
                >
                  {isGenerating ? 'Preparing Session...' : 'Start Session'}
                </Button>
              </div>
            </div>
          ) : (
            /* ============ SESSION VIEW ============ */
            <div className="flex h-full relative animate-in fade-in zoom-in-95 duration-700 bg-[#050608]">

              {/* Left Side: Mentor Display */}
              <div className="w-[45%] p-4 flex flex-col relative">
                {/* Session Header */}
                <div className="flex items-center justify-between mb-4 px-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{topic || 'Mentor Session'}</h2>
                    <p className="text-xs text-slate-400">
                      {parseInt(mentorCount) === 1 ? 'One-on-One Session' : parseInt(mentorCount) === 2 ? 'Tag Team Session' : 'Roundtable Session'}
                    </p>
                  </div>
                  {ragContext && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                      <BookOpen size={12} className="text-emerald-400" />
                      <span className="text-xs text-emerald-300">Context Active</span>
                    </div>
                  )}
                </div>

                {/* Mentors Grid */}
                <div className={`flex-1 grid gap-4 ${parseInt(mentorCount) === 1 ? 'grid-cols-1' :
                    parseInt(mentorCount) === 2 ? 'grid-cols-1' :
                      'grid-cols-1'
                  }`}>
                  {getActiveMentors().map((mentor) => (
                    <div
                      key={mentor.id}
                      className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/50 flex items-center justify-center group shadow-2xl"
                    >
                      {/* Background Image */}
                      <img
                        src={mentor.image}
                        alt={mentor.name}
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-700 scale-105 group-hover:scale-100"
                      />

                      {/* Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-transparent to-transparent opacity-90" />

                      {/* Audio Wave Animation (Center) - shows when typing, loading, or speaking */}
                      {(isTyping || isLoadingAudio || isSpeaking) && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 h-16">
                          {[1, 2, 3, 4, 5, 6, 7].map(i => (
                            <div
                              key={i}
                              className={`w-1.5 rounded-full animate-pulse shadow-[0_0_10px] ${isSpeaking
                                  ? 'bg-emerald-400 shadow-emerald-400'
                                  : isLoadingAudio
                                    ? 'bg-cyan-400 shadow-cyan-400'
                                    : 'bg-memento-accent-pink shadow-[#F472B6]'
                                }`}
                              style={{
                                height: `${20 + Math.random() * 60}%`,
                                animationDuration: `${0.3 + Math.random() * 0.4}s`,
                                animationDelay: `${i * 0.05}s`
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Mentor Info */}
                      <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16">
                        <div className="flex items-end justify-between">
                          <div>
                            <h3 className="text-white font-display font-bold text-2xl shadow-black drop-shadow-md tracking-tight">{mentor.name}</h3>
                            <p className="text-memento-accent-pink text-sm font-medium tracking-wide uppercase mt-1 flex items-center gap-2">
                              {mentor.role}
                              {isTyping && <span className="w-1.5 h-1.5 rounded-full bg-memento-accent-pink animate-pulse" />}
                              {isLoadingAudio && (
                                <span className="flex items-center gap-1 text-cyan-400">
                                  <Loader2 size={12} className="animate-spin" />
                                  <span className="text-[10px] uppercase tracking-wider">Generating</span>
                                </span>
                              )}
                              {isSpeaking && (
                                <span className="flex items-center gap-1 text-emerald-400">
                                  <Volume2 size={12} className="animate-pulse" />
                                  <span className="text-[10px] uppercase tracking-wider">Speaking</span>
                                </span>
                              )}
                            </p>
                          </div>
                          <div className={`p-3 rounded-full border transition-all ${isLoadingAudio
                              ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse'
                              : isSpeaking
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse'
                                : isTyping
                                  ? 'bg-memento-accent-pink/20 text-memento-accent-pink border-memento-accent-pink/30'
                                  : 'bg-white/10 text-white/90 border-white/5'
                            }`}>
                            {isLoadingAudio ? <Loader2 size={18} className="animate-spin" /> : isSpeaking ? <Volume2 size={18} /> : <Mic size={18} />}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Controls */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setIsMicOn(!isMicOn)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${isMicOn
                        ? 'bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white border border-white/10'
                        : 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                      }`}
                  >
                    {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                  </button>

                  <button
                    onClick={() => setIsCamOn(!isCamOn)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${isCamOn
                        ? 'bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white border border-white/10'
                        : 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                      }`}
                  >
                    {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
                  </button>

                  <div className="w-px h-8 bg-white/10 mx-2" />

                  {/* Voice Controls */}
                  <button
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${voiceEnabled
                        ? 'bg-memento-accent-pink/20 text-memento-accent-pink border border-memento-accent-pink/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                      }`}
                    title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
                  >
                    {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                  </button>

                  {/* Loading Audio Indicator */}
                  {isLoadingAudio && (
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  )}

                  {/* Stop Speaking Button */}
                  {(isSpeaking || isLoadingAudio) && (
                    <button
                      onClick={stopSpeaking}
                      className="w-12 h-12 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all animate-pulse"
                      title="Stop speaking"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  )}

                  <div className="w-px h-8 bg-white/10 mx-2" />

                  <button
                    onClick={handleClose}
                    className="h-12 px-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                  >
                    <PhoneOff size={18} />
                    <span className="text-sm font-semibold">End Session</span>
                  </button>
                </div>
              </div>

              {/* Right Side: Chat Interface */}
              <div className="flex-1 flex flex-col border-l border-white/10 bg-[#0B0E13]">
                {/* Chat Header */}
                <div className="p-4 border-b border-white/10 bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Session Chat</h3>
                    <div className="flex items-center gap-3">
                      {/* Voice Status */}
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${isLoadingAudio
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                          : isSpeaking
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : voiceEnabled
                              ? 'bg-white/5 text-slate-400 border border-white/10'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        {isLoadingAudio ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : isSpeaking ? (
                          <>
                            <Volume2 size={12} className="animate-pulse" />
                            <span>Speaking...</span>
                          </>
                        ) : voiceEnabled ? (
                          <>
                            <Volume2 size={12} />
                            <span>AI Voice</span>
                          </>
                        ) : (
                          <>
                            <VolumeX size={12} />
                            <span>Voice Off</span>
                          </>
                        )}
                      </div>
                      {/* Live indicator */}
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Live
                      </div>
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {messages.map((message) => {
                    const mentor = message.mentorId ? MENTORS.find(m => m.id === message.mentorId) : null;

                    return (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        {/* Avatar */}
                        <div className="shrink-0">
                          {message.role === 'mentor' && mentor ? (
                            <img
                              src={mentor.image}
                              alt={mentor.name}
                              className="w-10 h-10 rounded-full object-cover ring-2 ring-memento-accent-pink/30"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center ring-2 ring-purple-500/30">
                              <User size={18} className="text-purple-400" />
                            </div>
                          )}
                        </div>

                        {/* Message Content */}
                        <div className={`max-w-[80%] ${message.role === 'user' ? 'text-right' : ''}`}>
                          {message.role === 'mentor' && mentor && (
                            <p className="text-xs text-memento-accent-pink mb-1">{mentor.name}</p>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user'
                                ? 'bg-purple-500/20 text-white border border-purple-500/30 rounded-tr-md'
                                : 'bg-white/5 text-slate-200 border border-white/10 rounded-tl-md'
                              }`}
                          >
                            <div className="prose prose-sm prose-invert max-w-none">
                              {message.content.split('\n').map((line, i) => (
                                <p key={i} className="mb-2 last:mb-0">
                                  {line.split('**').map((part, j) =>
                                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                                  )}
                                </p>
                              ))}
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-600 mt-1">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-3">
                      <div className="shrink-0">
                        <img
                          src={getActiveMentors()[0].image}
                          alt="Typing"
                          className="w-10 h-10 rounded-full object-cover ring-2 ring-memento-accent-pink/30 animate-pulse"
                        />
                      </div>
                      <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-md px-4 py-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-memento-accent-pink rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-memento-accent-pink rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-memento-accent-pink rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-white/10 bg-[#080A0E]">
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-memento-accent-pink/30 to-purple-500/30 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                    <div className="relative bg-[#0F1218] border border-white/10 rounded-xl flex items-center px-4 h-14">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask your mentor anything..."
                        disabled={isTyping}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder:text-slate-600 h-full disabled:opacity-50"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!inputMessage.trim() || isTyping}
                        className="p-2 rounded-lg bg-memento-accent-pink hover:bg-pink-400 disabled:opacity-50 disabled:hover:bg-memento-accent-pink text-white transition-colors ml-2"
                      >
                        {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 text-center">
                    Press Enter to send • Your mentor has access to your notebook content
                  </p>
                </div>
              </div>

              {/* Self View (Floating) */}
              <div className="absolute top-4 right-4 w-40 aspect-video bg-[#1A1D24] rounded-xl border border-white/20 overflow-hidden shadow-2xl z-50">
                <div className="w-full h-full relative">
                  {!isCamOn ? (
                    <div className="w-full h-full flex items-center justify-center bg-[#1A1D24]">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                        <User size={16} className="text-slate-400" />
                      </div>
                    </div>
                  ) : (
                    <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300&h=300" alt="You" className="w-full h-full object-cover transform scale-x-[-1]" />
                  )}

                  <div className="absolute bottom-2 left-2 flex items-center gap-1">
                    <span className="text-[9px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm">YOU</span>
                    {!isMicOn && <div className="bg-red-500 p-0.5 rounded-full"><MicOff size={8} className="text-white" /></div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
};
