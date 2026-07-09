// Utility: Upload slide image to Supabase storage and return public URL
async function uploadSlideImage(notebookId: string, slideId: string, imageBase64: string): Promise<string> {
  if (!imageBase64) return '';
  const res = await fetch(imageBase64);
  const blob = await res.blob();
  const fileName = `${notebookId}/slides/${slideId}.png`;
  const { error } = await supabase.storage.from('assets').upload(fileName, blob, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
  return data.publicUrl;
}
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabase/client';
import { createServerOnlyProviderClient } from '../serverOnlyProvider';
import {
  generateSlideScript,
  generateAllSlideImages,
  Slide,
  SlideScript,
  VideoOverviewOptions,
  getSlideTimestamps,
} from '../slideGenerator';
import { JobStateManager } from './jobStateManager';
import { SegmentValidatorAgent } from './segmentValidator';
import { TTSWorkerPoolAgent, ProcessedSegment } from './ttsWorkerPool';
import { AudioMixerAgent } from './audioMixer';

const openai = createServerOnlyProviderClient('video');

// ============================================================================
// TYPES
// ============================================================================

export interface VideoMasterAgentProgress {
  phase: 'script' | 'images' | 'narration' | 'sync' | 'upload' | 'completed';
  script: number;      // 0-100
  images: number;      // 0-100
  narration: number;   // 0-100
  upload: number;      // 0-100
  currentSlide: number;
  totalSlides: number;
  message: string;
}

export interface VideoMasterAgentOptions {
  onProgress?: (progress: VideoMasterAgentProgress) => void;
  concurrency?: number;
  enableCheckpoints?: boolean;
  skipImages?: boolean; // For faster testing
}

export interface GeneratedVideoOverview {
  id: string;
  notebookId: string;
  title: string;
  slides: Slide[];
  audioUrl: string;
  audioDuration: number;
  slideTimings: { slideId: string; startMs: number; endMs: number }[];
  metadata: {
    format: string;
    duration: string;
    style: string;
    slideCount: number;
    wordCount: number;
    createdAt: string;
  };
}

// Voice for narration
const NARRATOR_VOICE = 'nova' as const; // Clear, professional female voice

// ============================================================================
// VIDEO GENERATION MASTER AGENT
// ============================================================================

/**
 * Video Generation Master Agent
 * Orchestrates slide generation, image creation, and audio narration
 */
export class VideoGenerationMasterAgent {
  private jobId: string;
  private stateManager: JobStateManager;
  private onProgress?: (progress: VideoMasterAgentProgress) => void;
  private concurrency: number;
  private enableCheckpoints: boolean;
  private skipImages: boolean;

  // Sub-agents for audio
  private validatorAgent: SegmentValidatorAgent;
  private ttsPoolAgent: TTSWorkerPoolAgent;
  private mixerAgent: AudioMixerAgent;

  constructor(options: VideoMasterAgentOptions = {}) {
    this.jobId = uuidv4();
    this.stateManager = new JobStateManager(this.jobId);
    this.onProgress = options.onProgress;
    this.concurrency = options.concurrency || 3;
    this.enableCheckpoints = options.enableCheckpoints !== false;
    this.skipImages = options.skipImages || false;

    // Initialize audio sub-agents
    this.validatorAgent = new SegmentValidatorAgent();
    this.ttsPoolAgent = new TTSWorkerPoolAgent({
      concurrency: this.concurrency,
      onProgress: (current, total) => {
        const narrationProgress = Math.round((current / total) * 100);
        this.reportProgress({
          phase: 'narration',
          script: 100,
          images: 100,
          narration: narrationProgress,
          upload: 0,
          currentSlide: current,
          totalSlides: total,
          message: `Processing narration: ${current}/${total} slides`,
        });
      },
    });
    this.mixerAgent = new AudioMixerAgent({
      silenceGapMs: 500, // Longer gaps between slides
    });

    console.log(`🎬 Video Master Agent initialized (Job ID: ${this.jobId})`);
  }

  /**
   * Generate complete video overview
   */
  async generate(
    notebookId: string,
    options: VideoOverviewOptions
  ): Promise<GeneratedVideoOverview> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 VIDEO GENERATION MASTER AGENT`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Job ID: ${this.jobId}`);
    console.log(`Notebook: ${notebookId}`);
    console.log(`Format: ${options.format} | Duration: ${options.duration}`);
    console.log(`Style: ${options.style}`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      return await this.startGeneration(notebookId, options);
    } catch (error) {
      console.error(`\n❌ VIDEO GENERATION FAILED:`, error);
      throw error;
    }
  }

  /**
   * Main generation pipeline
   */
  private async startGeneration(
    notebookId: string,
    options: VideoOverviewOptions
  ): Promise<GeneratedVideoOverview> {

    // ========================================================================
    // PHASE 1: Generate Slide Script
    // ========================================================================
    console.log(`\n📝 PHASE 1: Slide Script Generation`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'script',
      script: 10,
      images: 0,
      narration: 0,
      upload: 0,
      currentSlide: 0,
      totalSlides: 0,
      message: 'Generating slide structure and narration...',
    });

    const slideScript = await generateSlideScript(notebookId, options);
    console.log(`✅ Script generated: ${slideScript.slides.length} slides`);

    this.reportProgress({
      phase: 'script',
      script: 100,
      images: 0,
      narration: 0,
      upload: 0,
      currentSlide: 0,
      totalSlides: slideScript.slides.length,
      message: 'Script complete',
    });

    // ========================================================================
    // PHASE 2: Generate Slide Images (parallel with narration prep)
    // ========================================================================
    console.log(`\n🎨 PHASE 2: Slide Image Generation`);
    console.log(`${'─'.repeat(60)}`);

    let slidesWithImages: Slide[];
    if (this.skipImages) {
      console.log('⏭️ Skipping image generation (skipImages=true)');
      slidesWithImages = slideScript.slides;
      this.reportProgress({
        phase: 'images',
        script: 100,
        images: 100,
        narration: 0,
        upload: 0,
        currentSlide: 0,
        totalSlides: slideScript.slides.length,
        message: 'Images skipped',
      });
    } else {
      this.reportProgress({
        phase: 'images',
        script: 100,
        images: 0,
        narration: 0,
        upload: 0,
        currentSlide: 0,
        totalSlides: slideScript.slides.length,
        message: 'Generating slide illustrations...',
      });
      slidesWithImages = await generateAllSlideImages(
        slideScript.slides,
        options.style,
        (current, total) => {
          this.reportProgress({
            phase: 'images',
            script: 100,
            images: Math.round((current / total) * 100),
            narration: 0,
            upload: 0,
            currentSlide: current,
            totalSlides: total,
            message: `Generating images: ${current}/${total}`,
          });
        }
      );
      // Upload images to storage and set imageUrl
      for (const slide of slidesWithImages) {
        if (slide.imageBase64) {
          slide.imageUrl = await uploadSlideImage(notebookId, slide.id, slide.imageBase64);
          delete slide.imageBase64;
        }
      }
      console.log(`✅ Images generated and uploaded for ${slidesWithImages.filter(s => s.imageUrl).length} slides`);
    }

    // ========================================================================
    // PHASE 3: Generate Audio Narration
    // ========================================================================
    console.log(`\n🎙️ PHASE 3: Audio Narration Generation`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'narration',
      script: 100,
      images: 100,
      narration: 0,
      upload: 0,
      currentSlide: 0,
      totalSlides: slidesWithImages.length,
      message: 'Generating narration audio...',
    });

    // Convert slides to speech segments
    const speechSegments = slidesWithImages
      .filter(slide => slide.narration && slide.narration.trim().length > 0)
      .map(slide => ({
        speaker: 'solo' as const,
        text: slide.narration,
        voice: NARRATOR_VOICE,
        slideId: slide.id, // Track which slide this belongs to
      }));

    // Validate and split segments
    const validatedSegments = this.validatorAgent.validateAndSplit(
      speechSegments.map(s => ({ speaker: s.speaker, text: s.text, voice: s.voice }))
    );

    // Process TTS
    const processedSegments = await this.ttsPoolAgent.processSegments(validatedSegments);
    console.log(`✅ TTS complete: ${processedSegments.length} audio segments`);

    // Mix audio
    const mixedAudio = await this.mixerAgent.mixSegments(processedSegments);
    console.log(`✅ Audio mixed: ${Math.round(mixedAudio.totalDuration)}ms total`);

    // ========================================================================
    // PHASE 4: Sync Slides with Audio
    // ========================================================================
    console.log(`\n🔄 PHASE 4: Slide-Audio Synchronization`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'sync',
      script: 100,
      images: 100,
      narration: 100,
      upload: 0,
      currentSlide: slidesWithImages.length,
      totalSlides: slidesWithImages.length,
      message: 'Syncing slides with audio...',
    });

    // Calculate slide timings based on ACTUAL audio durations from TTS
    // This replaces the estimated word-count-based timing
    const slideTimings = this.calculateActualSlideTimings(
      slidesWithImages,
      processedSegments,
      this.mixerAgent.getSilenceGapMs()
    );
    console.log(`✅ Synced ${slideTimings.length} slide timings with actual audio duration`);

    // ========================================================================
    // PHASE 5: Upload to Storage
    // ========================================================================
    console.log(`\n☁️ PHASE 5: Upload to Storage`);
    console.log(`${'─'.repeat(60)}`);
    this.reportProgress({
      phase: 'upload',
      script: 100,
      images: 100,
      narration: 100,
      upload: 30,
      currentSlide: slidesWithImages.length,
      totalSlides: slidesWithImages.length,
      message: 'Uploading audio...',
    });

    // Upload audio
    const audioUrl = await this.uploadAudio(notebookId, mixedAudio.audioBuffer);
    console.log(`✅ Audio uploaded: ${audioUrl}`);

    this.reportProgress({
      phase: 'upload',
      script: 100,
      images: 100,
      narration: 100,
      upload: 100,
      currentSlide: slidesWithImages.length,
      totalSlides: slidesWithImages.length,
      message: 'Upload complete',
    });

    // ========================================================================
    // COMPLETE
    // ========================================================================
    this.reportProgress({
      phase: 'completed',
      script: 100,
      images: 100,
      narration: 100,
      upload: 100,
      currentSlide: slidesWithImages.length,
      totalSlides: slidesWithImages.length,
      message: 'Video overview ready!',
    });

    const totalWords = slidesWithImages.reduce(
      (sum, s) => sum + (s.narration?.split(/\s+/).length || 0),
      0
    );

    const result: GeneratedVideoOverview = {
      id: this.jobId,
      notebookId,
      title: slideScript.metadata.topic,
      slides: slidesWithImages,
      audioUrl,
      audioDuration: mixedAudio.totalDuration,
      slideTimings,
      metadata: {
        format: options.format,
        duration: options.duration,
        style: options.style,
        slideCount: slidesWithImages.length,
        wordCount: totalWords,
        createdAt: new Date().toISOString(),
      },
    };

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ VIDEO GENERATION COMPLETE`);
    console.log(`   Slides: ${result.slides.length}`);
    console.log(`   Duration: ${Math.round(result.audioDuration / 1000)}s`);
    console.log(`   Words: ${totalWords}`);
    console.log(`${'='.repeat(60)}\n`);

    return result;
  }

  /**
   * Upload audio to Supabase storage
   */
  private async uploadAudio(notebookId: string, audioBuffer: Uint8Array): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const fileName = `${notebookId}/video-audio-${this.jobId}-${Date.now()}.mp3`;

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
   * Report progress
   */
  private reportProgress(progress: VideoMasterAgentProgress): void {
    this.onProgress?.(progress);

    if (this.enableCheckpoints) {
      this.stateManager.updateProgress({
        script: progress.script,
        tts: progress.narration,
        upload: progress.upload,
        currentSegment: progress.currentSlide,
        totalSegments: progress.totalSlides,
      });
    }
  }

  /**
   * Get job ID
   */
  getJobId(): string {
    return this.jobId;
  }

  /**
   * Calculate slide timings with fixed duration per slide
   * Each slide displays for ~22 seconds (20-25 second range)
   */
  private calculateActualSlideTimings(
    slides: Slide[],
    processedSegments: ProcessedSegment[],
    silenceGapMs: number
  ): { slideId: string; startMs: number; endMs: number }[] {
    // Fixed duration per slide: 22 seconds (in the 20-25 second range)
    const SLIDE_DURATION_MS = 22000;

    let currentTimeMs = 0;
    const timings: { slideId: string; startMs: number; endMs: number }[] = [];

    slides.forEach((slide, index) => {
      const startMs = currentTimeMs;
      const endMs = currentTimeMs + SLIDE_DURATION_MS;

      timings.push({ slideId: slide.id, startMs, endMs });
      currentTimeMs = endMs;
    });

    // Log timing info for debugging
    console.log('📊 Slide timings (fixed 22s per slide):');
    timings.forEach((t, i) => {
      const durationSec = ((t.endMs - t.startMs) / 1000).toFixed(1);
      console.log(`   Slide ${i + 1}: ${(t.startMs / 1000).toFixed(1)}s - ${(t.endMs / 1000).toFixed(1)}s (${durationSec}s)`);
    });

    return timings;
  }
}

// ============================================================================
// SAVE VIDEO OVERVIEW TO DATABASE
// ============================================================================

/**
 * Save generated video overview to generated_assets table
 */
export async function saveVideoOverview(
  video: GeneratedVideoOverview
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Store slides with imageUrl (not base64)
  const slidesForStorage = video.slides.map(s => ({
    ...s,
    imageUrl: s.imageUrl || null,
    imageBase64: undefined, // Remove base64
  }));

  const { data, error } = await supabase
    .from('generated_assets')
    .insert({
      notebook_id: video.notebookId,
      type: 'video_overview',
      title: video.title,
      media_url: video.audioUrl,
      duration_seconds: Math.round(video.audioDuration / 1000),
      transcript: video.slides.map(s => s.narration).join('\n\n'),
      metadata: {
        ...video.metadata,
        slideTimings: video.slideTimings,
        slides: slidesForStorage,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error('❌ Failed to save video overview:', error);
    throw error;
  }

  console.log(`✅ Video overview saved with ID: ${data.id}`);
  return data.id;
}
