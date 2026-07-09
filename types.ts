
import { ReactNode } from "react";

export interface NavItem {
  label: string;
  icon: ReactNode;
  path: string;
}

export interface Source {
  id: string;
  title: string;
  type: 'pdf' | 'youtube' | 'web' | 'audio';
  author?: string;
  date?: string;
  trustScore: number; // 0-100
  status: 'processed' | 'processing' | 'error';
  file_path?: string; // Path in storage bucket
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  citations?: string[];
  citationDetails?: Record<number, {
    sourceId: string;
    text: string;
    score: number;
  }>;
  timestamp: Date;
}

export interface StudioAction {
  id: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  color: 'purple' | 'cyan' | 'pink' | 'blue';
}

export interface Notebook {
  id: string;
  title: string;
  lastEdited: string;
  sourceCount: number;
  coverColor: string;
}

export type AudioFormat = 'Solo' | 'Deep Dive' | 'Critical' | 'Debate' | 'Analysis';
export type AudioDuration = '10 min' | '30 min' | '1 hr' | '3 hr' | 'Custom';

export type VideoFormat = 'Deep Dive' | 'Summary' | 'Debate' | 'Analysis';
export type VideoDuration = '5 min' | '10 min' | '20 min';

export type HandbookFormat = 'Study Guide' | 'Cheatsheet' | 'Briefing' | 'Comprehensive';
export type HandbookLength = '5 Pages' | '15 Pages' | '30+ Pages';

export type MentorCount = '1' | '2' | '3';

export type MindMapStyle = 'Hierarchical' | 'Radial' | 'Flowchart' | 'Concept Map';
export type ReportFormat = 'Executive Summary' | 'Research Paper' | 'Technical Memo' | 'Literature Review';
export type ReportTone = 'Professional' | 'Academic' | 'Persuasive' | 'Neutral';
export type FlashcardCount = '10 Cards' | '25 Cards' | '50 Cards';
export type QuizType = 'Multiple Choice' | 'True/False' | 'Short Answer' | 'Mixed';
export type QuizLength = '5 Questions' | '10 Questions' | '20 Questions';
export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard';

// Quiz data structures
export interface QuizAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer';
  question: string;
  answers: QuizAnswer[];
  correctAnswer: string; // Answer ID for MC/TF, or answer text for short answer
  explanation: string;
  difficulty: QuizDifficulty;
  relatedEntities?: string[]; // Optional: entities from knowledge graph
}

export interface GeneratedQuiz {
  id: string;
  notebookId: string;
  title: string;
  questions: QuizQuestion[];
  metadata: {
    type: QuizType;
    difficulty: QuizDifficulty;
    totalQuestions: number;
    createdAt: string;
    customPrompt?: string;
  };
}

export interface QuizAttempt {
  quizId: string;
  answers: Record<string, string>; // questionId -> answerId or text
  score?: number;
  completedAt?: string;
}

// Flashcard data structures
export interface Flashcard {
  id: string;
  front: string; // Question or term
  back: string; // Answer or definition
  hint?: string; // Optional hint
  difficulty: 'Easy' | 'Medium' | 'Hard';
  relatedEntities?: string[]; // Optional: entities from knowledge graph
}

export interface FlashcardDeck {
  id: string;
  notebookId: string;
  title: string;
  cards: Flashcard[];
  metadata: {
    difficulty: 'Easy' | 'Medium' | 'Hard';
    totalCards: number;
    createdAt: string;
    customPrompt?: string;
  };
}

export interface FlashcardProgress {
  deckId: string;
  cardStatuses: Record<string, 'learning' | 'reviewing' | 'mastered'>; // cardId -> status
  currentIndex: number;
  masteredCount: number;
  reviewingCount: number;
  learningCount: number;
  lastStudiedAt: string;
}

// Report data structures
export interface ReportImage {
  id: string;
  prompt: string;
  url: string;
  base64?: string;
  type: 'chart' | 'diagram' | 'infographic' | 'illustration';
  caption: string;
}

export interface GeneratedReport {
  id: string;
  notebookId: string;
  title: string;
  content: string; // Markdown formatted content
  sections: ReportSection[];
  images?: ReportImage[]; // AI-generated images
  metadata: {
    format: ReportFormat;
    tone: ReportTone;
    createdAt: string;
    customPrompt?: string;
    sourceCount: number;
    wordCount: number;
    model?: string;
    hasImages?: boolean;
  };
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  level: number; // Heading level (1, 2, 3, etc.)
}

// Mind Map data structures
export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  type: 'central' | 'main' | 'sub' | 'detail';
  color?: string;
  x?: number;
  y?: number;
  expanded?: boolean;
  relatedEntities?: string[]; // Related entities from knowledge graph
}

export interface MindMapEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  label?: string; // Relationship label
  type?: 'solid' | 'dashed' | 'dotted';
}

export interface GeneratedMindMap {
  id: string;
  notebookId: string;
  title: string;
  centralTopic: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  metadata: {
    style: MindMapStyle;
    nodeCount: number;
    createdAt: string;
    customPrompt?: string;
    sourceCount: number;
  };
}

// Handbook data structures
export interface HandbookSection {
  id: string;
  title: string;
  content: string;
  level: number;
  subsections?: HandbookSection[];
}

export interface HandbookTOCEntry {
  id: string;
  title: string;
  level: number;
  pageEstimate?: number;
}

export interface GeneratedHandbook {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  format: HandbookFormat;
  length: HandbookLength;
  sections: HandbookSection[];
  tableOfContents: HandbookTOCEntry[];
  metadata: {
    createdAt: string;
    wordCount: number;
    pageEstimate: number;
    model: 'nemotron';
    sourceCount: number;
    customPrompt?: string;
  };
}

