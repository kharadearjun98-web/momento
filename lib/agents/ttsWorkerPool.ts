import { createServerOnlyProviderClient } from '../serverOnlyProvider';
import { ValidatedSegment } from './segmentValidator';

// Lazy initialization to prevent errors when API key is not set
let _openai: any = null;
function getOpenAI(): any {
  if (!_openai) {
    _openai = createServerOnlyProviderClient('tts');
  }
  return _openai;
}

// Voice mapping for different speakers
const VOICE_MAP = {
  host1: 'onyx' as const,
  host2: 'nova' as const,
  solo: 'alloy' as const,
};

// Speaking rates for natural variety
const SPEED_MAP = {
  host1: 1.05,
  host2: 0.95,
  solo: 1.0,
};

export interface ProcessedSegment {
  segment: ValidatedSegment;
  audioBuffer: ArrayBuffer;
  duration: number;
  processedAt: number;
}

export interface TTSWorkerPoolOptions {
  concurrency?: number; // Number of parallel workers (default: 4)
  delayBetweenRequests?: number; // Delay in ms (default: 100)
  maxRetries?: number; // Max retries per segment (default: 3)
  onProgress?: (current: number, total: number) => void;
}

/**
 * TTS Worker Pool Agent
 * Processes multiple TTS segments in parallel with retry logic and rate limiting
 */
export class TTSWorkerPoolAgent {
  private concurrency: number;
  private delayBetweenRequests: number;
  private maxRetries: number;
  private onProgress?: (current: number, total: number) => void;

  private activeWorkers = 0;
  private processedCount = 0;
  private failedSegments: ValidatedSegment[] = [];

  constructor(options: TTSWorkerPoolOptions = {}) {
    this.concurrency = options.concurrency || 4;
    this.delayBetweenRequests = options.delayBetweenRequests || 100;
    this.maxRetries = options.maxRetries || 3;
    this.onProgress = options.onProgress;
  }

  /**
   * Process all segments in parallel with controlled concurrency
   */
  async processSegments(segments: ValidatedSegment[]): Promise<ProcessedSegment[]> {
    console.log(`🚀 Starting TTS Worker Pool with ${this.concurrency} workers`);
    console.log(`📊 Processing ${segments.length} segments`);

    this.processedCount = 0;
    this.failedSegments = [];

    const results = new Map<number, ProcessedSegment>();
    const queue = [...segments];
    const promises: Promise<void>[] = [];

    // Start worker pool
    for (let i = 0; i < this.concurrency; i++) {
      promises.push(this.worker(queue, results, segments.length));
    }

    // Wait for all workers to complete
    await Promise.all(promises);

    // Check for failures
    if (this.failedSegments.length > 0) {
      console.error(`❌ Failed to process ${this.failedSegments.length} segments`);
      throw new Error(`Failed to process ${this.failedSegments.length} segments after retries`);
    }

    console.log(`✅ Successfully processed all ${segments.length} segments`);
    return Array.from(results.entries())
      .sort(([a], [b]) => a - b)
      .map(([, segment]) => segment);
  }

  /**
   * Worker that processes segments from the queue
   */
  private async worker(
    queue: ValidatedSegment[],
    results: Map<number, ProcessedSegment>,
    totalSegments: number
  ): Promise<void> {
    while (queue.length > 0) {
      const segment = queue.shift();
      if (!segment) break;

      this.activeWorkers++;

      try {
        const processed = await this.processSegmentWithRetry(segment);

        const index = segment.originalIndex * 1000 + segment.splitIndex;
        results.set(index, processed);

        this.processedCount++;
        this.onProgress?.(this.processedCount, totalSegments);

        // Add delay to respect rate limits
        if (queue.length > 0) {
          await this.delay(this.delayBetweenRequests);
        }
      } catch (error) {
        console.error(`❌ Failed to process segment after retries:`, error);
        this.failedSegments.push(segment);
      } finally {
        this.activeWorkers--;
      }
    }
  }

  /**
   * Process a single segment with retry logic
   */
  private async processSegmentWithRetry(
    segment: ValidatedSegment,
    attempt: number = 1
  ): Promise<ProcessedSegment> {
    try {
      const audioBuffer = await this.generateSegmentAudio(segment);

      const audioDuration = await this.calculateAudioDuration(audioBuffer);

      return {
        segment,
        audioBuffer,
        duration: audioDuration,
        processedAt: Date.now(),
      };
    } catch (error: any) {
      // Check for rate limit error
      const isRateLimit = error?.status === 429 || error?.message?.includes('rate limit');

      if (attempt < this.maxRetries) {
        const backoffDelay = this.calculateBackoff(attempt, isRateLimit);
        console.warn(
          `⚠️  Retry ${attempt}/${this.maxRetries} for segment ${segment.originalIndex}.${segment.splitIndex} ` +
          `(waiting ${backoffDelay}ms)`
        );

        await this.delay(backoffDelay);
        return this.processSegmentWithRetry(segment, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Generate audio for a single segment using OpenAI TTS
   * Handles long text by splitting into chunks under 4096 characters
   */
  private async generateSegmentAudio(segment: ValidatedSegment): Promise<ArrayBuffer> {
    const voice = VOICE_MAP[segment.speaker];
    const speed = SPEED_MAP[segment.speaker];
    const MAX_CHARS = 4000; // Leave some buffer below 4096

    // If text is short enough, process directly
    if (segment.text.length <= MAX_CHARS) {
      const response = await getOpenAI().audio.speech.create({
        model: 'tts-1',
        voice,
        input: segment.text,
        speed,
      });
      return response.arrayBuffer();
    }

    // Split long text into chunks at sentence boundaries
    console.log(`   📝 Splitting long text (${segment.text.length} chars) into chunks...`);
    const chunks = this.splitTextIntoChunks(segment.text, MAX_CHARS);
    console.log(`   📦 Created ${chunks.length} chunks for TTS`);

    throw new Error('Split TTS segments must be processed by the worker with FFmpeg mixing.');

    // Generate audio for each chunk
    const audioBuffers: ArrayBuffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`   🔊 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

      const response = await getOpenAI().audio.speech.create({
        model: 'tts-1',
        voice,
        input: chunk,
        speed,
      });

      audioBuffers.push(await response.arrayBuffer());

      // Small delay between chunks to avoid rate limits
      if (i < chunks.length - 1) {
        await this.delay(100);
      }
    }

    // Concatenate all audio buffers
    return this.concatenateAudioBuffers(audioBuffers);
  }

  /**
   * Split text into chunks at sentence boundaries, respecting max length
   */
  private splitTextIntoChunks(text: string, maxLength: number): string[] {
    const chunks: string[] = [];

    // Split by sentences (periods, question marks, exclamation marks followed by space or end)
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];

    let currentChunk = '';
    for (const sentence of sentences) {
      // If adding this sentence would exceed limit, save current chunk and start new one
      if (currentChunk.length + sentence.length > maxLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If a single sentence is too long, split it further at commas or force-split
      if (sentence.length > maxLength) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // Try splitting at commas
        const parts = sentence.split(/,\s*/);
        for (const part of parts) {
          if (part.length > maxLength) {
            // Force-split at maxLength
            for (let i = 0; i < part.length; i += maxLength) {
              chunks.push(part.substring(i, Math.min(i + maxLength, part.length)).trim());
            }
          } else if (currentChunk.length + part.length + 2 > maxLength) {
            chunks.push(currentChunk.trim());
            currentChunk = part;
          } else {
            currentChunk += (currentChunk ? ', ' : '') + part;
          }
        }
      } else {
        currentChunk += sentence;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(c => c.length > 0);
  }

  /**
   * Concatenate multiple audio buffers into one
   */
  private concatenateAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const buffer of buffers) {
      result.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return result.buffer;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number, isRateLimit: boolean): number {
    // More aggressive backoff for rate limits
    const baseDelay = isRateLimit ? 2000 : 500;
    const exponential = Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 + 0.85; // 0.85 to 1.15

    return Math.min(baseDelay * exponential * jitter, 30000); // Max 30 seconds
  }

  /**
   * Calculate audio duration from MP3 buffer size
   * OpenAI TTS-1 model outputs MP3 at variable bitrate
   * Average observed bitrate is around 96-128 kbps for speech
   */
  private async calculateAudioDuration(audioBuffer: ArrayBuffer): Promise<number> {
    if (typeof Audio === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
      throw new Error('Audio duration probing requires a media runtime. Worker audio jobs should use ffprobe.');
    }

    const blobUrl = URL.createObjectURL(new Blob([audioBuffer], { type: 'audio/mpeg' }));
    try {
      const audio = new Audio();
      audio.preload = 'metadata';

      return await new Promise<number>((resolve, reject) => {
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            resolve(audio.duration);
          } else {
            reject(new Error('Could not determine audio segment duration.'));
          }
        };
        audio.onerror = () => reject(new Error('Could not load audio segment metadata.'));
        audio.src = blobUrl;
      });
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics about processing
   */
  getStats() {
    return {
      processed: this.processedCount,
      failed: this.failedSegments.length,
      activeWorkers: this.activeWorkers,
    };
  }
}
