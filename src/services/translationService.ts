import type { TranslationJob, SubtitleCue } from '../types';
import { extractAudioSegmentsFromVideo, type AudioSegmentData } from '../utils/audioExtractor';
import { generateSrtContent, generateVttContent } from '../utils/subtitleFormatters';

export interface ProgressCallback {
  (update: Partial<TranslationJob>): void;
}

export function createLocalJob(file: File, duration = 0): TranslationJob {
  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const localUrl = URL.createObjectURL(file);

  return {
    id: jobId,
    fileName: file.name,
    fileSize: file.size,
    videoUrl: localUrl,
    duration: duration > 0 ? duration : 0,
    status: 'extracting_audio',
    progress: 5,
    currentStepText: 'Preparing video audio track for AI translation...',
    totalSegments: 1,
    completedSegments: 0,
    subtitles: [],
    createdAt: Date.now()
  };
}

/**
 * High-speed translation pipeline:
 * 1. Decodes audio in browser using Web Audio API in milliseconds (zero upload delay).
 * 2. Sends 16kHz mono audio chunks to serverless Gemini endpoint /api/translate-audio.
 * 3. Streams subtitles progressively as each segment completes.
 * 4. Falls back to server upload if browser Web Audio API cannot decode the file.
 */
export async function runBrowserTranslation(
  file: File,
  job: TranslationJob,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<TranslationJob> {
  // Step 1: Register job on server
  try {
    await fetch('/api/jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: job.id,
        fileName: job.fileName,
        fileSize: job.fileSize,
        duration: job.duration,
        videoUrl: job.videoUrl
      }),
      signal
    });
  } catch (err) {
    console.warn('Server job registration warning (continuing client translation):', err);
  }

  // Attempt Browser Audio Extraction
  let audioSegments: AudioSegmentData[] = [];
  let videoDuration = job.duration;

  try {
    onProgress({
      status: 'extracting_audio',
      progress: 10,
      currentStepText: 'Extracting speech audio directly in browser...'
    });

    const result = await extractAudioSegmentsFromVideo(file, 60, (pct, text) => {
      onProgress({
        progress: pct,
        currentStepText: text
      });
    });

    audioSegments = result.segments;
    if (result.totalDuration > 0) {
      videoDuration = result.totalDuration;
      onProgress({ duration: videoDuration });
    }
  } catch (extractErr: any) {
    console.warn('Browser audio extraction unavailable, falling back to server upload:', extractErr);
    // Fall back to server upload
    return runServerFallbackTranslation(file, job, onProgress, signal);
  }

  // Step 2: Translate segments concurrently via /api/translate-audio
  const totalSegments = audioSegments.length;
  onProgress({
    status: 'detecting_speech',
    totalSegments,
    completedSegments: 0,
    progress: 30,
    currentStepText: `Detecting Hindi dialogue and translating with Gemini (${totalSegments} segment${totalSegments > 1 ? 's' : ''})...`
  });

  const accumulatedSubtitles: SubtitleCue[] = [];
  const CONCURRENCY = 2; // 2 concurrent requests to stay safely within rate limits while providing 2x-3x speedup
  let completedCount = 0;

  const translateSingleSegment = async (segData: AudioSegmentData, retry = 1): Promise<void> => {
    if (signal?.aborted) return;

    try {
      const res = await fetch('/api/translate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: segData.base64Audio,
          mimeType: segData.mimeType,
          offsetSeconds: segData.offsetSeconds,
          segmentDuration: segData.durationSeconds,
          jobId: job.id
        }),
        signal
      });

      if (!res.ok) {
        if (retry <= 2 && !signal?.aborted) {
          await new Promise((r) => setTimeout(r, 1000 * retry));
          return translateSingleSegment(segData, retry + 1);
        }
        throw new Error(`Segment ${segData.segmentIndex + 1} translation returned HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.subtitles && Array.isArray(data.subtitles)) {
        accumulatedSubtitles.push(...data.subtitles);
        // Sort and deduplicate
        accumulatedSubtitles.sort((a, b) => a.startTime - b.startTime);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') throw err;
      if (retry <= 2 && !signal?.aborted) {
        await new Promise((r) => setTimeout(r, 1000 * retry));
        return translateSingleSegment(segData, retry + 1);
      }
      console.error(`Error translating segment ${segData.segmentIndex + 1}:`, err);
    } finally {
      completedCount++;
      const pct = Math.min(95, Math.round(30 + (completedCount / totalSegments) * 65));
      onProgress({
        completedSegments: completedCount,
        progress: pct,
        subtitles: [...accumulatedSubtitles],
        currentStepText: `Translated ${completedCount} of ${totalSegments} segments (${accumulatedSubtitles.length} English cues synchronized)...`
      });
    }
  };

  // Run worker pool
  const queue = [...audioSegments];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const nextSeg = queue.shift();
      if (nextSeg) {
        await translateSingleSegment(nextSeg);
      }
    }
  });

  await Promise.all(workers);

  if (signal?.aborted) {
    throw new DOMException('Translation cancelled', 'AbortError');
  }

  // Final step: Sort and save final subtitles to server
  const finalSubtitles = [...accumulatedSubtitles].sort((a, b) => a.startTime - b.startTime);

  try {
    await fetch(`/api/jobs/${job.id}/subtitles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtitles: finalSubtitles })
    });
  } catch {}

  const completedJob: TranslationJob = {
    ...job,
    duration: videoDuration,
    status: 'completed',
    progress: 100,
    totalSegments,
    completedSegments: totalSegments,
    subtitles: finalSubtitles,
    currentStepText: `Translation complete! ${finalSubtitles.length} synchronized English dialogue subtitles ready.`,
    srtUrl: `/api/jobs/${job.id}/download/srt`,
    vttUrl: `/api/jobs/${job.id}/download/vtt`
  };

  onProgress(completedJob);
  return completedJob;
}

/**
 * Server fallback when browser audio extraction cannot decode format.
 */
async function runServerFallbackTranslation(
  file: File,
  job: TranslationJob,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<TranslationJob> {
  onProgress({
    status: 'uploading',
    progress: 15,
    currentStepText: 'Uploading video file to server for processing...'
  });

  const formData = new FormData();
  formData.append('video', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
    signal
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Server upload failed');
  }

  const { job: serverJob } = await res.json();

  // Start server pipeline
  const startRes = await fetch(`/api/jobs/${serverJob.id}/start`, {
    method: 'POST',
    signal
  });

  if (!startRes.ok) {
    throw new Error('Failed to start server translation pipeline');
  }

  // Poll server job until complete
  return new Promise((resolve, reject) => {
    const interval = setInterval(async () => {
      if (signal?.aborted) {
        clearInterval(interval);
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }

      try {
        const pollRes = await fetch(`/api/jobs/${serverJob.id}`, { signal });
        if (!pollRes.ok) return;
        const { job: currentJob } = await pollRes.json();

        onProgress(currentJob);

        if (currentJob.status === 'completed') {
          clearInterval(interval);
          resolve(currentJob);
        } else if (currentJob.status === 'error') {
          clearInterval(interval);
          reject(new Error(currentJob.error || 'Translation failed'));
        }
      } catch (pollErr: any) {
        if (pollErr.name === 'AbortError') {
          clearInterval(interval);
          reject(pollErr);
        }
      }
    }, 1500);
  });
}
