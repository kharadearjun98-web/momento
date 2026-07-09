import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AudioSegmentInput {
  key: string;
  buffer: Buffer;
}

export interface MixedAudioOutput {
  buffer: Buffer;
  duration: number;
}

function ffmpegBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, { encoding: 'buffer', maxBuffer: 1024 * 1024 * 500 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg failed: ${stderr?.toString() || error.message}`));
        return;
      }
      resolve(stdout as Buffer);
    });
  });
}

export async function probeDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ]);

  const parsed = JSON.parse(stdout.toString());
  const duration = Number(parsed?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe could not determine duration for ${filePath}`);
  }
  return duration;
}

export async function createSilenceMp3(durationSeconds: number): Promise<Buffer> {
  return ffmpegBuffer([
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=44100:cl=mono',
    '-t',
    String(durationSeconds),
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    '-f',
    'mp3',
    'pipe:1',
  ]);
}

export async function mixMp3Segments(segments: AudioSegmentInput[], silenceGapMs = 200): Promise<MixedAudioOutput> {
  if (segments.length === 0) {
    throw new Error('No audio segments to mix.');
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'memento-audio-'));
  try {
    const concatLines: string[] = [];
    let totalDuration = 0;
    const silencePath = path.join(dir, 'silence.mp3');

    if (silenceGapMs > 0 && segments.length > 1) {
      const silence = await createSilenceMp3(silenceGapMs / 1000);
      await writeFile(silencePath, silence);
    }

    for (let index = 0; index < segments.length; index++) {
      const segmentPath = path.join(dir, `${String(index).padStart(5, '0')}-${segments[index].key}.mp3`);
      await writeFile(segmentPath, segments[index].buffer);
      totalDuration += await probeDuration(segmentPath);
      concatLines.push(`file '${segmentPath.replace(/'/g, "'\\''")}'`);

      if (index < segments.length - 1 && silenceGapMs > 0) {
        totalDuration += silenceGapMs / 1000;
        concatLines.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
      }
    }

    const concatPath = path.join(dir, 'concat.txt');
    const outputPath = path.join(dir, 'mixed.mp3');
    await writeFile(concatPath, concatLines.join('\n'));

    await execFileAsync('ffmpeg', [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-af',
      'loudnorm',
      '-c:a',
      'libmp3lame',
      '-q:a',
      '4',
      '-f',
      'mp3',
      outputPath,
    ]);

    const buffer = await readFile(outputPath);
    const duration = await probeDuration(outputPath).catch(() => totalDuration);
    return { buffer, duration };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
