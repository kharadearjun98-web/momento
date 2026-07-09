import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

const openai = createServerOnlyProviderClient('tts');

export interface SpeechSegment {
  speaker: 'host1' | 'host2' | 'solo';
  text: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
}

// Voice mapping for OpenAI TTS
const VOICE_MAP = {
  host1: 'onyx' as const,  // Male voice - enthusiastic
  host2: 'nova' as const,   // Female voice - analytical
  solo: 'alloy' as const,   // Neutral voice - educational
};

export interface AudioOverviewOptions {
  format: 'solo' | 'deep-dive' | 'critical' | 'debate' | 'analysis';
  duration: string; // '10min', '30min', '1hr', '3hr', or custom like '45min'
  customPrompt?: string;
  graphMode?: 'broad' | 'focused' | 'exploratory';
  speakerNames?: {
    host1?: string;
    host2?: string;
    solo?: string;
  };
  speakerPersonalities?: {
    host1?: string;
    host2?: string;
    solo?: string;
  };
}

export interface AudioScript {
  segments: SpeechSegment[];
  estimatedDuration: number;
}

/**
 * Generate podcast script from notebook sources
 */
export async function generatePodcastScript(
  notebookId: string,
  options: AudioOverviewOptions
): Promise<AudioScript> {
  try {
    console.log('🤖 Generating podcast script...');
    console.log('   Notebook ID:', notebookId);
    console.log('   Graph Mode:', options.graphMode || 'broad');

    // Fetch all sources for the notebook
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('title, content, type, processing_status')
      .eq('notebook_id', notebookId);

    if (sourcesError) {
      console.error('❌ Supabase error:', sourcesError);
      throw sourcesError;
    }

    console.log(`📚 Found ${sources?.length || 0} sources`);

    if (!sources || sources.length === 0) {
      throw new Error('No sources found for this notebook. Please upload some documents first.');
    }

    // Filter only sources with content
    const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);

    if (sourcesWithContent.length === 0) {
      console.error('❌ No sources with content found!');
      throw new Error('Sources found but none have been processed yet. Try uploading again.');
    }

    console.log(`✅ Using ${sourcesWithContent.length} sources with content`);

    // Retrieve knowledge graph data based on mode
    const graphMode = options.graphMode || 'broad';
    let graphData: { entities: any[]; relationships: any[] };

    if (graphMode === 'broad') {
      // Get all entities and relationships for comprehensive overview
      console.log('📊 Retrieving all graph data (broad mode)...');
      graphData = await getAllGraphData(notebookId, 50);
    } else if (graphMode === 'focused') {
      // Get top entities based on topic query
      const topic = options.customPrompt || sourcesWithContent.map(s => s.title).join(', ');
      console.log(`🎯 Retrieving focused graph data for: ${topic.substring(0, 50)}...`);
      graphData = await retrieveGraphForTopic(topic, notebookId, { entityCount: 15, relationshipCount: 10 });
    } else {
      // Exploratory mode: focus on relationships
      const topic = options.customPrompt || 'key relationships and connections';
      console.log(`🔍 Retrieving exploratory graph data...`);
      graphData = await retrieveGraphForTopic(topic, notebookId, { entityCount: 10, relationshipCount: 20 });
    }

    console.log(`   ✓ Graph: ${graphData.entities.length} entities, ${graphData.relationships.length} relationships`);

    // Combine source content (limit to avoid token overflow)
    const combinedContent = sourcesWithContent
      .map(s => `📄 ${s.title}\n${s.content?.substring(0, 2000) || ''}`)
      .join('\n\n');

    // Format entities for the prompt
    const entitiesContext = graphData.entities.length > 0
      ? `**Key Entities to Discuss:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`
      : '';

    // Format relationships for the prompt
    const relationshipsContext = graphData.relationships.length > 0
      ? `**Key Relationships to Explore:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}`).join('\n')}`
      : '';

    // Build prompt based on format
    const host1Name = options.speakerNames?.host1 || 'Alex';
    const host2Name = options.speakerNames?.host2 || 'Jordan';
    const soloName = options.speakerNames?.solo || 'Alex';

    const host1Personality = options.speakerPersonalities?.host1 || 'Enthusiastic, curious, asks great questions. Uses natural speech patterns with excitement.';
    const host2Personality = options.speakerPersonalities?.host2 || 'Analytical, thorough, provides deep explanations. Clear and methodical communicator.';
    const soloPersonality = options.speakerPersonalities?.solo || 'Knowledgeable, enthusiastic, and clear. Makes complex topics accessible and engaging.';

    const formatPrompts = {
      'solo': `Create an engaging educational monologue where a single speaker explains the topic clearly and thoroughly. The speaker should be conversational, enthusiastic, and make complex ideas accessible.`,
      'deep-dive': 'Create an in-depth educational podcast where two hosts explore the topic thoroughly, explaining complex concepts in detail with examples.',
      'critical': 'Create a critical analysis podcast where two hosts examine the topic from multiple perspectives, questioning assumptions and challenging ideas.',
      'debate': 'Create a debate-style podcast where two hosts present contrasting viewpoints and engage in thoughtful, respectful discussion.',
      'analysis': 'Create an analytical podcast where two hosts systematically break down the topic and draw insights.',
    };

    // Parse duration string to get target words (~150 words per minute for natural pacing)
    const parseDuration = (dur: string): { targetWords: number; maxTokens: number; maxContinuations: number } => {
      // Standard presets
      const presets: Record<string, number> = {
        '10min': 1500,
        '30min': 6500,
        '1hr': 13000,
        '3hr': 40000,
      };

      if (presets[dur]) {
        const words = presets[dur];
        return {
          targetWords: words,
          maxTokens: words <= 1500 ? 4000 : 4096,
          maxContinuations: words <= 1500 ? 3 : words <= 6500 ? 6 : words <= 13000 ? 15 : 30,
        };
      }

      // Parse custom duration like '45min'
      const minuteMatch = dur.match(/^(\d+)min$/);
      if (minuteMatch) {
        const minutes = parseInt(minuteMatch[1], 10);
        const words = Math.round(minutes * 150); // ~150 words per minute
        return {
          targetWords: words,
          maxTokens: 4096,
          maxContinuations: Math.max(3, Math.ceil(words / 3000)), // Estimate continuations needed
        };
      }

      // Default fallback
      return { targetWords: 1500, maxTokens: 4000, maxContinuations: 3 };
    };

    const { targetWords, maxTokens } = parseDuration(options.duration);

    // Different prompts for solo vs multi-speaker
    const prompt = options.format === 'solo'
      ? `You are creating a  script for a solo educational presentation.

${formatPrompts[options.format]}

**SPEAKER - ${soloName}**: ${soloPersonality}

**CRITICAL - Target length**: You MUST generate approximately ${targetWords} words (${options.duration} podcast).
${options.customPrompt ? `\n**Special focus**: ${options.customPrompt}\n` : ''}

**Length Requirements:**
- For ${options.duration}, aim for ${Math.floor(targetWords / 100)}-${Math.ceil(targetWords / 80)} paragraphs
- Each paragraph should be 3-5 sentences with depth and examples
- DO NOT rush through topics - explore each concept thoroughly
- Include specific examples, anecdotes, and detailed explanations

${entitiesContext}

${relationshipsContext}

**Content to discuss:**
${combinedContent.substring(0, 8000)}

**Instructions:**
1. Create a natural, engaging educational monologue
2. Weave in the key entities and relationships naturally throughout your presentation
3. Use conversational language and rhetorical questions
4. Break down complex concepts with clear explanations and examples
5. Reference specific entities and their relationships to build a coherent narrative
6. Include transitions and summaries
7. Make it feel like a one-on-one conversation with the listener
8. Use this EXACT format for each paragraph:

SOLO: [content here]

Start with a warm introduction mentioning key topics (entities), dive into the content exploring relationships and connections, and end with a clear conclusion and call to action.

Begin the podcast script now:`
      : `You are creating a podcast script for a conversation between two hosts.

${formatPrompts[options.format]}

**HOST 1 - ${host1Name}**: ${host1Personality}
**HOST 2 - ${host2Name}**: ${host2Personality}

**CRITICAL - Target length**: You MUST generate approximately ${targetWords} words (${options.duration} podcast).
${options.customPrompt ? `\n**Special focus**: ${options.customPrompt}\n` : ''}

**Length Requirements:**
- For ${options.duration}, aim for ${Math.floor(targetWords / 150)}-${Math.ceil(targetWords / 130)} exchanges (back-and-forth)
- Each speaker turn should be 2-4 sentences with depth and examples
- DO NOT rush through topics - explore each concept thoroughly with detailed discussion
- Include specific examples, follow-up questions, and detailed explanations
- Build naturally on each other's points with substance

${entitiesContext}

${relationshipsContext}

**Content to discuss:**
${combinedContent.substring(0, 8000)}

**Instructions:**
1. Create natural, engaging dialogue between the two hosts
2. Have ${host1Name} and ${host2Name} discover and discuss the key entities and relationships together
3. ${host1Name} asks curious questions about entities and their connections
4. ${host2Name} provides thorough explanations of relationships and deeper analysis
5. They build on each other's points naturally, exploring how concepts relate
6. Reference specific entities by name and explain their significance
7. Discuss relationships between entities to show connections and dependencies
8. Include reactions like "That's fascinating how X relates to Y!" or "Wait, so you're saying Z influences both?"
9. Use this EXACT format for each line:

HOST1: [dialogue here]
HOST2: [dialogue here]

Start with a warm introduction where they overview the key entities and topics, then dive into exploring relationships and connections. End with a clear conclusion and call to action.

Begin the podcast script now:`;

    // Call API to generate script - try OpenAI first (reliable), fallback to Lingshi models
    console.log('📡 Generating podcast script...');
    console.log('   Prompt length:', prompt.length);

    // Tiered model strategy: OpenAI (reliable, has credits) → Lingshi (bonus)
    type ModelConfig = { client: OpenAI; model: string; name: string };
    const modelsToTry: ModelConfig[] = [
      { client: chatProvider, model: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
      { client: chatProvider, model: 'gpt-5.4-low', name: 'GPT 5.4 Low' },
    ];
    const maxRetries = 2;
    const retryDelayMs = 2000;

    const systemPrompt = `You are an expert podcast scriptwriter who creates engaging, natural conversations.

CRITICAL RULES:
1. Generate approximately ${targetWords} words to match the ${options.duration} duration
2. This is NOT a summary - create FULL, DETAILED dialogue with depth and examples
3. Every exchange should add substantial value and explore topics thoroughly
4. **NEVER include phrases like "thank you for listening", "that's all for today", "we hope you enjoyed", "see you next time", "before we wrap up", "in conclusion", "to summarize", or ANY form of ending/conclusion**
5. Keep the conversation going naturally as if the podcast will continue indefinitely
6. Do NOT signal that the content is ending - more content will be added after your response`;

    let completion = null;
    let successfulModel = '';

    // Try each model with retry logic
    for (const { client, model, name } of modelsToTry) {
      console.log(`   🔄 Trying: ${name}`);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`      Attempt ${attempt}/${maxRetries}`);

          const response = await client.chat.completions.create({
            model: model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.9,
            max_tokens: maxTokens,
          });

          const content = response.choices[0]?.message?.content || '';
          console.log(`      📡 Response length: ${content.length} chars`);

          if (content.length >= 50) {
            completion = response;
            successfulModel = name;
            console.log(`   ✅ Success with ${name} on attempt ${attempt}`);
            break;
          } else {
            console.warn(`      ⚠️ Empty response, ${attempt < maxRetries ? 'retrying...' : 'trying next model...'}`);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
          }
        } catch (err: any) {
          console.error(`      ❌ Error:`, err.message);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          }
        }
      }

      if (completion) break; // Exit model loop if we got a valid response

      // Small delay before trying next model
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!completion) {
      throw new Error('Failed to generate script. All models returned empty responses. Please try again later.');
    }

    const scriptText = completion.choices[0].message.content || '';

    console.log('✅ Script generated');
    console.log(`   Model: ${successfulModel}`);
    console.log(`   Length: ${scriptText.length} characters`);

    // Parse initial segments and remove any premature conclusions
    let segments = parseScript(scriptText);

    // Check if this initial batch is enough (for short durations like 10min)
    let initialWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
    const isInitialSufficient = initialWords >= targetWords * 0.90;
    if (isInitialSufficient) {
      segments = removePrematureConclusions(segments, true);
      console.log(`   ?  Initial at ${Math.round((initialWords / targetWords) * 100)}% - applied cleanup`);
    } else {
      console.log(`   ?  Initial at ${Math.round((initialWords / targetWords) * 100)}% - keeping all for continuations`);
    }

    let currentWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);

    console.log(`📝 Parsed ${segments.length} dialogue segments (${currentWords} words)`);

    // For longer durations, continue generating until we reach target word count
    // Increased continuation limits to ensure we reach target: 30min needs 4-6, 1hr needs 12-15, 3hr needs 25-30
    const maxContinuations = options.duration === '3hr' ? 30 : options.duration === '1hr' ? 15 : options.duration === '30min' ? 6 : 3;
    let continuationCount = 0;
    let consecutiveShortResponses = 0; // Track short responses for retry logic

    // Build and maintain conversation history for true multi-turn context
    // This gives Nemotron the full context of all previously generated parts
    const conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // Add initial script as the first assistant response in history
    if (segments.length > 0) {
      const initialScriptText = segments.map(s => {
        const speaker = s.speaker === 'solo' ? 'SOLO' : s.speaker === 'host1' ? 'HOST1' : 'HOST2';
        return `${speaker}: ${s.text}`;
      }).join('\n\n');

      conversationHistory.push({
        role: 'assistant',
        content: `[PART 1 - Initial Script]\n${initialScriptText}`
      });
      console.log(`📜 Added Part 1 to conversation history (${segments.length} segments, ${currentWords} words)`);
    }

    // Lowered threshold to 90% to account for Nemotron's variable output
    while (currentWords < targetWords * 0.90 && continuationCount < maxContinuations) {
      continuationCount++;
      const wordsNeeded = targetWords - currentWords;
      const percentComplete = Math.round((currentWords / targetWords) * 100);
      const isApproachingEnd = percentComplete >= 85;
      console.log(`⚠️  Script at ${percentComplete}% (${currentWords}/${targetWords} words). Generating continuation ${continuationCount}/${maxContinuations}...`);

      // Get recent context for the continuation prompt (last 8 segments for immediate context)
      const lastSegments = segments.slice(-8);
      const contextText = lastSegments.map(s => {
        const speaker = s.speaker === 'solo' ? 'SOLO' : s.speaker === 'host1' ? 'HOST1' : 'HOST2';
        return `${speaker}: ${s.text}`;
      }).join('\n\n');

      // Extract the last sentence/thought for seamless continuation
      const lastSegment = segments[segments.length - 1];
      const lastSentence = lastSegment?.text.split(/(?<=[.!?])\s+/).pop() || '';

      // Identify topics already covered to encourage new content
      const coveredTopics = extractTopicsFromSegments(segments.slice(-15));
      const topicsNote = coveredTopics.length > 0
        ? `\n**Topics already discussed (explore NEW angles or move to related topics):** ${coveredTopics.join(', ')}`
        : '';

      // Build continuation prompt with reference to previous parts
      const partsGeneratedNote = conversationHistory.length > 0
        ? `\n\n**IMPORTANT:** You have already generated ${conversationHistory.length} part(s) of this script. The FULL CONTEXT of all previous parts is provided in the conversation history above. Use this to maintain coherence and avoid repeating content.`
        : '';

      const continuationPrompt = options.format === 'solo'
        ? `Continue this ${options.duration} podcast script SEAMLESSLY from where PART ${continuationCount} left off. You are generating PART ${continuationCount + 1}.

You are at ${percentComplete}% completion and need to add approximately ${wordsNeeded} more words to reach the ${targetWords} word target.
${partsGeneratedNote}

**IMMEDIATE CONTEXT (last part of PART ${continuationCount}):**
${contextText}

**The speaker's last thought was:** "${lastSentence}"
${topicsNote}

**CRITICAL FLOW INSTRUCTIONS:**
1. Your FIRST sentence must flow naturally from the last thought above - as if mid-conversation
2. Do NOT start with greetings, introductions, or "Let's talk about..."
3. Do NOT repeat content from previous parts - use the conversation history to stay coherent
4. Continue the exact train of thought, then naturally transition to new points
5. Each paragraph should be 100-150 words with detailed explanations and examples
6. Generate at least ${Math.ceil(wordsNeeded / 120)} paragraphs (${wordsNeeded} words needed)
${isApproachingEnd ? '\n7. You are approaching the end - start bringing key insights together but do NOT conclude yet' : '\n7. You are in the MIDDLE - keep exploring new angles and deeper content'}

Use the EXACT format:
SOLO: [content that flows directly from the previous segment]`
        : `Continue this ${options.duration} podcast conversation SEAMLESSLY from where PART ${continuationCount} left off. You are generating PART ${continuationCount + 1}.

You are at ${percentComplete}% completion and need to add approximately ${wordsNeeded} more words to reach the ${targetWords} word target.
${partsGeneratedNote}

**IMMEDIATE CONTEXT (last part of PART ${continuationCount}):**
${contextText}

**The last speaker's thought was:** "${lastSentence}"
${topicsNote}

**CRITICAL FLOW INSTRUCTIONS:**
1. Your FIRST line must respond directly to or build upon the last statement above
2. Do NOT restart the conversation or re-introduce topics
3. Do NOT repeat content from previous parts - use the conversation history to stay coherent
4. ${host1Name} and ${host2Name} should pick up exactly where they left off
5. Natural reactions like "That's a great point..." or "Building on that..." help flow
6. Each speaker turn should be 50-80 words with depth
7. Generate at least ${Math.ceil(wordsNeeded / 65)} exchanges (${wordsNeeded} words needed)
${isApproachingEnd ? '\n8. You are approaching the end - start synthesizing key insights but do NOT conclude yet' : '\n8. You are in the MIDDLE - introduce new perspectives and go deeper'}

Use the EXACT format:
HOST1: [response that connects to the previous exchange]
HOST2: [builds on HOST1's point with analysis]`;

      try {
        // Use more aggressive prompting if previous continuations were short
        const urgencyNote = consecutiveShortResponses > 0
          ? `\n\nURGENT: Previous responses were too short. You MUST generate at least 800 words in this response. Be verbose and detailed.`
          : '';

        // Tiered model strategy for continuations: OpenAI (reliable) → Lingshi
        type ContinuationModelConfig = { client: OpenAI; model: string; name: string };
        const continuationModelsToTry: ContinuationModelConfig[] = [
          { client: chatProvider, model: 'gpt-5.4-mini', name: 'GPT 5.4 Mini' },
          { client: chatProvider, model: 'gpt-5.4-low', name: 'GPT 5.4 Low' },
        ];
        const maxRetries = 3; // Increased retries
        const baseRetryDelayMs = 4000;
        const baseRateLimitDelayMs = 20000; // significantly increased for 429s

        let continuation = null;
        let successfulModel = '';

        const continuationSystemPrompt = `You are continuing a ${options.duration} podcast script at ${percentComplete}% completion. This is PART ${continuationCount + 1} of a multi-part generation process.

CRITICAL CONTEXT AWARENESS:
- You have access to the FULL conversation history showing all previous parts generated
- Each previous assistant message contains a complete part of the script (labeled [PART X])
- Use this history to understand what has been covered and avoid repetition
- Your response will be added as the next part in the sequence

CRITICAL RULES:
1. You MUST continue seamlessly from the exact point where the script left off
2. Your first sentence should feel like part of the same conversation - no restart
3. Generate AT LEAST 800-1200 words in this continuation - be detailed and thorough
4. Maintain the same tone, pacing, and depth as the previous segments
5. Reference and build upon points already made for coherence
6. Do NOT repeat topics or examples from previous parts - introduce NEW content
7. Include specific examples, anecdotes, and in-depth explanations
8. DO NOT end abruptly - keep the conversation flowing naturally

${isApproachingEnd ? 'You are approaching completion (85%+) - begin weaving themes together while still adding substantial content.' : 'You are in the MIDDLE of the podcast - keep introducing fresh perspectives and deeper analysis.'}

NEVER use conclusion phrases like "thank you for listening", "that's all for today", "in conclusion", "to wrap up", "finally", "before we go" etc. The conversation should feel ongoing.${urgencyNote}`;

        // Try each model with retry logic for continuations
        for (const { client, model, name } of continuationModelsToTry) {
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`   🔄 Continuation: ${name} attempt ${attempt}/${maxRetries}`);
              console.log(`      📜 Using conversation history with ${conversationHistory.length} previous parts`);

              // Build messages array with full conversation history
              const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
                { role: 'system', content: continuationSystemPrompt },
                // Include all previous parts as assistant messages for full context
                ...conversationHistory,
                // Current continuation request
                { role: 'user', content: continuationPrompt },
              ];

              const response = await client.chat.completions.create({
                model: model,
                messages: messages,
                temperature: 0.9,
                max_tokens: 4096,
              });

              const content = response.choices[0]?.message?.content || '';
              console.log(`      📡 Response: ${content.length} chars`);

              if (content.length >= 50) {
                continuation = response;
                successfulModel = name;
                console.log(`   ✅ Success with ${name}`);
                break;
              } else {
                console.warn(`      ⚠️ Empty response`);
                if (attempt < maxRetries) {
                  const delay = baseRetryDelayMs * attempt;
                  console.log(`      ⏳ Waiting ${delay}ms before retry...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
              }
            } catch (modelErr: any) {
              const is429 = modelErr.message?.includes('429') || modelErr.status === 429;
              // Exponential backoff for rate limits: 20s, 40s, 60s
              const delay = is429 ? baseRateLimitDelayMs * attempt : baseRetryDelayMs * attempt;

              console.error(`      ❌ ${is429 ? 'Rate limited (429)' : 'Error'}:`, modelErr.message);

              if (is429) {
                console.warn(`      ⚠️  Hit rate limit. Cooling down for ${delay / 1000}s...`);
              }

              if (attempt < maxRetries) {
                console.log(`      ⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }

          if (continuation) break;
          // Delay before switching models
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // If all models failed, log and continue to next iteration
        if (!continuation || !continuation.choices[0]?.message?.content) {
          console.warn(`   ⚠️ All models failed to return content`);
          consecutiveShortResponses++;
          if (consecutiveShortResponses >= 3) {
            console.error(`   ❌ Multiple failures across all models, stopping continuation`);
            break;
          }
          continue;
        }

        const continuationText = continuation?.choices[0]?.message?.content || '';
        console.log(`   📝 Raw continuation length: ${continuationText.length} chars`);

        let continuationSegments = parseScript(continuationText);
        console.log(`   📝 Parsed ${continuationSegments.length} segments from continuation`);

        // If parsing fails, try a more lenient approach - split by newlines
        if (continuationSegments.length === 0 && continuationText.length > 100) {
          console.log('   ⚠️ Standard parsing failed, trying fallback parsing...');
          // Try to salvage content by wrapping raw text as a segment
          const lines = continuationText.split('\n').filter(l => l.trim().length > 20);
          if (lines.length > 0) {
            // Determine speaker based on last segment or default
            const lastSpeaker = segments.length > 0 ? segments[segments.length - 1].speaker : 'host1';
            const nextSpeaker = lastSpeaker === 'host1' ? 'host2' : lastSpeaker === 'host2' ? 'host1' : 'solo';

            for (const line of lines) {
              // Clean up the line
              const cleanLine = line.replace(/^(HOST\s*[12]|SOLO)\s*:\s*/i, '').trim();
              if (cleanLine.length > 20) {
                continuationSegments.push({
                  speaker: options.format === 'solo' ? 'solo' : (continuationSegments.length % 2 === 0 ? 'host1' : 'host2'),
                  text: cleanLine,
                });
              }
            }
            console.log(`   ✅ Fallback parsing recovered ${continuationSegments.length} segments`);
          }
        }

        // Only apply conclusion removal if we have plenty of content (not aggressive)
        // Don't remove conclusions if we're critically low on content
        const projectedWords = currentWords + continuationSegments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
        const isNearTarget = projectedWords >= targetWords * 0.90;
        if (isNearTarget) {
          continuationSegments = removePrematureConclusions(continuationSegments, false);
        }
        // Otherwise keep all content to maximize word count

        if (continuationSegments.length === 0) {
          console.warn('⚠️  No segments parsed from continuation even after fallback');
          consecutiveShortResponses++;
          if (consecutiveShortResponses >= 3) {
            console.warn('⚠️  Too many empty responses, stopping');
            break;
          }
          continue; // Try again instead of breaking immediately
        }

        // Ensure flow continuity - check if first segment connects well
        if (continuationSegments.length > 0) {
          const firstNewSegment = continuationSegments[0];
          const startsWithTransition = /^(and|but|so|now|this|that|however|moreover|additionally|building|continuing|as|speaking|exactly|right|yes|no|well|interesting|great|absolutely)/i.test(firstNewSegment.text.trim());
          if (!startsWithTransition) {
            console.log('   ℹ️  First segment may not flow perfectly - acceptable');
          }
        }

        segments = [...segments, ...continuationSegments];
        const previousWords = currentWords;
        currentWords = segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0);
        const wordsAdded = currentWords - previousWords;
        const avgWordsPerSegment = Math.round(wordsAdded / continuationSegments.length);

        // Add this continuation to conversation history for next iteration
        const continuationScriptText = continuationSegments.map(s => {
          const speaker = s.speaker === 'solo' ? 'SOLO' : s.speaker === 'host1' ? 'HOST1' : 'HOST2';
          return `${speaker}: ${s.text}`;
        }).join('\n\n');

        conversationHistory.push({
          role: 'assistant',
          content: `[PART ${continuationCount + 1}]\n${continuationScriptText}`
        });
        console.log(`📜 Added Part ${continuationCount + 1} to conversation history (${continuationSegments.length} segments, ${wordsAdded} words)`);

        console.log(`✅ Continuation ${continuationCount}: +${continuationSegments.length} segments, +${wordsAdded} words (avg ${avgWordsPerSegment} words/segment) | Total: ${currentWords}/${targetWords} (${Math.round((currentWords / targetWords) * 100)}%)`);

        // Track consecutive short responses for retry logic
        if (wordsAdded < 200) {
          consecutiveShortResponses++;
          console.warn(`⚠️  Short response (${wordsAdded} words) - consecutive short: ${consecutiveShortResponses}`);

          // Only stop after 3 consecutive short responses
          if (consecutiveShortResponses >= 3) {
            console.warn(`⚠️  3 consecutive short responses, stopping continuation loop`);
            break;
          }
        } else {
          consecutiveShortResponses = 0; // Reset on good response
        }

        // Only stop if we added nearly nothing (likely an error)
        if (wordsAdded < 30) {
          console.warn(`⚠️  Continuation added only ${wordsAdded} words (critical failure), stopping`);
          break;
        }
      } catch (err) {
        console.error(`⚠️  Failed to generate continuation ${continuationCount}:`, err);
        // Don't break immediately on error - try again unless we've had multiple failures
        consecutiveShortResponses++;
        if (consecutiveShortResponses >= 2) {
          console.error(`⚠️  Multiple failures, stopping continuation loop`);
          break;
        }
      }
    }

    console.log(`📝 Final script: ${segments.length} segments, ${currentWords} words`);

    return {
      segments,
      estimatedDuration: estimateDuration(segments),
    };
  } catch (error) {
    console.error('Error generating podcast script:', error);
    throw error;
  }
}

/**
 * Extract key topics/themes from recent segments to avoid repetition
 */
function extractTopicsFromSegments(segments: SpeechSegment[]): string[] {
  const allText = segments.map(s => s.text).join(' ').toLowerCase();

  // Common filler words to ignore
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us',
    'you', 'your', 'i', 'me', 'my', 'he', 'him', 'his', 'she', 'her', 'what', 'which',
    'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'not', 'only', 'same', 'so', 'than', 'too',
    'very', 'just', 'also', 'now', 'here', 'there', 'then', 'about', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further',
    'once', 'really', 'actually', 'basically', 'essentially', 'particularly', 'especially',
    'think', 'know', 'see', 'look', 'want', 'say', 'said', 'get', 'got', 'make', 'made',
    'going', 'come', 'came', 'take', 'took', 'give', 'gave', 'find', 'found', 'tell', 'told'
  ]);

  // Extract words that appear multiple times (likely topics)
  const words = allText.match(/\b[a-z]{4,}\b/g) || [];
  const wordCount: Record<string, number> = {};

  for (const word of words) {
    if (!stopWords.has(word)) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }

  // Return top topics mentioned 3+ times
  const topics = Object.entries(wordCount)
    .filter(([_, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return topics;
}

/**
 * Remove premature conclusion phrases from segments
 */
function removePrematureConclusions(segments: SpeechSegment[], isLastBatch: boolean): SpeechSegment[] {
  if (isLastBatch) {
    // Allow conclusions in the final batch
    return segments;
  }

  const conclusionPatterns = [
    /thank you (for|so much for) (listening|joining|tuning in|being here)/gi,
    /that('s| is| was) (all|it) for (today|this episode|now)/gi,
    /we hope you (enjoyed|learned|found)/gi,
    /see you (next time|in the next|soon)/gi,
    /before we (wrap up|go|end|conclude)/gi,
    /in conclusion/gi,
    /to (summarize|wrap up|conclude)/gi,
    /that (brings|wraps) us to the end/gi,
    /until next time/gi,
    /goodbye|bye for now/gi,
    /this has been/gi,
    /thanks for (joining|listening|tuning)/gi,
  ];

  return segments.map(segment => {
    let cleanedText = segment.text;

    for (const pattern of conclusionPatterns) {
      // Check if this segment contains a conclusion phrase
      if (pattern.test(cleanedText)) {
        // Remove the sentence containing the conclusion
        cleanedText = cleanedText
          .split(/(?<=[.!?])\s+/)
          .filter(sentence => !pattern.test(sentence))
          .join(' ');

        // Reset the pattern's lastIndex for global patterns
        pattern.lastIndex = 0;
      }
    }

    return {
      ...segment,
      text: cleanedText.trim(),
    };
  }).filter(segment => segment.text.length > 0);
}

/**
 * Parse script text into segments
 */
function parseScript(scriptText: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  const lines = scriptText.split('\n');

  for (const line of lines) {
    // Match HOST1:, HOST 1:, or SOLO:
    const host1Match = line.match(/^HOST\s*1\s*:\s*(.+)$/i);
    const host2Match = line.match(/^HOST\s*2\s*:\s*(.+)$/i);
    const soloMatch = line.match(/^SOLO\s*:\s*(.+)$/i);

    if (soloMatch && soloMatch[1].trim()) {
      segments.push({
        speaker: 'solo',
        text: soloMatch[1].trim(),
      });
    } else if (host1Match && host1Match[1].trim()) {
      segments.push({
        speaker: 'host1',
        text: host1Match[1].trim(),
      });
    } else if (host2Match && host2Match[1].trim()) {
      segments.push({
        speaker: 'host2',
        text: host2Match[1].trim(),
      });
    }
  }

  return segments;
}

/**
 * Estimate duration in seconds based on word count
 * Average speaking rate: 150 words per minute
 */
function estimateDuration(segments: SpeechSegment[]): number {
  const totalWords = segments.reduce((sum, seg) => {
    return sum + seg.text.split(/\s+/).length;
  }, 0);

  const minutes = totalWords / 150;
  const seconds = Math.round(minutes * 60);

  console.log(`⏱️  Estimated duration: ${Math.floor(seconds / 60)}m ${seconds % 60}s`);

  return seconds;
}

/**
 * Generate audio for a single segment using OpenAI TTS
 */
async function generateSegmentAudio(segment: SpeechSegment): Promise<ArrayBuffer> {
  if (!openai) {
    throw new Error('TTS provider is not configured on the server.');
  }

  const voice = VOICE_MAP[segment.speaker];

  // Speed variation for different speakers
  const speedMap = {
    host1: 1.05,
    host2: 0.95,
    solo: 1.0,
  };

  try {
    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice,
      input: segment.text,
      speed: speedMap[segment.speaker],
    });

    return await response.arrayBuffer();
  } catch (err: any) {
    console.error(`❌ TTS error for ${segment.speaker}:`, err);
    throw new Error(`OpenAI TTS failed: ${err.message || err.status}`);
  }
}

/**
 * Generate complete audio overview with OpenAI TTS
 */
export async function generateAudioOverview(
  notebookId: string,
  title: string,
  options: AudioOverviewOptions,
  onProgress?: (status: string) => void
): Promise<string> {
  throw new Error('Audio overview generation must run through the worker audio job.');

  try {
    console.log('\n🎬 Starting audio overview generation...');
    console.log(`   Notebook: ${notebookId}`);
    console.log(`   Format: ${options.format}`);
    console.log(`   Duration: ${options.duration}`);

    // Step 1: Generate script
    onProgress?.('Generating podcast script with AI...');
    const script = await generatePodcastScript(notebookId, options);

    // Step 2: Generate audio segments with OpenAI TTS
    onProgress?.('Creating multi-speaker audio with OpenAI TTS...');
    console.log(`🎙️ Generating ${script.segments.length} audio segments...`);

    const audioBuffers: ArrayBuffer[] = [];
    for (let i = 0; i < script.segments.length; i++) {
      const segment = script.segments[i];
      console.log(`[${i + 1}/${script.segments.length}] ${segment.speaker}: ${segment.text.substring(0, 50)}...`);

      const audioBuffer = await generateSegmentAudio(segment);
      audioBuffers.push(audioBuffer);

      onProgress?.(`Generating audio (${i + 1}/${script.segments.length})...`);

      // Small delay to avoid rate limits
      if (i < script.segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Step 3: Combine audio buffers
    onProgress?.('Combining audio segments...');
    console.log(`🔗 Combining ${audioBuffers.length} audio segments...`);

    // Concatenate all audio buffers
    const totalLength = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buffer of audioBuffers) {
      combined.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    console.log(`✅ Final audio size: ${(combined.byteLength / 1024 / 1024).toFixed(2)} MB`);

    // Step 4: Upload to Supabase Storage
    onProgress?.('Uploading to storage...');
    const fileName = `${notebookId}/${Date.now()}-podcast.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, combined.buffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Step 5: Get public URL
    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName);

    console.log(`✅ Audio uploaded: ${urlData.publicUrl}`);

    // Step 6: Save metadata to database
    const host1Name = options.speakerNames?.host1 || 'Alex';
    const host2Name = options.speakerNames?.host2 || 'Jordan';
    const soloName = options.speakerNames?.solo || 'Alex';

    const fullScript = script.segments
      .map(s => {
        if (s.speaker === 'solo') return `${soloName}: ${s.text}`;
        return `${s.speaker === 'host1' ? host1Name : host2Name}: ${s.text}`;
      })
      .join('\n\n');

    const voicesMetadata = options.format === 'solo'
      ? { solo: `${soloName} (Alloy)` }
      : {
        host1: `${host1Name} (Onyx)`,
        host2: `${host2Name} (Nova)`,
      };

    const { error: insertError } = await supabase
      .from('generated_assets')
      .insert({
        notebook_id: notebookId,
        type: 'podcast',
        title,
        media_url: urlData.publicUrl,
        transcript: fullScript,
        duration_seconds: script.estimatedDuration,
        metadata: {
          format: options.format,
          duration: options.duration,
          voices: voicesMetadata,
          speakerNames: options.speakerNames,
        },
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw insertError;
    }

    onProgress?.('Complete!');
    console.log('\n🎉 Audio overview generation complete!\n');

    return urlData.publicUrl;
  } catch (error) {
    console.error('❌ Error generating audio overview:', error);
    throw error;
  }
}
