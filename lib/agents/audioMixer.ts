import { ProcessedSegment } from './ttsWorkerPool';

export interface MixedAudioResult {
  audioBuffer: Uint8Array;
  totalDuration: number;
  segmentCount: number;
}

export interface AudioMixerOptions {
  silenceGapMs?: number;
  normalizeVolume?: boolean;
}

/**
 * Browser-side MP3 byte concatenation was removed because it produced malformed
 * MP3 output. Audio jobs must be mixed by the worker with FFmpeg.
 */
export class AudioMixerAgent {
  constructor(_options: AudioMixerOptions = {}) {}

  async mixSegments(_processedSegments: ProcessedSegment[]): Promise<MixedAudioResult> {
    throw new Error('Audio mixing must run in the worker with FFmpeg.');
  }

  getStats(result: MixedAudioResult) {
    return {
      totalSegments: result.segmentCount,
      totalDuration: Math.round(result.totalDuration),
      bufferSizeMB: (result.audioBuffer.length / 1024 / 1024).toFixed(2),
      avgSegmentDuration: Math.round(result.totalDuration / result.segmentCount),
    };
  }

  getSilenceGapMs(): number {
    return 0;
  }
}
