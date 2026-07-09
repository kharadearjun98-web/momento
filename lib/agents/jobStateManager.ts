export interface JobCheckpoint {
  jobId: string;
  notebookId: string;
  options: any;
  phase: 'script' | 'validation' | 'tts' | 'assembly' | 'completed';
  script?: any;
  validatedSegments?: any[];
  processedSegments?: any[];
  progress: {
    script: number;
    tts: number;
    upload: number;
    currentSegment: number;
    totalSegments: number;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Job State Manager
 * Manages job state persistence in localStorage for resume capability
 */
export class JobStateManager {
  private jobId: string;
  private storageKey: string;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.storageKey = `audio_job_${jobId}`;
  }

  /**
   * Save checkpoint data
   */
  saveCheckpoint(checkpoint: Partial<JobCheckpoint>): void {
    try {
      const existing = this.loadCheckpoint();
      const updated: JobCheckpoint = {
        ...existing,
        ...checkpoint,
        jobId: this.jobId,
        updatedAt: Date.now(),
      } as JobCheckpoint;

      localStorage.setItem(this.storageKey, JSON.stringify(updated));
      console.log(`💾 Checkpoint saved: ${updated.phase} (${updated.progress.tts}% TTS complete)`);
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
    }
  }

  /**
   * Load checkpoint data
   */
  loadCheckpoint(): JobCheckpoint | null {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return null;

      const checkpoint = JSON.parse(data) as JobCheckpoint;
      console.log(`📂 Checkpoint loaded: ${checkpoint.phase} phase`);
      return checkpoint;
    } catch (error) {
      console.error('Failed to load checkpoint:', error);
      return null;
    }
  }

  /**
   * Check if there's an existing checkpoint
   */
  hasCheckpoint(): boolean {
    return localStorage.getItem(this.storageKey) !== null;
  }

  /**
   * Clear checkpoint data
   */
  clearCheckpoint(): void {
    localStorage.removeItem(this.storageKey);
    console.log(`🗑️  Checkpoint cleared for job ${this.jobId}`);
  }

  /**
   * Update progress
   */
  updateProgress(progress: Partial<JobCheckpoint['progress']>): void {
    const checkpoint = this.loadCheckpoint();
    if (checkpoint) {
      this.saveCheckpoint({
        progress: {
          ...checkpoint.progress,
          ...progress,
        },
      });
    }
  }

  /**
   * Update phase
   */
  updatePhase(phase: JobCheckpoint['phase']): void {
    this.saveCheckpoint({ phase });
  }

  /**
   * Get all job IDs from localStorage
   */
  static getAllJobIds(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('audio_job_')) {
        keys.push(key.replace('audio_job_', ''));
      }
    }
    return keys;
  }

  /**
   * Clean up old jobs (older than 24 hours)
   */
  static cleanupOldJobs(): void {
    const jobIds = JobStateManager.getAllJobIds();
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    jobIds.forEach(jobId => {
      const manager = new JobStateManager(jobId);
      const checkpoint = manager.loadCheckpoint();
      
      if (checkpoint && now - checkpoint.updatedAt > maxAge) {
        manager.clearCheckpoint();
        console.log(`🧹 Cleaned up old job: ${jobId}`);
      }
    });
  }
}
