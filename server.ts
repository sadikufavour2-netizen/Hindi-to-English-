import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import type { SubtitleCue, TranslationJob } from './src/types';

dotenv.config();

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Determine if running in Vercel or AWS Lambda serverless environment
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const BASE_STORAGE_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), 'sublyai') : __dirname;

// Directories (using writable /tmp in serverless to prevent EROFS read-only crashes)
const UPLOADS_DIR = path.resolve(BASE_STORAGE_DIR, 'uploads');
const PROCESSED_DIR = path.resolve(BASE_STORAGE_DIR, 'processed');
const CHUNKS_DIR = path.resolve(BASE_STORAGE_DIR, 'uploads/chunks');
const SAMPLES_DIR = path.resolve(BASE_STORAGE_DIR, 'samples');

for (const dir of [UPLOADS_DIR, PROCESSED_DIR, CHUNKS_DIR, SAMPLES_DIR]) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn('Directory init note:', dir, err);
  }
}

// FFmpeg binary resolution: use system ffmpeg if available
const FFMPEG_BIN = 'ffmpeg';

// Multer storage for direct video upload
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
  fileFilter: (_req, _file, cb) => {
    cb(null, true);
  }
});

// Chunk upload multer with 15MB limit per chunk
const chunkStorage = multer.memoryStorage();
const chunkUpload = multer({ storage: chunkStorage, limits: { fileSize: 15 * 1024 * 1024 } });

// In-Memory Jobs Store
const jobs = new Map<string, TranslationJob>();

// Gemini API initialization
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured. Please add GEMINI_API_KEY in your hosting dashboard or .env file.');
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
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hrs = pad(safeSec / 3600);
  const mins = pad((safeSec % 3600) / 60);
  const secs = pad(safeSec % 60);
  const millis = pad(Math.round((safeSec % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs},${millis}`;
}

export function formatVttTime(seconds: number): string {
  const pad = (num: number, size = 2) => String(Math.floor(num)).padStart(size, '0');
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hrs = pad(safeSec / 3600);
  const mins = pad((safeSec % 3600) / 60);
  const secs = pad(safeSec % 60);
  const millis = pad(Math.round((safeSec % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs}.${millis}`;
}

export function generateSrtContent(subtitles: SubtitleCue[]): string {
  if (!subtitles || subtitles.length === 0) {
    return '1\n00:00:00,000 --> 00:00:02,000\n[SUBLYAI]: No dialogue detected\n';
  }
  return subtitles
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue, index) => {
      const speakerPrefix = cue.speaker ? `[${cue.speaker}]: ` : '';
      return `${index + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(cue.endTime)}\n${speakerPrefix}${cue.englishText}\n`;
    })
    .join('\n');
}

export function generateVttContent(subtitles: SubtitleCue[]): string {
  if (!subtitles || subtitles.length === 0) {
    return 'WEBVTT - SUBLYAI Hindi to English Subtitles\n\n1\n00:00:00.000 --> 00:00:02.000\n[SUBLYAI]: No dialogue detected\n';
  }
  const cues = subtitles
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue, index) => {
      const speakerPrefix = cue.speaker ? `<v ${cue.speaker}>` : '';
      const speakerSuffix = cue.speaker ? '</v>' : '';
      return `${index + 1}\n${formatVttTime(cue.startTime)} --> ${formatVttTime(cue.endTime)}\n${speakerPrefix}${cue.englishText}${speakerSuffix}\n`;
    })
    .join('\n');
  return `WEBVTT - SUBLYAI Hindi to English Subtitles\n\n${cues}`;
}

// Helper to persist jobs in memory and on disk for serverless persistence
function getJob(id: string): TranslationJob | null {
  if (jobs.has(id)) return jobs.get(id)!;
  try {
    const jobFile = path.join(PROCESSED_DIR, id, 'job.json');
    if (fs.existsSync(jobFile)) {
      const data = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      jobs.set(id, data);
      return data;
    }
  } catch {}
  return null;
}

function saveJob(job: TranslationJob) {
  jobs.set(job.id, job);
  try {
    const jobDir = path.join(PROCESSED_DIR, job.id);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    fs.writeFileSync(path.join(jobDir, 'job.json'), JSON.stringify(job), 'utf-8');
  } catch {}
}

// Extract duration with ffprobe or ffmpeg banner fallback
async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const dur = parseFloat(stdout.trim());
    if (!isNaN(dur) && dur > 0) return dur;
  } catch {}

  try {
    const { stderr } = await execAsync(`${FFMPEG_BIN} -i "${filePath}" 2>&1 || true`);
    const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (match) {
      const hours = parseFloat(match[1]);
      const mins = parseFloat(match[2]);
      const secs = parseFloat(match[3]);
      return hours * 3600 + mins * 60 + secs;
    }
  } catch {}

  return 0;
}

// Extract audio using FFmpeg with multithreading
async function extractAudio(videoPath: string, outputAudioPath: string): Promise<void> {
  const cmd = `${FFMPEG_BIN} -y -threads 0 -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 48k "${outputAudioPath}"`;
  await execAsync(cmd);
}

// Divide audio into segments for long videos
async function segmentAudio(audioPath: string, jobDir: string, segmentSeconds = 60): Promise<string[]> {
  const segPattern = path.join(jobDir, 'seg_%03d.mp3');
  const cmd = `${FFMPEG_BIN} -y -i "${audioPath}" -f segment -segment_time ${segmentSeconds} -c copy "${segPattern}"`;
  await execAsync(cmd);

  const files = fs.readdirSync(jobDir)
    .filter(f => f.startsWith('seg_') && f.endsWith('.mp3'))
    .sort()
    .map(f => path.join(jobDir, f));

  return files;
}

// Translation prompt builder
function buildTranslationPrompt(segmentDuration = 60): string {
  return `You are a world-class professional Hindi-to-English cinema & video translator and subtitler.
Your task is to transcribe Hindi or Hinglish spoken dialogue in this audio clip, and translate it into clear, natural, modern English subtitles.

CRITICAL TRANSLATION REQUIREMENTS:
1. Detect any Hindi, Urdu, or Hinglish speech in this audio track.
2. Transcribe the spoken Hindi dialogue accurately.
3. Translate into natural, high-quality, conversational English:
   - Understand Indian expressions, cultural idioms, humor, and emotional nuances (e.g., "Arre yaar", "Bhai", "Chalo", "Jugaad", "Kya baat hai", "Shaabash").
   - Maintain the correct emotional tone, sarcasm, urgency, romance, or affection.
   - Do NOT translate literally word-by-word if it sounds unnatural in English; provide cinematic, engaging subtitles.
4. Distinguish different speakers where multiple people talk (e.g. "Speaker 1", "Speaker 2", or character names if mentioned).
5. Accurate Timestamps:
   - Provide "startSeconds" and "endSeconds" relative to THIS segment (from 0.0 to ${segmentDuration}.0 seconds).
   - Sync the subtitle start and end precisely with when dialogue begins and finishes.
6. Ignore background music, sound effects, ambient noise, and silence. Do NOT invent dialogue.
7. If there is no dialogue in this audio, set hasSpeech to false and return an empty subtitles array.`;
}

// Server-side translation runner for uploaded video files
async function runTranslationJob(jobId: string) {
  const job = getJob(jobId);
  if (!job) return;

  try {
    const videoFilePath = path.join(UPLOADS_DIR, job.fileName);
    if (!fs.existsSync(videoFilePath)) {
      throw new Error(`Video file not found at ${videoFilePath}`);
    }

    job.status = 'extracting_audio';
    job.currentStepText = 'Extracting speech audio track with FFmpeg...';
    job.progress = 15;
    saveJob(job);

    const jobWorkDir = path.join(PROCESSED_DIR, jobId);
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }

    const fullAudioPath = path.join(jobWorkDir, 'audio_full.mp3');
    await extractAudio(videoFilePath, fullAudioPath);

    const realDuration = await getVideoDuration(fullAudioPath);
    if (realDuration > 0) {
      job.duration = realDuration;
    }

    const segmentDuration = 60;
    const segmentFiles = await segmentAudio(fullAudioPath, jobWorkDir, segmentDuration);
    job.totalSegments = segmentFiles.length || 1;
    job.completedSegments = 0;

    job.status = 'detecting_speech';
    job.currentStepText = `Detecting Hindi dialogue and transcribing (${job.totalSegments} segment${job.totalSegments > 1 ? 's' : ''})...`;
    job.progress = 30;
    saveJob(job);

    const ai = getGeminiClient();
    const accumulatedSubtitles: SubtitleCue[] = [];
    const CONCURRENCY_LIMIT = 3;
    let completedCount = 0;

    const translateSegment = async (index: number) => {
      const segFile = segmentFiles[index];
      const offsetSeconds = index * segmentDuration;

      try {
        const audioBuffer = fs.readFileSync(segFile);
        const base64Audio = audioBuffer.toString('base64');
        const prompt = buildTranslationPrompt(segmentDuration);

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
        saveJob(job);
      }
    };

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

    job.status = 'synchronizing';
    job.currentStepText = 'Synchronizing timestamps and formatting subtitle tracks...';
    job.progress = 95;
    saveJob(job);

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
    saveJob(job);

  } catch (err: any) {
    console.error('Translation job failed:', err);
    job.status = 'error';
    job.error = err.message || 'An error occurred during audio extraction or Gemini translation.';
    job.currentStepText = `Error: ${job.error}`;
    saveJob(job);
  }
}

// Media file streaming with Range support for video player seeking
const handleMediaStream = (req: express.Request, res: express.Response) => {
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
    '.wav': 'audio/wav',
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
};

app.get('/media/:folder/:filename', handleMediaStream);
app.get('/api/media/:folder/:filename', handleMediaStream);

// Create an Express Router for API routes
// This allows identical handling whether mounted at /api or root / (handling Vercel rewrites gracefully)
const apiRouter = express.Router();

// Health Check
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'SUBLYAI',
    serverless: IS_SERVERLESS,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    time: Date.now()
  });
});

// FAST TRANSLATE AUDIO ENDPOINT:
// Accepts base64 audio segment (16kHz mono WAV from browser), translates synchronously with Gemini,
// and returns high-accuracy English subtitles with millisecond timestamps.
apiRouter.post('/translate-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/wav', offsetSeconds = 0, segmentDuration = 60, jobId } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 in request body' });
    }

    const ai = getGeminiClient();
    const prompt = buildTranslationPrompt(Number(segmentDuration) || 60);

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/wav',
            data: audioBase64,
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
    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { hasSpeech: false, subtitles: [] };
    }

    const baseOffset = Number(offsetSeconds) || 0;
    const generatedCues: SubtitleCue[] = [];

    if (parsed.subtitles && Array.isArray(parsed.subtitles)) {
      for (const item of parsed.subtitles) {
        const rawStart = Number(item.startSeconds) || 0;
        const rawEnd = Number(item.endSeconds) || (rawStart + 2.5);

        const startSec = Math.max(0, baseOffset + rawStart);
        const endSec = Math.max(startSec + 0.4, baseOffset + rawEnd);

        if (item.englishText && item.englishText.trim()) {
          generatedCues.push({
            id: `cue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            startTime: Number(startSec.toFixed(2)),
            endTime: Number(endSec.toFixed(2)),
            hindiText: (item.hindiText || '').trim(),
            englishText: (item.englishText || '').trim(),
            speaker: (item.speaker || 'Speaker').trim()
          });
        }
      }
    }

    // If a jobId was provided, update the stored job on the server
    if (jobId) {
      const existingJob = getJob(jobId);
      if (existingJob) {
        const combined = [...(existingJob.subtitles || []), ...generatedCues].sort((a, b) => a.startTime - b.startTime);
        // Deduplicate cues with identical start & text
        const seen = new Set<string>();
        existingJob.subtitles = combined.filter(c => {
          const key = `${c.startTime}_${c.englishText}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        saveJob(existingJob);
      }
    }

    res.json({
      success: true,
      hasSpeech: Boolean(parsed.hasSpeech),
      detectedLanguage: parsed.detectedLanguage || 'Hindi',
      subtitles: generatedCues
    });

  } catch (err: any) {
    console.error('Fast audio translation error:', err);
    res.status(500).json({
      error: err.message || 'Failed to translate audio with Gemini API',
      success: false
    });
  }
});

// Create/Register a job on server
apiRouter.post('/jobs/create', (req, res) => {
  try {
    const { id, fileName, fileSize, duration, videoUrl } = req.body;
    if (!id || !fileName) {
      return res.status(400).json({ error: 'Missing id or fileName' });
    }

    const job: TranslationJob = {
      id,
      fileName,
      fileSize: Number(fileSize) || 0,
      duration: Number(duration) || 0,
      videoUrl: videoUrl || '',
      status: 'idle',
      progress: 0,
      currentStepText: 'Job initialized',
      totalSegments: 1,
      completedSegments: 0,
      subtitles: [],
      createdAt: Date.now()
    };

    saveJob(job);
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create job' });
  }
});

// Direct file upload
apiRouter.post('/upload', (req, res) => {
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

      saveJob(job);
      res.json({ success: true, job });
    } catch (routeErr: any) {
      console.error('Upload processing error:', routeErr);
      res.status(500).json({ error: routeErr.message || 'Error processing uploaded video' });
    }
  });
});

// Chunked upload endpoints
apiRouter.post('/upload/init', (req, res) => {
  try {
    const { fileName, totalSize } = req.body;
    const uploadId = 'chunk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const uploadDir = path.join(CHUNKS_DIR, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });

    res.json({ uploadId, fileName, totalSize });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to init chunk upload: ' + err.message });
  }
});

apiRouter.post('/upload/chunk', (req, res) => {
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
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
      } catch {}
    }

    const chunkPath = path.join(uploadDir, `chunk_${String(chunkIndex).padStart(5, '0')}`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    res.json({ success: true, chunkIndex: Number(chunkIndex) });
  });
});

apiRouter.post('/upload/complete', async (req, res) => {
  try {
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

    try {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    } catch {}

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

    saveJob(job);
    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to assemble video: ' + err.message });
  }
});

// Start AI translation job
apiRouter.post('/jobs/:id/start', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

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
  saveJob(job);

  runTranslationJob(id).catch(err => {
    console.error('Job execution error:', err);
  });

  res.json({ success: true, job });
});

// Poll job status & progressive subtitles
apiRouter.get('/jobs/:id', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ job });
});

// Update job progress directly from client
apiRouter.post('/jobs/:id/update-progress', (req, res) => {
  const { id } = req.params;
  const { status, progress, currentStepText, subtitles } = req.body;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (status) job.status = status;
  if (typeof progress === 'number') job.progress = progress;
  if (currentStepText) job.currentStepText = currentStepText;
  if (Array.isArray(subtitles)) job.subtitles = subtitles;

  saveJob(job);
  res.json({ success: true, job });
});

// Update subtitles from Subtitle Editor
apiRouter.put('/jobs/:id/subtitles', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const { subtitles } = req.body;
  if (!Array.isArray(subtitles)) {
    return res.status(400).json({ error: 'subtitles must be an array' });
  }

  job.subtitles = subtitles;
  saveJob(job);

  const jobWorkDir = path.join(PROCESSED_DIR, id);
  try {
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }
    const srtContent = generateSrtContent(job.subtitles);
    const vttContent = generateVttContent(job.subtitles);
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.srt'), srtContent, 'utf-8');
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.vtt'), vttContent, 'utf-8');
  } catch {}

  res.json({ success: true, subtitles: job.subtitles });
});

// Download SRT
apiRouter.get('/jobs/:id/download/srt', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const srt = generateSrtContent(job.subtitles);
  const baseName = path.basename(job.fileName, path.extname(job.fileName));

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_english_subtitles.srt"`);
  res.send(srt);
});

// Download VTT
apiRouter.get('/jobs/:id/download/vtt', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const vtt = generateVttContent(job.subtitles);
  const baseName = path.basename(job.fileName, path.extname(job.fileName));

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}_english_subtitles.vtt"`);
  res.send(vtt);
});

// Burn subtitles into video
apiRouter.post('/jobs/:id/burn', async (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

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
    if (!fs.existsSync(inputVideoPath)) {
      return res.status(400).json({
        error: 'Video file not found on server for hardcoding. On serverless hosting (Vercel), please download the universal .SRT or .VTT subtitles to use with your video player.'
      });
    }

    const outputVideoName = `subtitled_${job.fileName}`;
    const outputVideoPath = path.join(PROCESSED_DIR, outputVideoName);
    const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    
    const cmd = `${FFMPEG_BIN} -y -threads 0 -i "${inputVideoPath}" -vf "subtitles='${escapedSrt}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,MarginV=35'" -c:v libx264 -preset ultrafast -crf 23 -c:a copy "${outputVideoPath}"`;

    await execAsync(cmd);

    job.burnedVideoUrl = `/media/processed/${outputVideoName}`;
    saveJob(job);

    res.json({
      success: true,
      burnedVideoUrl: job.burnedVideoUrl,
      downloadUrl: `/api/jobs/${id}/download/video`
    });
  } catch (err: any) {
    console.error('Burn subtitles failed:', err);
    res.status(500).json({
      error: 'Failed to burn subtitles into video. Note: Video burning requires server-side FFmpeg. For instant results, download .SRT or .VTT subtitles above.'
    });
  }
});

apiRouter.get('/jobs/:id/download/video', (req, res) => {
  const { id } = req.params;
  const job = getJob(id);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  const outputVideoName = `subtitled_${job.fileName}`;
  const outputVideoPath = path.join(PROCESSED_DIR, outputVideoName);

  if (!fs.existsSync(outputVideoPath)) {
    return res.status(404).send('Burned video not ready yet.');
  }

  const baseName = path.basename(job.fileName, path.extname(job.fileName));
  res.download(outputVideoPath, `${baseName}_EnglishSubtitled.mp4`);
});

// Built-in Hindi sample clips
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

// 9. Get sample videos
apiRouter.get('/samples', (_req, res) => {
  res.json({ samples: SAMPLE_VIDEOS });
});

// 10. Load sample video directly into a new job
apiRouter.post('/samples/:sampleId/load', (req, res) => {
  const { sampleId } = req.params;
  const sample = SAMPLE_VIDEOS.find(s => s.id === sampleId);

  if (!sample) {
    return res.status(404).json({ error: 'Sample video not found' });
  }

  const jobId = 'sample_job_' + Date.now();
  const videoFileName = `${sample.id}.mp4`;

  const job: TranslationJob = {
    id: jobId,
    fileName: videoFileName,
    fileSize: 2500000,
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

  const jobWorkDir = path.join(PROCESSED_DIR, jobId);
  try {
    if (!fs.existsSync(jobWorkDir)) {
      fs.mkdirSync(jobWorkDir, { recursive: true });
    }
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.srt'), generateSrtContent(job.subtitles), 'utf-8');
    fs.writeFileSync(path.join(jobWorkDir, 'subtitles.vtt'), generateVttContent(job.subtitles), 'utf-8');
  } catch {}

  job.srtUrl = `/api/jobs/${jobId}/download/srt`;
  job.vttUrl = `/api/jobs/${jobId}/download/vtt`;

  saveJob(job);
  res.json({ success: true, job });
});

// Mount the API router at BOTH /api and / to handle all routing environments seamlessly
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Setup Vite middleware in Dev or serve static in Prod
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
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

// In standard Node environments, start server; on Vercel serverless, export app
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { app };
export default app;
