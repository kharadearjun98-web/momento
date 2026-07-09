import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveWithLightRAG, retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';
import { QuizType, QuizLength, QuizDifficulty, GeneratedQuiz, QuizQuestion } from '../types';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

export interface QuizGenerationOptions {
  type: QuizType;
  length: QuizLength;
  difficulty: QuizDifficulty;
  customPrompt?: string;
}

/**
 * Generate quiz questions from notebook sources using OpenAI
 */
export async function generateQuiz(
  notebookId: string,
  options: QuizGenerationOptions
): Promise<GeneratedQuiz> {
  try {
    console.log('🎯 Generating quiz...');
    console.log('   Notebook ID:', notebookId);
    console.log('   Type:', options.type);
    console.log('   Length:', options.length);
    console.log('   Difficulty:', options.difficulty);

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
      .select('title, content, type')
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
    let graphData;

    if (options.customPrompt) {
      // Focused retrieval based on learning goals
      graphData = await retrieveGraphForTopic(options.customPrompt, notebookId, {
        entityCount: 20,
        relationshipCount: 15
      });
    } else {
      // Broad retrieval for general quiz
      graphData = await getAllGraphData(notebookId, 40);
    }

    // Retrieve RAG context - use custom prompt if provided, otherwise use general query
    const query = options.customPrompt || `Generate quiz questions about ${notebook.title}`;
    const ragContext = await retrieveWithLightRAG(query, notebookId, { chunkCount: 10 });

    console.log(`   ✓ RAG: ${ragContext.chunks.length} chunks, ${graphData.entities.length} entities`);

    // Combine source content
    const combinedContent = sourcesWithContent
      .map(s => `📄 ${s.title}\n${s.content?.substring(0, 1500) || ''}`)
      .join('\n\n');

    // Format RAG context
    const entitiesContext = graphData.entities.length > 0
      ? `**Key Concepts:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`
      : '';

    const relationshipsContext = graphData.relationships.length > 0
      ? `**Key Connections:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}: ${r.description}`).join('\n')}`
      : '';

    const chunksContext = ragContext.chunks.length > 0
      ? `**Relevant Information:**\n${ragContext.chunks.map((c, i) => `${i + 1}. ${c.content.substring(0, 300)}...`).join('\n\n')}`
      : '';

    // Parse question count from length
    const questionCount = parseInt(options.length.split(' ')[0]);

    // Map quiz types to question format
    const typeInstructions = getTypeInstructions(options.type);
    const difficultyInstructions = getDifficultyInstructions(options.difficulty);

    // Build prompt
    const prompt = `You are an expert educational assessment designer. Generate a quiz with ${questionCount} questions based on the following content.

CONTEXT FROM KNOWLEDGE GRAPH:
${entitiesContext}

${relationshipsContext}

RELEVANT EXCERPTS:
${chunksContext}

SOURCE CONTENT:
${combinedContent.substring(0, 6000)}

INSTRUCTIONS:
1. Create ${questionCount} questions.
2. Difficulty: ${options.difficulty} (${difficultyInstructions})
3. Format: ${options.type} (${typeInstructions})
4. ${options.customPrompt ? `Focus specifically on: ${options.customPrompt}` : 'Cover the key concepts and relationships found in the knowledge graph.'}
5. Ensure questions test understanding of relationships and concepts, not just rote memorization.

CRITICAL: Return a valid JSON object with this EXACT structure:
{
  "questions": [
    {
      "question": "Question text",
      "type": "multiple-choice" | "true-false" | "short-answer",
      "answers": [
        { "id": "a1", "text": "Option text", "isCorrect": boolean },
        ...
      ],
      "correctAnswer": "id_of_correct_answer", // For short answer, this is the text answer
      "explanation": "Detailed explanation",
      "difficulty": "${options.difficulty}"
    }
  ]
}

For Short Answer questions, "answers" array should be empty, and "correctAnswer" should contain the model answer text.
`;

    console.log('📡 Calling Lingshi API with GPT 5.4 Mini...');

    const completion = await chatProvider.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert quiz generator. Always return valid JSON exactly matching the requested format. Be precise and educational.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0].message.content || '{}';
    console.log('✅ Quiz generated');
    console.log(`   Response length: ${responseText.length} characters`);

    // Parse response
    let parsedQuestions: QuizQuestion[];
    try {
      const parsed = JSON.parse(responseText);
      const rawQuestions = parsed.questions || [];

      if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
        throw new Error('No questions generated');
      }

      // Map and validate questions
      parsedQuestions = rawQuestions.map((q: any, index: number) => {
        // Handle legacy "options" format if LLM hallucinates
        let answers = q.answers;
        if (!answers && Array.isArray(q.options)) {
          answers = q.options.map((opt: string, idx: number) => ({
            id: `opt-${idx}`,
            text: opt,
            isCorrect: idx === q.correctAnswer
          }));
        }

        // Ensure answers is an array
        if (!Array.isArray(answers)) {
          answers = [];
        }

        return {
          id: q.id || `q-${Date.now()}-${index}`,
          type: q.type || options.type,
          question: q.question || 'Untitled Question',
          answers: answers,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || 'No explanation provided.',
          difficulty: q.difficulty || options.difficulty,
          relatedEntities: q.relatedEntities || [],
        };
      });

      console.log(`📝 Parsed ${parsedQuestions.length} questions`);
    } catch (parseError) {
      console.error('❌ Failed to parse quiz JSON:', parseError);
      console.error('   Raw response:', responseText.substring(0, 500));
      throw new Error('Failed to generate valid quiz questions. Please try again.');
    }

    // Create quiz object
    const quiz: GeneratedQuiz = {
      id: crypto.randomUUID(),
      notebookId,
      title: `${notebook.title} - ${options.difficulty} ${options.type} Quiz`,
      questions: parsedQuestions,
      metadata: {
        type: options.type,
        difficulty: options.difficulty,
        totalQuestions: parsedQuestions.length,
        createdAt: new Date().toISOString(),
        customPrompt: options.customPrompt,
      },
    };

    console.log(`✅ Quiz created: ${quiz.title}`);
    return quiz;

  } catch (error) {
    console.error('❌ Error generating quiz:', error);
    throw error;
  }
}

/**
 * Get type-specific instructions for question generation
 */
function getTypeInstructions(type: QuizType): string {
  switch (type) {
    case 'Multiple Choice':
      return `**Question Format - Multiple Choice:**
- Each question has exactly 4 answer options (A, B, C, D)
- Only ONE answer is correct
- Make wrong answers (distractors) plausible but clearly incorrect
- Avoid "all of the above" or "none of the above" unless truly appropriate`;

    case 'True/False':
      return `**Question Format - True/False:**
- Each question has exactly 2 options: True and False
- Make statements clear and unambiguous
- Avoid trick questions with double negatives
- Base on factual content from the sources`;

    case 'Short Answer':
      return `**Question Format - Short Answer:**
- Questions require a brief written response (1-2 sentences or key terms)
- Answers should be specific and verifiable
- Provide the expected answer as correctAnswer text
- Leave answers array empty for short answer questions`;

    case 'Mixed':
      return `**Question Format - Mixed:**
- Include a mix of Multiple Choice, True/False, and Short Answer questions
- Distribute question types evenly
- Use the appropriate format for each question type as described above`;

    default:
      return '';
  }
}

/**
 * Get difficulty-specific instructions
 */
function getDifficultyInstructions(difficulty: QuizDifficulty): string {
  switch (difficulty) {
    case 'Easy':
      return `**Difficulty: Easy**
- Focus on basic facts and definitions
- Test fundamental understanding of key concepts
- Use straightforward language
- Questions should be answerable by someone who read the material once`;

    case 'Medium':
      return `**Difficulty: Medium**
- Test comprehension and application of concepts
- Require understanding of relationships between ideas
- Include some analysis and inference
- Questions require careful reading and understanding`;

    case 'Hard':
      return `**Difficulty: Hard**
- Test deep understanding and synthesis of concepts
- Require critical thinking and analysis
- Include edge cases and nuanced distinctions
- May require connecting multiple concepts
- Challenge assumptions and test thorough understanding`;

    default:
      return '';
  }
}

/**
 * Save quiz to database
 */
export async function saveQuiz(quiz: GeneratedQuiz): Promise<string> {
  try {
    console.log('💾 Saving quiz to database...');

    const { data, error } = await supabase
      .from('generated_assets')
      .insert({
        notebook_id: quiz.notebookId,
        type: 'quiz',
        title: quiz.title,
        metadata: {
          quizData: quiz,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    console.log(`✅ Quiz saved with ID: ${data.id}`);
    return data.id;

  } catch (error) {
    console.error('❌ Error saving quiz:', error);
    throw error;
  }
}

/**
 * Validate user answers and calculate score
 */
export function validateQuizAnswers(
  quiz: GeneratedQuiz,
  userAnswers: Record<string, string>
): {
  score: number;
  totalQuestions: number;
  percentage: number;
  results: Array<{
    questionId: string;
    correct: boolean;
    userAnswer: string;
    correctAnswer: string;
    explanation: string;
  }>;
} {
  const results = quiz.questions.map(question => {
    const userAnswer = userAnswers[question.id] || '';
    let isCorrect = false;

    if (question.type === 'short-answer') {
      // For short answer, do case-insensitive comparison
      // Ensure both are treated as strings
      const userAns = String(userAnswer).trim().toLowerCase();
      const correctAns = String(question.correctAnswer).trim().toLowerCase();
      isCorrect = userAns === correctAns;
    } else {
      // For multiple choice and true/false, compare answer IDs
      // Handle potential type mismatch (string vs number)
      isCorrect = String(userAnswer) === String(question.correctAnswer);
    }

    return {
      questionId: question.id,
      correct: isCorrect,
      userAnswer,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    };
  });

  const correctCount = results.filter(r => r.correct).length;
  const totalQuestions = quiz.questions.length;
  const percentage = Math.round((correctCount / totalQuestions) * 100);

  return {
    score: correctCount,
    totalQuestions,
    percentage,
    results,
  };
}

/**
 * Save a quiz attempt to localStorage
 */
export function saveQuizAttempt(
  quizId: string,
  userAnswers: Record<string, string>,
  results: ReturnType<typeof validateQuizAnswers>
): void {
  const attemptKey = `quiz_attempt_${quizId}`;
  const attempt = {
    quizId,
    userAnswers,
    results,
    completedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(attemptKey, JSON.stringify(attempt));
    console.log(`💾 Quiz attempt saved for quiz: ${quizId}`);
  } catch (error) {
    console.error('Failed to save quiz attempt:', error);
  }
}

/**
 * Load a previous quiz attempt from localStorage
 */
export function loadQuizAttempt(quizId: string): {
  userAnswers: Record<string, string>;
  results: ReturnType<typeof validateQuizAnswers>;
  completedAt: string;
} | null {
  const attemptKey = `quiz_attempt_${quizId}`;

  try {
    const stored = localStorage.getItem(attemptKey);
    if (stored) {
      const attempt = JSON.parse(stored);
      console.log(`📖 Loaded previous quiz attempt for: ${quizId}`);
      return attempt;
    }
  } catch (error) {
    console.error('Failed to load quiz attempt:', error);
  }

  return null;
}

/**
 * Clear a quiz attempt from localStorage
 */
export function clearQuizAttempt(quizId: string): void {
  const attemptKey = `quiz_attempt_${quizId}`;
  try {
    localStorage.removeItem(attemptKey);
    console.log(`🗑️ Cleared quiz attempt for: ${quizId}`);
  } catch (error) {
    console.error('Failed to clear quiz attempt:', error);
  }
}
