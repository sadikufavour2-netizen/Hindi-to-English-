import type { SubtitleCue } from '../types';

export function padZero(num: number, size = 2): string {
  return String(Math.floor(num)).padStart(size, '0');
}

export function formatSrtTime(seconds: number): string {
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hrs = padZero(safeSec / 3600);
  const mins = padZero((safeSec % 3600) / 60);
  const secs = padZero(safeSec % 60);
  const millis = padZero(Math.round((safeSec % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs},${millis}`;
}

export function formatVttTime(seconds: number): string {
  const safeSec = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hrs = padZero(safeSec / 3600);
  const mins = padZero((safeSec % 3600) / 60);
  const secs = padZero(safeSec % 60);
  const millis = padZero(Math.round((safeSec % 1) * 1000), 3);
  return `${hrs}:${mins}:${secs}.${millis}`;
}

export function generateSrtContent(subtitles: SubtitleCue[]): string {
  if (!subtitles || subtitles.length === 0) {
    return '1\n00:00:00,000 --> 00:00:02,000\n[SUBLYAI]: No subtitles available\n';
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
    return 'WEBVTT - SUBLYAI Hindi to English Subtitles\n\n1\n00:00:00.000 --> 00:00:02.000\n[SUBLYAI]: No subtitles available\n';
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

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
