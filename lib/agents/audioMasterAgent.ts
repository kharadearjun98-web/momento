import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabase/client';
import { AudioOverviewOptions, generatePodcastScript } from '../audioGenerator';
import { SegmentValidatorAgent } from './segmentValidator';
import { TTSWorkerPoolAgent } from './ttsWorkerPool';
import { AudioMixerAgent } from './audioMixer';

export interface MasterAgentProgress {
  phase: 'script' | 'validation' | 'tts' | 'assembly' | 'upload' | 'completed';
  script: number; // 0-100
  tts: number; // 0-100
  upload: number; // 0-100
  currentSegment: number;
  totalSegments: number;
  message: string;
}

export interface MasterAgentOptions {
  onProgress?: (progress: MasterAgentProgress) => void;
  concurrency?: number; // TTS worker concurrency
  enableCheckpoints?: boolean; // Deprecated: browser localStorage checkpoints are disabled
  abortSignal?: AbortSignal; // Signal to cancel generation
}

/**
 * Audio Generation Master Agent
 * Orchestrates the browser audio generation pipeline.
 * Durable audio generation now belongs in the worker queue.
 */
export class AudioGenerationMasterAgent {
  private jobId: string;
  private onProgress?: (progress: MasterAgentProgress) => void;
  private concurrency: number;
  private enableCheckpoints: boolean;
  private abortController: AbortController;
  private _isCancelled: boolean = false;

  // Agent instances
  private validatorAgent: SegmentValidatorAgent;
  private ttsPoolAgent: TTSWorkerPoolAgent;
  private mixerAgent: AudioMixerAgent;

  constructor(options: MasterAgentOptions = {}) {
    this.jobId = uuidv4();
    this.onProgress = options.onProgress;
    this.concurrency = options.concurrency || 4;
    this.enableCheckpoints = false;
    this.abortController = new AbortController();

    // If an external abort signal is provided, link it to our controller
    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', () => this.cancel());
    }

    // Initialize sub-agents
    this.validatorAgent = new SegmentValidatorAgent();
    this.ttsPoolAgent = new TTSWorkerPoolAgent({
      concurrency: this.concurrency,
      onProgress: (current, total) => {
        const ttsProgress = Math.round((current / total) * 100);
        this.reportProgress({
          phase: 'tts',
          script: 100,
          tts: ttsProgress,
          upload: 0,
          currentSegment: current,
          totalSegments: total,
          message: `Processing audio: ${current}/${total} segments`,
        });
      },
    });
    this.mixerAgent = new AudioMixerAgent({
      silenceGapMs: 200,
    });

    console.log(`🎯 Master Agent initialized (Job ID: ${this.jobId})`);
  }

  /**
   * Generate audio overview with full pipeline
   */
  async generate(
    notebookId: string,
    options: AudioOverviewOptions
  ): Promise<{ url: string; duration: number }> {
    throw new Error('Audio generation must be submitted as a worker audio job through create-job.');

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 AUDIO GENERATION MASTER AGENT`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Job ID: ${this.jobId}`);
    console.log(`Notebook: ${notebookId}`);
    console.log(`Format: ${options.format} | Duration: ${options.duration}`);
    console.log(`Concurrency: ${this.concurrency} workers`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      return await this.startFreshGeneration(notebookId, options);
    } catch (error) {
      console.error(`\n❌ GENERATION FAILED:`, error);
      throw error;
    }
  }

  /**
   * Start fresh generation from scratch
   */
  private async startFreshGeneration(
    notebookId: string,
    options: AudioOverviewOptions
  ): Promise<{ url: string; duration: number }> {
    // Phase 1: Generate Script
    this.checkCancelled(); // Check for cancellation before starting
    console.log(`\n📝 PHASE 1: Script Generation`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'script',
      script: 10,
      tts: 0,
      upload: 0,
      currentSegment: 0,
      totalSegments: 0,
      message: 'Generating podcast script...',
    });

    const audioScript = await generatePodcastScript(notebookId, options);
    this.checkCancelled(); // Check for cancellation after script generation
    console.log(`✅ Script generated: ${audioScript.segments.length} segments`);

    this.reportProgress({
      phase: 'script',
      script: 100,
      tts: 0,
      upload: 0,
      currentSegment: 0,
      totalSegments: audioScript.segments.length,
      message: 'Script complete',
    });

    // Phase 2: Validate and Split Segments
    this.checkCancelled();
    console.log(`\n✅ PHASE 2: Segment Validation`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'validation',
      script: 100,
      tts: 0,
      upload: 0,
      currentSegment: 0,
      totalSegments: audioScript.segments.length,
      message: 'Validating segments...',
    });

    const validatedSegments = this.validatorAgent.validateAndSplit(audioScript.segments);
    const stats = this.validatorAgent.getStats(validatedSegments);
    console.log(`✅ Validation complete:`, stats);

    // Phase 3: Process TTS in Parallel
    this.checkCancelled();
    console.log(`\n🎙️  PHASE 3: Text-to-Speech Processing`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'tts',
      script: 100,
      tts: 0,
      upload: 0,
      currentSegment: 0,
      totalSegments: validatedSegments.length,
      message: 'Starting TTS workers...',
    });

    const processedSegments = await this.ttsPoolAgent.processSegments(validatedSegments);
    console.log(`✅ TTS processing complete: ${processedSegments.length} segments`);

    // Phase 4: Mix Audio
    this.checkCancelled();
    console.log(`\n🎛️  PHASE 4: Audio Assembly`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'assembly',
      script: 100,
      tts: 100,
      upload: 0,
      currentSegment: validatedSegments.length,
      totalSegments: validatedSegments.length,
      message: 'Mixing audio segments...',
    });

    const mixedAudio = await this.mixerAgent.mixSegments(processedSegments);
    const mixStats = this.mixerAgent.getStats(mixedAudio);
    console.log(`✅ Audio mixed:`, mixStats);

    // Phase 5: Upload to Storage
    this.checkCancelled();
    console.log(`\n☁️  PHASE 5: Upload`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'upload',
      script: 100,
      tts: 100,
      upload: 0,
      currentSegment: validatedSegments.length,
      totalSegments: validatedSegments.length,
      message: 'Uploading to storage...',
    });

    const audioUrl = await this.uploadAudio(notebookId, mixedAudio.audioBuffer);

    this.reportProgress({
      phase: 'upload',
      script: 100,
      tts: 100,
      upload: 100,
      currentSegment: validatedSegments.length,
      totalSegments: validatedSegments.length,
      message: 'Upload complete',
    });

    console.log(`✅ Uploaded to: ${audioUrl}`);

    // Complete
    this.reportProgress({
      phase: 'completed',
      script: 100,
      tts: 100,
      upload: 100,
      currentSegment: validatedSegments.length,
      totalSegments: validatedSegments.length,
      message: 'Generation complete!',
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ GENERATION COMPLETE`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      url: audioUrl,
      duration: mixedAudio.totalDuration,
    };
  }

  /**
   * Upload audio to Supabase storage
   */
  private async uploadAudio(notebookId: string, audioBuffer: Uint8Array): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${notebookId}/audio-${this.jobId}-${Date.now()}.mp3`;

    // Create a Blob from the Uint8Array
    const blob = new Blob([audioBuffer as any], { type: 'audio/mpeg' });

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, blob, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName);

    return publicUrl;
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: MasterAgentProgress): void {
    this.onProgress?.(progress);

  }

  /**
   * Get job ID
   */
  getJobId(): string {
    return this.jobId;
  }

  /**
   * Cancel the generation process
   */
  cancel(): void {
    console.log(`🛑 Cancelling audio generation (Job ID: ${this.jobId})`);
    this._isCancelled = true;
    this.abortController.abort();
  }

  /**
   * Check if generation was cancelled
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Get abort signal for passing to async operations
   */
  get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Throw if cancelled - call this at checkpoints in the pipeline
   */
  private checkCancelled(): void {
    if (this._isCancelled) {
      throw new Error('Audio generation was cancelled by user');
    }
  }
}
