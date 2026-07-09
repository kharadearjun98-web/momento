import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveWithLightRAG, retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';
import { FlashcardDeck, Flashcard, FlashcardProgress } from '../types';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

export type FlashcardCount = '10 Cards' | '25 Cards' | '50 Cards';
export type FlashcardDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface FlashcardGenerationOptions {
  count: FlashcardCount;
  difficulty: FlashcardDifficulty;
  customPrompt?: string;
}

/**
 * Generate flashcards from notebook sources using OpenAI
 */
export async function generateFlashcards(
  notebookId: string,
  options: FlashcardGenerationOptions
): Promise<FlashcardDeck> {
  try {
    console.log('🎴 Generating flashcards...');
    console.log('   Notebook ID:', notebookId);
    console.log('   Count:', options.count);
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
        entityCount: 25,
        relationshipCount: 20
      });
    } else {
      // Broad retrieval for general flashcards
      graphData = await getAllGraphData(notebookId, 50);
    }

    // Retrieve RAG context - use custom prompt if provided, otherwise use general query
    const query = options.customPrompt || `Generate flashcards about ${notebook.title}`;
    const ragContext = await retrieveWithLightRAG(query, notebookId, { chunkCount: 15 });

    console.log(`   ✓ RAG: ${ragContext.chunks.length} chunks, ${graphData.entities.length} entities`);

    // Combine source content
    const combinedContent = sourcesWithContent
      .map(s => `📄 ${s.title}\n${s.content?.substring(0, 2000) || ''}`)
      .join('\n\n');

    // Format RAG context
    const entitiesContext = graphData.entities.length > 0
      ? `**Key Concepts:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`
      : '';

    const relationshipsContext = graphData.relationships.length > 0
      ? `**Key Connections:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}: ${r.description}`).join('\n')}`
      : '';

    const chunksContext = ragContext.chunks.length > 0
      ? `**Relevant Information:**\n${ragContext.chunks.map((c, i) => `${i + 1}. ${c.content.substring(0, 400)}...`).join('\n\n')}`
      : '';

    // Parse card count from count string
    const cardCount = parseInt(options.count.split(' ')[0]);

    // Get difficulty-specific instructions
    const difficultyInstructions = getDifficultyInstructions(options.difficulty);

    // Build prompt
    const prompt = `You are an expert educational flashcard designer. Generate a set of ${cardCount} flashcards based on the following content.

CONTEXT FROM KNOWLEDGE GRAPH:
${entitiesContext}

${relationshipsContext}

RELEVANT EXCERPTS:
${chunksContext}

SOURCE CONTENT:
${combinedContent.substring(0, 8000)}

INSTRUCTIONS:
1. Create exactly ${cardCount} flashcards.
2. Difficulty: ${options.difficulty} (${difficultyInstructions})
3. ${options.customPrompt ? `Focus specifically on: ${options.customPrompt}` : 'Cover the key concepts and relationships found in the knowledge graph.'}
4. Each flashcard should test one specific concept or fact.
5. Front side should be a clear question, term, or prompt.
6. Back side should be a concise but complete answer.
7. Include optional hints for harder concepts.
8. Ensure variety in the types of questions (definitions, comparisons, applications, etc.).

CRITICAL: Return a valid JSON object with this EXACT structure:
{
  "cards": [
    {
      "front": "Question or term to study",
      "back": "Answer or definition",
      "hint": "Optional hint or clue (can be null)",
      "difficulty": "${options.difficulty}"
    }
  ]
}

Make sure:
- Front is a clear prompt or question
- Back is a complete but concise answer
- Hints are helpful without giving away the answer
- Each card tests distinct knowledge
`;

    console.log('📡 Calling Lingshi API with GPT 5.4 Mini...');

    const completion = await chatProvider.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert flashcard generator. Always return valid JSON exactly matching the requested format. Create educational, effective flashcards that aid memory retention.',
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
    console.log('✅ Flashcards generated');
    console.log(`   Response length: ${responseText.length} characters`);

    // Parse response
    let parsedCards: Flashcard[];
    try {
      const parsed = JSON.parse(responseText);
      const rawCards = parsed.cards || [];

      if (!Array.isArray(rawCards) || rawCards.length === 0) {
        throw new Error('No flashcards generated');
      }

      // Map and validate cards
      parsedCards = rawCards.map((card: any, index: number) => ({
        id: `card-${Date.now()}-${index}`,
        front: card.front || 'Untitled Card',
        back: card.back || 'No answer provided',
        hint: card.hint || undefined,
        difficulty: card.difficulty || options.difficulty,
        relatedEntities: card.relatedEntities || [],
      }));

      console.log(`📝 Parsed ${parsedCards.length} flashcards`);
    } catch (parseError) {
      console.error('❌ Failed to parse flashcard JSON:', parseError);
      console.error('   Raw response:', responseText.substring(0, 500));
      throw new Error('Failed to generate valid flashcards. Please try again.');
    }

    // Create flashcard deck object
    const deck: FlashcardDeck = {
      id: crypto.randomUUID(),
      notebookId,
      title: `${notebook.title} - ${options.difficulty} Flashcards`,
      cards: parsedCards,
      metadata: {
        difficulty: options.difficulty,
        totalCards: parsedCards.length,
        createdAt: new Date().toISOString(),
        customPrompt: options.customPrompt,
      },
    };

    console.log(`✅ Flashcard deck created: ${deck.title}`);
    return deck;

  } catch (error) {
    console.error('❌ Error generating flashcards:', error);
    throw error;
  }
}

/**
 * Get difficulty-specific instructions
 */
function getDifficultyInstructions(difficulty: FlashcardDifficulty): string {
  switch (difficulty) {
    case 'Easy':
      return `**Difficulty: Easy**
- Focus on basic facts, definitions, and key terms
- Use straightforward language
- Test fundamental understanding
- Answers should be short and memorable
- Good for initial learning and review`;

    case 'Medium':
      return `**Difficulty: Medium**
- Include concepts that require understanding relationships
- Test application of knowledge
- Some analysis and comparison questions
- Answers may require connecting multiple ideas
- Good for reinforcing learned material`;

    case 'Hard':
      return `**Difficulty: Hard**
- Test deep understanding and synthesis
- Include edge cases and nuanced concepts
- Require critical thinking
- May involve multi-step reasoning
- Challenge assumptions and test thorough mastery`;

    default:
      return '';
  }
}

/**
 * Save flashcard deck to database
 */
export async function saveFlashcards(deck: FlashcardDeck): Promise<string> {
  try {
    console.log('💾 Saving flashcard deck to database...');

    const { data, error } = await supabase
      .from('generated_assets')
      .insert({
        notebook_id: deck.notebookId,
        type: 'flashcards',
        title: deck.title,
        metadata: {
          flashcardData: deck,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    console.log(`✅ Flashcard deck saved with ID: ${data.id}`);
    return data.id;

  } catch (error) {
    console.error('❌ Error saving flashcard deck:', error);
    throw error;
  }
}

/**
 * Save flashcard study progress to localStorage
 */
export function saveFlashcardProgress(
  deckId: string,
  progress: Omit<FlashcardProgress, 'deckId'>
): void {
  const progressKey = `flashcard_progress_${deckId}`;
  const fullProgress: FlashcardProgress = {
    deckId,
    ...progress,
    lastStudiedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(progressKey, JSON.stringify(fullProgress));
    console.log(`💾 Flashcard progress saved for deck: ${deckId}`);
  } catch (error) {
    console.error('Failed to save flashcard progress:', error);
  }
}

/**
 * Load flashcard study progress from localStorage
 */
export function loadFlashcardProgress(deckId: string): FlashcardProgress | null {
  const progressKey = `flashcard_progress_${deckId}`;

  try {
    const stored = localStorage.getItem(progressKey);
    if (stored) {
      const progress = JSON.parse(stored);
      console.log(`📖 Loaded flashcard progress for: ${deckId}`);
      return progress;
    }
  } catch (error) {
    console.error('Failed to load flashcard progress:', error);
  }

  return null;
}

/**
 * Clear flashcard progress from localStorage
 */
export function clearFlashcardProgress(deckId: string): void {
  const progressKey = `flashcard_progress_${deckId}`;
  try {
    localStorage.removeItem(progressKey);
    console.log(`🗑️ Cleared flashcard progress for: ${deckId}`);
  } catch (error) {
    console.error('Failed to clear flashcard progress:', error);
  }
}

/**
 * Calculate progress statistics from card statuses
 */
export function calculateProgressStats(
  cardStatuses: Record<string, 'learning' | 'reviewing' | 'mastered'>,
  totalCards: number
): { masteredCount: number; reviewingCount: number; learningCount: number } {
  let masteredCount = 0;
  let reviewingCount = 0;
  let learningCount = 0;

  Object.values(cardStatuses).forEach(status => {
    if (status === 'mastered') masteredCount++;
    else if (status === 'reviewing') reviewingCount++;
    else learningCount++;
  });

  // Cards not yet seen are in learning
  learningCount = Math.max(learningCount, totalCards - masteredCount - reviewingCount - learningCount);

  return { masteredCount, reviewingCount, learningCount };
}
