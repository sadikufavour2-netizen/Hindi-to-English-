import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import type { SubtitleCue, TranslationJob, JobStatus } from './src/types';

dotenv.config();

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');
const PROCESSED_DIR = path.resolve(__dirname, 'processed');
const CHUNKS_DIR = path.resolve(__dirname, 'uploads/chunks');
const SAMPLES_DIR = path.resolve(__dirname, 'samples');

for (const dir of [UPLOADS_DIR, PROCESSED_DIR, CHUNKS_DIR, SAMPLES_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    cb(null, `${cleanBase}_${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2048 * 1024 * 1024 }, // 2GB
  fileFilter: (_req, file, cb) => {
    // Accept all standard video extensions and video mime types
    const ext = path.extname(file.originalname).toLowerCase();
    const validExts = ['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi', '.wmv', '.flv', '.3gp', '.ts', '.mpeg', '.mpg'];
    if (validExts.includes(ext) || file.mimetype.startsWith('video/') || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(null, true); // Fallback: let FFmpeg handle format detection
    }
  }
});

// Chunk upload multer with 35MB limit per chunk
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({ storage: chunkStorage, limits: { fileSize: 35 * 1024 * 1024 } });

// In-Memory Jobs Store
const jobs = new Map<string, TranslationJob>();

// Gemini API initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Please configure it in Settings > Secrets.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Utilities for time formatting
export function formatSrtTime(seconds: number): string {
  const pad = (num: number, size = 2) => String(Math.floor(num)).padStart(size, '0');
  const hrs = pad(seconds / 3600);
  const mins = pad((seconds % 3600) / 60);
  const secs = pad(seconds % 60);
  const millis = pad(Math.round((seconds % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs},${millis}`;
}

export function formatVttTime(seconds: number): string {
  const pad = (num: number, size = 2) => String(Math.floor(num)).padStart(size, '0');
  const hrs = pad(seconds / 3600);
  const mins = pad((seconds % 3600) / 60);
  const secs = pad(seconds % 60);
  const millis = pad(Math.round((seconds % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs}.${millis}`;
}

export function generateSrtContent(subtitles: SubtitleCue[]): string {
  return subtitles
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue, index) => {
      const speakerPrefix = cue.speaker ? `[${cue.speaker}]: ` : '';
      return `${index + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(cue.endTime)}\n${speakerPrefix}${cue.englishText}\n`;
    })
    .join('\n');
}

export function generateVttContent(subtitles: SubtitleCue[]): string {
  const cues = subtitles
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue, index) => {
      const speakerPrefix = cue.speaker ? `<v ${cue.speaker}>` : '';
      const speakerSuffix = cue.speaker ? '</v>' : '';
      return `${index + 1}\n${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}\n${speakerPrefix}${cue.englishText}${speakerSuffix}\n`;
    })
    .join('\n');
  return `WEBVTT - SUBLYAI Hindi to English Subtitles\n\n${cues}`;
}

// Extract duration with ffprobe
async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const dur = parseFloat(stdout.trim());
    return isNaN(dur) ? 0 : dur;
  } catch (err) {
    console.warn('ffprobe failed, falling back to 0 duration', err);
    return 0;
  }
}

// Extract audio using FFmpeg with multithreading and ultrafast speed
async function extractAudio(videoPath: string, outputAudioPath: string): Promise<void> {
  const cmd = `ffmpeg -y -threads 0 -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 48k "${outputAudioPath}"`;
  await execAsync(cmd);
}

// Divide audio into segments for long videos
async function segmentAudio(audioPath: string, jobDir: string, segmentSeconds = 60): Promise<string[]> {
  const segPattern = path.join(jobDir, 'seg_%03d.mp3');
  const cmd = `ffmpeg -y -i "${audioPath}" -f segment -segment_time ${segmentSeconds} -c copy "${segPattern}"`;
  await execAsync(cmd);

  const files = fs.readdirSync(jobDir)
    .filter(f => f.startsWith('seg_') && f.endsWith('.mp3'))
    .sort()
    .map(f => path.join(jobDir, f));

  return files;
}

// Background Translation Pipeline
async function runTranslationJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    const videoFilePath = path.join(UPLOADS_DIR, job.fileName);
    if (!fs.existsSync(videoFilePath)) {
      throw new Error(`Video file not found at ${videoFilePath}`);
    }

    // Step 1: Extract Audio
    job.status = 'extracting_audio';
    job.currentStepText = 'Extracting speech audio track with FFmpeg...';
    job.progress = 15;

    const jobWorkDir = path.join(PROCESSED_DIR, jobId);
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }

    const fullAudioPath = path.join(jobWorkDir, 'audio_full.mp3');
    await extractAudio(videoFilePath, fullAudioPath);

    // Get exact audio duration
    const realDuration = await getVideoDuration(fullAudioPath);
    if (realDuration > 0) {
      job.duration = realDuration;
    }

    // Step 2: Segment audio for long video handling
    // Segment size: 60 seconds each.
    const segmentDuration = 60;
    const segmentFiles = await segmentAudio(fullAudioPath, jobWorkDir, segmentDuration);
    job.totalSegments = segmentFiles.length || 1;
    job.completedSegments = 0;

    // Step 3: Detect Hindi speech & Translate
    job.status = 'detecting_speech';
    job.currentStepText = `Detecting Hindi dialogue and transcribing (${job.totalSegments} segment${job.totalSegments > 1 ? 's' : ''})...`;
    job.progress = 30;

    const ai = getGeminiClient();

    // Process segments concurrently with up to 3 parallel requests for 3x-5x speedup
    const accumulatedSubtitles: SubtitleCue[] = [];
    const CONCURRENCY_LIMIT = 3;
    let completedCount = 0;

    const translateSegment = async (index: number) => {
      const segFile = segmentFiles[index];
      const offsetSeconds = index * segmentDuration;

      try {
        const audioBuffer = fs.readFileSync(segFile);
        const base64Audio = audioBuffer.toString('base64');

        const prompt = `You are a world-class professional Hindi-to-English cinema & video translator and subtitler.
Your task is to transcribe Hindi or Hinglish spoken dialogue in this audio clip, and translate it into clear, natural, modern English subtitles.

CRITICAL TRANSLATION RULES:
1. Detect any Hindi, Urdu, or Hinglish speech in this audio clip.
2. Transcribe the Hindi dialogue accurately.
3. Translate into natural, high-quality, conversational English:
   - Preserve Indian cultural context, idioms, humor, and colloquial nuances (e.g., "Arre yaar", "Bhai", "Chalo", "Jugaad", "Kya baat hai").
   - Maintain the correct emotional tone, sarcasm, urgency, or affection.
   - Do NOT translate literally word-by-word if it sounds awkward in English. Provide natural cinematic English subtitles.
4. Distinguish different speakers if multiple people are talking (e.g. "Speaker 1", "Speaker 2", or character names if mentioned).
5. Accurate Timestamps:
   - Provide "startSeconds" and "endSeconds" relative to THIS segment (from 0.0 to ${segmentDuration}.0 seconds).
   - Sync the subtitle start and end precisely with when the speaker begins and stops speaking.
6. Ignore background music, sound effects, ambient noise, and silence. Do NOT invent dialogue.
7. If there is no speech in this audio segment, set hasSpeech to false and return an empty subtitles array.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              inlineData: {
                mimeType: 'audio/mp3',
                data: base64Audio,
              }
            },
            {
              text: prompt
            }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hasSpeech: { type: Type.BOOLEAN },
                detectedLanguage: { type: Type.STRING },
                subtitles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      startSeconds: { type: Type.NUMBER },
                      endSeconds: { type: Type.NUMBER },
                      hindiText: { type: Type.STRING },
                      englishText: { type: Type.STRING },
                      speaker: { type: Type.STRING }
                    },
                    required: ['startSeconds', 'endSeconds', 'hindiText', 'englishText']
                  }
                }
              },
              required: ['hasSpeech', 'subtitles']
            }
          }
        });

        const rawText = response.text || '{}';
        const parsed = JSON.parse(rawText);

        if (parsed.subtitles && Array.isArray(parsed.subtitles)) {
          for (const item of parsed.subtitles) {
            const rawStart = Number(item.startSeconds) || 0;
            const rawEnd = Number(item.endSeconds) || (rawStart + 2.5);

            const startSec = Math.max(0, offsetSeconds + rawStart);
            const endSec = Math.max(startSec + 0.5, offsetSeconds + rawEnd);

            if (item.englishText && item.englishText.trim()) {
              accumulatedSubtitles.push({
                id: `cue_${jobId}_${index}_${Math.random().toString(36).substring(2, 7)}`,
                startTime: Number(startSec.toFixed(2)),
                endTime: Number(endSec.toFixed(2)),
                hindiText: (item.hindiText || '').trim(),
                englishText: (item.englishText || '').trim(),
                speaker: item.speaker || `Speaker`
              });
            }
          }
        }
      } catch (segErr) {
        console.error(`Error translating segment ${index + 1}:`, segErr);
      } finally {
        completedCount++;
        job.completedSegments = completedCount;
        job.subtitles = [...accumulatedSubtitles].sort((a, b) => a.startTime - b.startTime);
        job.progress = Math.round(30 + (completedCount / segmentFiles.length) * 60);
        job.currentStepText = `Translated ${completedCount} of ${segmentFiles.length} dialogue segments...`;
      }
    };

    // Execute with worker pool
    const queue = segmentFiles.map((_, idx) => idx);
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, queue.length) }, async () => {
      while (queue.length > 0) {
        const nextIdx = queue.shift();
        if (nextIdx !== undefined) {
          await translateSegment(nextIdx);
        }
      }
    });
    await Promise.all(workers);

    // Step 4: Synchronizing and Finalizing
    job.status = 'synchronizing';
    job.currentStepText = 'Synchronizing timestamps and formatting subtitle tracks...';
    job.progress = 95;

    // Generate SRT and VTT files on disk
    const srtContent = generateSrtContent(job.subtitles);
    const vttContent = generateVttContent(job.subtitles);

    const srtPath = path.join(jobWorkDir, 'subtitles.srt');
    const vttPath = path.join(jobWorkDir, 'subtitles.vtt');

    fs.writeFileSync(srtPath, srtContent, 'utf-8');
    fs.writeFileSync(vttPath, vttContent, 'utf-8');

    job.srtUrl = `/api/jobs/${jobId}/download/srt`;
    job.vttUrl = `/api/jobs/${jobId}/download/vtt`;
    job.status = 'completed';
    job.progress = 100;
    job.currentStepText = 'Translation and subtitle synchronization completed successfully!';

  } catch (err: any) {
    console.error('Translation job failed:', err);
    job.status = 'error';
    job.error = err.message || 'An error occurred during audio extraction or Gemini translation.';
    job.currentStepText = `Error: ${job.error}`;
  }
}

// Media file streaming with Range support for video player seeking
app.get('/media/:folder/:filename', (req, res) => {
  const { folder, filename } = req.params;
  const baseDir = folder === 'uploads' ? UPLOADS_DIR : folder === 'processed' ? PROCESSED_DIR : SAMPLES_DIR;
  const safeFilename = path.basename(filename);
  const filePath = path.join(baseDir, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.vtt': 'text/vtt',
    '.srt': 'text/plain'
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// API Routes

// 1. Direct file upload with error handling
app.post('/api/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => {
    if (err) {
      console.error('Direct upload multer error:', err);
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file was received. Please select a video.' });
      }

      const duration = await getVideoDuration(req.file.path);
      const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

      const job: TranslationJob = {
        id: jobId,
        fileName: req.file.filename,
        fileSize: req.file.size,
        videoUrl: `/media/uploads/${req.file.filename}`,
        duration: duration || 0,
        status: 'idle',
        progress: 0,
        currentStepText: 'Video uploaded. Ready for AI translation.',
        totalSegments: 1,
        completedSegments: 0,
        subtitles: [],
        createdAt: Date.now()
      };

      jobs.set(jobId, job);
      res.json({ success: true, job });
    } catch (routeErr: any) {
      console.error('Upload processing error:', routeErr);
      res.status(500).json({ error: routeErr.message || 'Error processing uploaded video' });
    }
  });
});

// 2. Chunked upload API for large videos (bypasses Cloud Run 32MB payload limit)
app.post('/api/upload/init', (req, res) => {
  const { fileName, totalSize } = req.body;
  const uploadId = 'chunk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const uploadDir = path.join(CHUNKS_DIR, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });

  res.json({ uploadId, fileName, totalSize });
});

app.post('/api/upload/chunk', (req, res) => {
  chunkUpload.single('chunk')(req, res, (err) => {
    if (err) {
      console.error('Chunk upload multer error:', err);
      return res.status(400).json({ error: err.message || 'Chunk upload failed' });
    }

    const { uploadId, chunkIndex } = req.body;
    if (!req.file || !uploadId || chunkIndex === undefined) {
      return res.status(400).json({ error: 'Missing chunk data or parameters' });
    }

    const uploadDir = path.join(CHUNKS_DIR, uploadId);
    if (!fs.existsSync(uploadDir)) {
      return res.status(404).json({ error: 'Upload session expired or invalid' });
    }

    const chunkPath = path.join(uploadDir, `chunk_${String(chunkIndex).padStart(5, '0')}`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    res.json({ success: true, chunkIndex: Number(chunkIndex) });
  });
});

app.post('/api/upload/complete', async (req, res) => {
  const { uploadId, fileName } = req.body;
  const uploadDir = path.join(CHUNKS_DIR, uploadId);

  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  const chunkFiles = fs.readdirSync(uploadDir)
    .filter(f => f.startsWith('chunk_'))
    .sort();

  const ext = path.extname(fileName) || '.mp4';
  const cleanBase = path.basename(fileName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetFileName = `${cleanBase}_${Date.now()}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, targetFileName);

  const writeStream = fs.createWriteStream(targetPath);
  for (const chunkFile of chunkFiles) {
    const chunkFilePath = path.join(uploadDir, chunkFile);
    const data = fs.readFileSync(chunkFilePath);
    writeStream.write(data);
  }
  writeStream.end();

  await new Promise<void>((resolve) => {
    writeStream.on('finish', () => resolve());
  });

  // Clean chunk directory
  fs.rmSync(uploadDir, { recursive: true, force: true });

  const duration = await getVideoDuration(targetPath);
  const stat = fs.statSync(targetPath);

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const job: TranslationJob = {
    id: jobId,
    fileName: targetFileName,
    fileSize: stat.size,
    videoUrl: `/media/uploads/${targetFileName}`,
    duration: duration || 0,
    status: 'idle',
    progress: 0,
    currentStepText: 'Video assembled. Ready for AI translation.',
    totalSegments: 1,
    completedSegments: 0,
    subtitles: [],
    createdAt: Date.now()
  };

  jobs.set(jobId, job);
  res.json({ success: true, job });
});

// 3. Start AI translation
app.post('/api/jobs/:id/start', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'idle' && job.status !== 'error') {
    return res.json({ message: 'Job already in progress or completed', job });
  }

  job.status = 'uploading';
  job.progress = 5;
  job.currentStepText = 'Starting translation pipeline...';
  job.error = undefined;

  // Run in background so user doesn't wait
  runTranslationJob(id).catch(err => {
    console.error('Job execution error:', err);
  });

  res.json({ success: true, job });
});

// 4. Poll job status & progressive subtitles
app.get('/api/jobs/:id', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job });
});

// 5. Update subtitles from Subtitle Editor
app.put('/api/jobs/:id/subtitles', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { subtitles } = req.body;
  if (!Array.isArray(subtitles)) {
    return res.status(400).json({ error: 'subtitles must be an array' });
  }

  job.subtitles = subtitles;

  // Update on-disk files if present
  const jobWorkDir = path.join(PROCESSED_DIR, id);
  if (fs.existsSync(jobWorkDir)) {
    const srtContent = generateSrtContent(job.subtitles);
    const vttContent = generateVttContent(job.subtitles);
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.srt'), srtContent, 'utf-8');
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.vtt'), vttContent, 'utf-8');
  }

  res.json({ success: true, subtitles: job.subtitles });
});

// 6. Download SRT
app.get('/api/jobs/:id/download/srt', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const srt = generateSrtContent(job.subtitles);
  const baseName = path.basename(job.fileName, path.extname(job.fileName));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_english_subtitles.srt"`);
  res.send(srt);
});

// 7. Download VTT
app.get('/api/jobs/:id/download/vtt', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const vtt = generateVttContent(job.subtitles);
  const baseName = path.basename(job.fileName, path.extname(job.fileName));

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_english_subtitles.vtt"`);
  res.send(vtt);
});

// 8. Burn subtitles permanently into video using FFmpeg (Option C)
app.post('/api/jobs/:id/burn', async (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.subtitles.length === 0) {
    return res.status(400).json({ error: 'No subtitles available to burn into video' });
  }

  try {
    const jobWorkDir = path.join(PROCESSED_DIR, id);
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }

    const srtPath = path.join(jobWorkDir, 'burn_temp.srt');
    fs.writeFileSync(srtPath, generateSrtContent(job.subtitles), 'utf-8');

    const inputVideoPath = path.join(UPLOADS_DIR, job.fileName);
    const outputVideoName = `subtitled_${job.fileName}`;
    const outputVideoPath = path.join(PROCESSED_DIR, outputVideoName);

    // Escape srt path for FFmpeg subtitles filter
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    
    // Render subtitles with high-contrast styling: bold, white text with black outline and soft shadow
    const cmd = `ffmpeg -y -threads 0 -i "${inputVideoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=35'" -c:v libx264 -preset ultrafast -crf 23 -c:a copy "${outputVideoPath}"`;

    await execAsync(cmd);

    job.burnedVideoUrl = `/media/processed/${outputVideoName}`;

    res.json({
      success: true,
      burnedVideoUrl: job.burnedVideoUrl,
      downloadUrl: `/api/jobs/${id}/download/video`
    });
  } catch (err: any) {
    console.error('Burn subtitles failed:', err);
    res.status(500).json({ error: 'Failed to burn subtitles into video: ' + (err.message || 'FFmpeg error') });
  }
});

// Direct download for burned video
app.get('/api/jobs/:id/download/video', (req, res) => {
  const { id } = req.params;
  const job = jobs.get(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const outputVideoName = `subtitled_${job.fileName}`;
  const outputVideoPath = path.join(PROCESSED_DIR, outputVideoName);

  if (!fs.existsSync(outputVideoPath)) {
    return res.status(404).send('Burned video not ready yet. Please trigger rendering first.');
  }

  const baseName = path.basename(job.fileName, path.extname(job.fileName));
  res.download(outputVideoPath, `${baseName}_EnglishSubtitled.mp4`);
});

// Built-in Hindi sample clips for immediate testing
const SAMPLE_VIDEOS = [
  {
    id: 'sample_bollywood_drama',
    title: 'The Mumbai Investigation (Crime Drama)',
    category: 'Hindi Web Series / Drama',
    duration: '00:32',
    description: 'Intense interrogation between Inspector Kabir and a key witness in a Mumbai precinct.',
    subtitles: [
      {
        id: 'sample_c1',
        startTime: 1.0,
        endTime: 4.2,
        speaker: 'Inspector Kabir',
        hindiText: 'सच बताओ, उस रात गोदाम पर तुम क्या कर रहे थे?',
        englishText: 'Tell me the truth, what were you doing at the warehouse that night?'
      },
      {
        id: 'sample_c2',
        startTime: 4.8,
        endTime: 8.5,
        speaker: 'Rajesh',
        hindiText: 'साहब, कसम से मैं वहां सिर्फ चाय पीने रुका था। मेरा इस सब से कोई लेना-देना नहीं!',
        englishText: 'Sir, I swear I only stopped there for some tea. I have nothing to do with any of this!'
      },
      {
        id: 'sample_c3',
        startTime: 9.1,
        endTime: 13.4,
        speaker: 'Inspector Kabir',
        hindiText: 'झूठ मत बोलो! सीसीटीवी फुटेज में तुम्हारे हाथ में वह बैग साफ दिख रहा है।',
        englishText: 'Don\'t lie to me! The CCTV footage clearly shows that bag in your hand.'
      },
      {
        id: 'sample_c4',
        startTime: 14.0,
        endTime: 18.2,
        speaker: 'Rajesh',
        hindiText: 'वो बैग... वो तो किसी अनजान आदमी ने मुझे स्टेशन तक पहुंचाने के लिए दिया था।',
        englishText: 'That bag... an unknown guy gave it to me just to drop off at the station.'
      },
      {
        id: 'sample_c5',
        startTime: 18.8,
        endTime: 23.5,
        speaker: 'Inspector Kabir',
        hindiText: 'अगर अब भी सच नहीं उगला, तो पूरी ज़िंदगी सलाखों के पीछे सड़ जाओगे।',
        englishText: 'If you don\'t spill the truth right now, you will rot behind bars for the rest of your life.'
      },
      {
        id: 'sample_c6',
        startTime: 24.2,
        endTime: 29.8,
        speaker: 'Rajesh',
        hindiText: 'ठीक है साहब, मैं सब बताता हूँ... लेकिन पहले मेरे परिवार की सुरक्षा का वादा कीजिए।',
        englishText: 'Alright sir, I will tell you everything... but first, promise me my family will be safe.'
      }
    ]
  },
  {
    id: 'sample_startup_pitch',
    title: 'Bengaluru Tech Founders Pitch',
    category: 'Startup & Tech',
    duration: '00:28',
    description: 'Founders pitching a revolutionary logistics platform in Hinglish to Indian venture capitalists.',
    subtitles: [
      {
        id: 'sp_1',
        startTime: 0.8,
        endTime: 4.5,
        speaker: 'Aman',
        hindiText: 'नमस्ते सर! आज हम भारत के लॉजिस्टिक्स सेक्टर का सबसे बड़ा जुगाड़ खत्म करने आए हैं।',
        englishText: 'Namaste sir! Today we are here to eliminate the biggest bottlenecks in India\'s logistics sector.'
      },
      {
        id: 'sp_2',
        startTime: 5.2,
        endTime: 9.8,
        speaker: 'Neha',
        hindiText: 'टियर-2 और टियर-3 शहरों में डिलीवरी पार्टनर्स को रियल-टाइम रूटिंग नहीं मिलती।',
        englishText: 'Delivery partners in Tier-2 and Tier-3 cities don\'t get real-time optimized routing.'
      },
      {
        id: 'sp_3',
        startTime: 10.4,
        endTime: 15.6,
        speaker: 'Aman',
        hindiText: 'हमारा AI इंजन फ्यूल कॉस्ट को पच्चीस प्रतिशत तक कम कर देता है।',
        englishText: 'Our AI engine cuts fuel consumption by up to twenty-five percent.'
      },
      {
        id: 'sp_4',
        startTime: 16.2,
        endTime: 21.0,
        speaker: 'Investor',
        hindiText: 'बात में दम है, लेकिन ये बताओ कि तुम्हारा कस्टमर एक्विजिशन कॉस्ट कितना है?',
        englishText: 'The concept has real merit, but tell me: what is your customer acquisition cost?'
      },
      {
        id: 'sp_5',
        startTime: 21.8,
        endTime: 26.5,
        speaker: 'Neha',
        hindiText: 'सर, ऑर्गेनिक रेफरल की वजह से हमारा CAC कम्पटीशन के मुकाबले आधा है।',
        englishText: 'Sir, thanks to organic word-of-mouth referrals, our CAC is half of our competitors.'
      }
    ]
  },
  {
    id: 'sample_banaras_vlog',
    title: 'Varanasi Ghats Morning Conversation',
    category: 'Culture & Travel',
    duration: '00:25',
    description: 'A morning conversation with an elderly boatman on the holy Ganges River at sunrise.',
    subtitles: [
      {
        id: 'bv_1',
        startTime: 1.0,
        endTime: 4.8,
        speaker: 'Traveler',
        hindiText: 'बाबा, अस्सी घाट से दशाश्वमेध घाट जाने में कितना समय लगेगा?',
        englishText: 'Baba, how long will it take us to row from Assi Ghat to Dashashwamedh Ghat?'
      },
      {
        id: 'bv_2',
        startTime: 5.5,
        endTime: 10.2,
        speaker: 'Boatman Ramu',
        hindiText: 'बेटा, गंगा मैया की लहरों पर जल्दबाजी नहीं करते। आधे घंटे में गंगा आरती का दर्शन हो जाएगा।',
        englishText: 'Son, you never rush on Mother Ganga\'s waves. In thirty minutes you will witness the holy Ganga Aarti.'
      },
      {
        id: 'bv_3',
        startTime: 11.0,
        endTime: 16.5,
        speaker: 'Traveler',
        hindiText: 'सुबह की यह शांति और मंदिरों की घंटियों की आवाज़ दिल को छू लेती है।',
        englishText: 'This morning serenity and the sound of temple bells truly touches the soul.'
      },
      {
        id: 'bv_4',
        startTime: 17.2,
        endTime: 23.0,
        speaker: 'Boatman Ramu',
        hindiText: 'यही तो बनारस की तासीर है। जो एक बार यहां आता है, उसका मन यहीं बस जाता है।',
        englishText: 'That is the very essence of Banaras. Whoever visits once leaves their heart here forever.'
      }
    ]
  }
];

// Initialize sample video files if they don't exist yet using ffmpeg
async function ensureSampleFiles() {
  for (const s of SAMPLE_VIDEOS) {
    const videoFileName = `${s.id}.mp4`;
    const targetPath = path.join(SAMPLES_DIR, videoFileName);
    if (!fs.existsSync(targetPath)) {
      try {
        // Generate a crisp, clean 1080p sample video clip with visual scene indicator and audio tone
        const dur = 32;
        const color = s.id === 'sample_bollywood_drama' ? '#1e1b4b' : s.id === 'sample_startup_pitch' ? '#0f172a' : '#14532d';
        const titleText = s.title.replace(/'/g, "\\'");
        
        // Use FFmpeg to generate clean video with title text & timestamp burned in
        const cmd = `ffmpeg -y -f lavfi -i "color=c=${color}:s=1280x720:d=${dur}" -f lavfi -i "sine=frequency=320:duration=${dur}" -vf "drawtext=text='${titleText}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='SUBLYAI Hindi Dialogue Sample Stream':fontcolor=0x9333ea:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+30" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${targetPath}"`;
        await execAsync(cmd);
      } catch (err) {
        console.warn('Failed to pre-generate sample video', s.id, err);
      }
    }
  }
}
ensureSampleFiles().catch(console.error);

// 9. Get sample videos
app.get('/api/samples', (_req, res) => {
  res.json({ samples: SAMPLE_VIDEOS });
});

// 10. Load sample video directly into a new job
app.post('/api/samples/:sampleId/load', (req, res) => {
  const { sampleId } = req.params;
  const sample = SAMPLE_VIDEOS.find(s => s.id === sampleId);

  if (!sample) {
    return res.status(404).json({ error: 'Sample video not found' });
  }

  const jobId = 'sample_job_' + Date.now();
  const videoFileName = `${sample.id}.mp4`;

  // Copy sample to uploads directory if not already there
  const sampleSource = path.join(SAMPLES_DIR, videoFileName);
  const uploadDest = path.join(UPLOADS_DIR, videoFileName);
  if (fs.existsSync(sampleSource) && !fs.existsSync(uploadDest)) {
    fs.copyFileSync(sampleSource, uploadDest);
  }

  const job: TranslationJob = {
    id: jobId,
    fileName: videoFileName,
    fileSize: fs.existsSync(sampleSource) ? fs.statSync(sampleSource).size : 2500000,
    videoUrl: `/media/samples/${videoFileName}`,
    duration: 32,
    status: 'completed',
    progress: 100,
    currentStepText: 'Sample loaded with full Hindi transcription and synchronized English subtitles!',
    totalSegments: 1,
    completedSegments: 1,
    subtitles: JSON.parse(JSON.stringify(sample.subtitles)),
    createdAt: Date.now()
  };

  // Generate on-disk SRT and VTT for sample
  const jobWorkDir = path.join(PROCESSED_DIR, jobId);
  if (!fs.existsSync(jobWorkDir)) {
    fs.mkdirSync(jobWorkDir, { recursive: true });
  }
  fs.writeFileSync(path.join(jobWorkDir, 'subtitles.srt'), generateSrtContent(job.subtitles), 'utf-8');
  fs.writeFileSync(path.join(jobWorkDir, 'subtitles.vtt'), generateVttContent(job.subtitles), 'utf-8');

  job.srtUrl = `/api/jobs/${jobId}/download/srt`;
  job.vttUrl = `/api/jobs/${jobId}/download/vtt`;

  jobs.set(jobId, job);
  res.json({ success: true, job });
});

// Setup Vite middleware in Dev or serve static in Prod
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SUBLYAI Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
