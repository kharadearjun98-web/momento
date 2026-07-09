import { SpeechSegment } from '../audioGenerator';

const MAX_TTS_CHARS = 4000; // Safe limit below OpenAI's 4096 char limit

export interface ValidatedSegment extends SpeechSegment {
  originalIndex: number;
  splitIndex: number; // 0 for unsplit segments, 1+ for split parts
  charCount: number;
}

/**
 * Segment Validator Agent
 * Validates and splits dialogue segments that exceed TTS character limits
 * while preserving speaker context and natural sentence boundaries
 */
export class SegmentValidatorAgent {
  /**
   * Validate and split segments if they exceed character limits
   */
  validateAndSplit(segments: SpeechSegment[]): ValidatedSegment[] {
    const validatedSegments: ValidatedSegment[] = [];

    segments.forEach((segment, index) => {
      const charCount = segment.text.length;

      if (charCount <= MAX_TTS_CHARS) {
        // Segment is within limits
        validatedSegments.push({
          ...segment,
          originalIndex: index,
          splitIndex: 0,
          charCount,
        });
      } else {
        // Segment exceeds limit - split it
        console.log(`⚠️  Segment ${index} (${segment.speaker}) exceeds ${MAX_TTS_CHARS} chars (${charCount}), splitting...`);
        const splitSegments = this.splitSegment(segment, index);
        validatedSegments.push(...splitSegments);
      }
    });

    console.log(`✅ Validation complete: ${segments.length} original → ${validatedSegments.length} validated segments`);
    return validatedSegments;
  }

  /**
   * Split a long segment at sentence boundaries
   */
  private splitSegment(segment: SpeechSegment, originalIndex: number): ValidatedSegment[] {
    const text = segment.text;
    const sentences = this.splitIntoSentences(text);
    const parts: ValidatedSegment[] = [];
    
    let currentPart = '';
    let splitIndex = 1;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const testPart = currentPart + (currentPart ? ' ' : '') + sentence;

      if (testPart.length > MAX_TTS_CHARS && currentPart.length > 0) {
        // Current part would exceed limit, save it and start new part
        parts.push({
          ...segment,
          text: currentPart.trim(),
          originalIndex,
          splitIndex,
          charCount: currentPart.length,
        });
        
        currentPart = sentence;
        splitIndex++;
      } else {
        currentPart = testPart;
      }
    }

    // Add remaining part
    if (currentPart.trim().length > 0) {
      parts.push({
        ...segment,
        text: currentPart.trim(),
        originalIndex,
        splitIndex,
        charCount: currentPart.length,
      });
    }

    console.log(`   Split into ${parts.length} parts (${parts.map(p => p.charCount).join(', ')} chars)`);
    return parts;
  }

  /**
   * Split text into sentences at natural boundaries
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence endings but preserve the punctuation
    const sentenceEndings = /([.!?]+[\s]*)/g;
    const parts = text.split(sentenceEndings);
    
    const sentences: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const content = parts[i];
      const punctuation = parts[i + 1] || '';
      if (content.trim()) {
        sentences.push((content + punctuation).trim());
      }
    }

    // If no sentences detected (no punctuation), split by character limit
    if (sentences.length === 0) {
      return this.splitByCharLimit(text);
    }

    return sentences;
  }

  /**
   * Fallback: split text by character limit at word boundaries
   */
  private splitByCharLimit(text: string): string[] {
    const parts: string[] = [];
    const words = text.split(/\s+/);
    let currentPart = '';

    for (const word of words) {
      const testPart = currentPart + (currentPart ? ' ' : '') + word;
      
      if (testPart.length > MAX_TTS_CHARS && currentPart.length > 0) {
        parts.push(currentPart);
        currentPart = word;
      } else {
        currentPart = testPart;
      }
    }

    if (currentPart.trim()) {
      parts.push(currentPart);
    }

    return parts;
  }

  /**
   * Get statistics about validation results
   */
  getStats(validatedSegments: ValidatedSegment[]) {
    const originalCount = new Set(validatedSegments.map(s => s.originalIndex)).size;
    const splitCount = validatedSegments.filter(s => s.splitIndex > 0).length;
    const maxChars = Math.max(...validatedSegments.map(s => s.charCount));
    const avgChars = Math.round(
      validatedSegments.reduce((sum, s) => sum + s.charCount, 0) / validatedSegments.length
    );

    return {
      originalSegments: originalCount,
      validatedSegments: validatedSegments.length,
      splitSegments: splitCount,
      maxCharCount: maxChars,
      avgCharCount: avgChars,
    };
  }
}
