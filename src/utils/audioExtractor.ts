/**
 * Browser-side high-performance speech audio extractor using Web Audio API.
 * Converts video audio tracks directly into 16kHz mono WAV chunks in milliseconds.
 * Completely eliminates huge video file upload failures on serverless platforms like Vercel.
 */

// Helper to encode AudioBuffer (mixing multi-channel to mono) to 16kHz mono PCM WAV format
export function audioBufferToWav(buffer: AudioBuffer, startSec = 0, durationSec?: number): Blob {
  const targetSampleRate = 16000;
  const startSample = Math.max(0, Math.floor(startSec * buffer.sampleRate));
  const availableSamples = Math.max(0, buffer.length - startSample);
  const lengthSamples = durationSec 
    ? Math.min(availableSamples, Math.floor(durationSec * buffer.sampleRate))
    : availableSamples;

  const numChannels = buffer.numberOfChannels;
  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : null;

  // Resample to 16kHz mono
  const ratio = buffer.sampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(lengthSamples / ratio));
  const resampled = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = startSample + Math.floor(i * ratio);
    if (srcIndex < buffer.length) {
      if (ch1) {
        // Average stereo channels
        resampled[i] = (ch0[srcIndex] + ch1[srcIndex]) * 0.5;
      } else {
        resampled[i] = ch0[srcIndex];
      }
    } else {
      resampled[i] = 0;
    }
  }

  // Create standard RIFF WAV header + 16-bit PCM data
  const dataByteLength = outputLength * 2;
  const wavBuffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);          // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true);           // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true);           // NumChannels (1 mono)
  view.setUint32(24, targetSampleRate, true); // SampleRate (16000)
  view.setUint32(28, targetSampleRate * 2, true); // ByteRate (16000 * 2)
  view.setUint16(32, 2, true);           // BlockAlign (16-bit mono = 2)
  view.setUint16(34, 16, true);          // BitsPerSample
Lifecycle:

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  // Write 16-bit PCM samples with clipping protection
  let offset = 44;
  for (let i = 0; i < outputLength; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

// Convert Blob to Base64 string
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIndex = dataUrl.indexOf(',');
      const base64 = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface AudioSegmentData {
  segmentIndex: number;
  offsetSeconds: number;
  durationSeconds: number;
  base64Audio: string;
  mimeType: string;
}

/**
 * Extracts and segments audio from a video file in the browser.
 * Returns array of base64-encoded 16kHz mono audio segments.
 */
export async function extractAudioSegmentsFromVideo(
  file: File,
  segmentLength = 60,
  onProgress?: (progress: number, stepText: string) => void
): Promise<{ segments: AudioSegmentData[]; totalDuration: number }> {
  onProgress?.(8, 'Extracting speech audio track in browser...');

  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioCtx();
  try {
    onProgress?.(15, `Reading video audio (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);
    const arrayBuffer = await file.arrayBuffer();

    onProgress?.(25, 'Decoding audio track with Web Audio API...');
    let decodedBuffer: AudioBuffer;
    try {
      decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (decodeErr: any) {
      throw new Error(`Browser audio decoder could not parse audio track: ${decodeErr.message || 'Unsupported audio codec'}`);
    }

    const totalDuration = decodedBuffer.duration;
    if (!totalDuration || totalDuration <= 0) {
      throw new Error('Audio track is empty or duration could not be determined.');
    }

    const numSegments = Math.max(1, Math.ceil(totalDuration / segmentLength));
    const segments: AudioSegmentData[] = [];

    for (let i = 0; i < numSegments; i++) {
      const offsetSeconds = i * segmentLength;
      const durationSeconds = Math.min(segmentLength, totalDuration - offsetSeconds);

      onProgress?.(
        Math.round(25 + ((i + 1) / numSegments) * 15),
        `Segmenting speech audio (${i + 1}/${numSegments})...`
      );

      const wavBlob = audioBufferToWav(decodedBuffer, offsetSeconds, durationSeconds);
      const base64Audio = await blobToBase64(wavBlob);

      segments.push({
        segmentIndex: i,
        offsetSeconds,
        durationSeconds,
        base64Audio,
        mimeType: 'audio/wav'
      });
    }

    return { segments, totalDuration };
  } finally {
    audioCtx.close().catch(() => {});
  }
}
