export interface SubtitleCue {
  id: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  hindiText: string;
  englishText: string;
  speaker?: string;
}

export interface SubtitleStyle {
  fontSize: number;    // e.g. 20
  textColor: string;   // e.g. '#ffffff'
  bgColor: string;     // e.g. 'rgba(0,0,0,0.8)'
  position: 'bottom' | 'top';
  syncOffset: number;  // in milliseconds (e.g. -300ms, +500ms)
}

export type JobStatus = 
  | 'idle'
  | 'uploading'
  | 'extracting_audio'
  | 'detecting_speech'
  | 'translating'
  | 'synchronizing'
  | 'completed'
  | 'error';

export interface TranslationJob {
  id: string;
  fileName: string;
  fileSize: number;
  videoUrl: string;
  audioUrl?: string;
  duration: number;
  status: JobStatus;
  progress: number; // 0 - 100
  currentStepText: string;
  totalSegments: number;
  completedSegments: number;
  subtitles: SubtitleCue[];
  error?: string;
  srtUrl?: string;
  vttUrl?: string;
  burnedVideoUrl?: string;
  createdAt: number;
}

export interface SampleVideo {
  id: string;
  title: string;
  category: string;
  duration: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  subtitles: SubtitleCue[];
}
