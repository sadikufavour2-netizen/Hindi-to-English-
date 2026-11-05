import React from 'react';
import { 
  FileAudio, 
  Languages, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  Play,
  RotateCw
} from 'lucide-react';
import type { TranslationJob } from '../types';

interface ProcessingStatusProps {
  job: TranslationJob;
  onPreviewClick: () => void;
  onRetry: () => void;
}

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  job,
  onPreviewClick,
  onRetry
}) => {
  const steps = [
    {
      id: 'upload',
      title: 'Video Uploaded',
      description: 'Stream received & file integrity verified',
      icon: CheckCircle2,
      isDone: job.status !== 'uploading' && job.status !== 'idle',
      isActive: job.status === 'uploading'
    },
    {
      id: 'extract',
      title: 'FFmpeg Audio Extraction',
      description: 'Extracting 16kHz mono speech track',
      icon: FileAudio,
      isDone: ['detecting_speech', 'translating', 'synchronizing', 'completed'].includes(job.status),
      isActive: job.status === 'extracting_audio'
    },
    {
      id: 'detect',
      title: 'Hindi Speech Detection',
      description: 'Identifying dialogue & speech activity',
      icon: Languages,
      isDone: ['translating', 'synchronizing', 'completed'].includes(job.status),
      isActive: job.status === 'detecting_speech'
    },
    {
      id: 'translate',
      title: 'Gemini Natural English Translation',
      description: job.totalSegments > 1 
        ? `Segment ${job.completedSegments} of ${job.totalSegments} processed`
        : 'Translating cultural nuance & dialogue',
      icon: Sparkles,
      isDone: ['synchronizing', 'completed'].includes(job.status),
      isActive: job.status === 'translating'
    },
    {
      id: 'sync',
      title: 'Subtitle Synchronization',
      description: 'Generating frame-accurate SRT & VTT cues',
      icon: Layers,
      isDone: job.status === 'completed',
      isActive: job.status === 'synchronizing'
    }
  ];

  const hasSubtitles = job.subtitles && job.subtitles.length > 0;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 mt-6">
      <div className="rounded-2xl border border-purple-500/30 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl shadow-purple-950/50">
        
        {/* Header with Title and File Name */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
              <h3 className="text-lg sm:text-xl font-bold font-display text-white">
                {job.status === 'completed' ? 'Translation Completed' : 'AI Processing Pipeline'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              File: <span className="text-slate-300 font-medium">{job.fileName}</span> 
              {job.duration > 0 && ` · Duration: ~${Math.round(job.duration)}s`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Progressive Subtitle Preview Button */}
            {hasSubtitles && (
              <button
                onClick={onPreviewClick}
                className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-md shadow-purple-600/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Live Subtitle Preview ({job.subtitles.length} Cues)
              </button>
            )}

            {job.status === 'error' && (
              <button
                onClick={onRetry}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry Translation
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar & Current Status text */}
        <div className="my-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-medium text-purple-300 flex items-center gap-2">
              {job.status !== 'completed' && job.status !== 'error' && (
                <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
              )}
              {job.currentStepText}
            </span>
            <span className="font-mono text-purple-400 font-bold">{job.progress}%</span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-500 ${
                job.status === 'error'
                  ? 'bg-red-500'
                  : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500'
              }`}
              style={{ width: `${Math.max(5, job.progress)}%` }}
            />
          </div>
        </div>

        {/* Error Notification if any */}
        {job.error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-red-300">Processing Error:</span> {job.error}
            </div>
          </div>
        )}

        {/* Pipeline Step Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  step.isDone
                    ? 'border-purple-500/30 bg-purple-950/20 text-slate-300'
                    : step.isActive
                    ? 'border-purple-500 bg-purple-950/50 shadow-lg shadow-purple-950/40 text-white'
                    : 'border-slate-800/80 bg-slate-950/30 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                      step.isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : step.isActive
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {step.isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className="text-xs font-semibold truncate">{step.title}</span>
                </div>
                <p className="text-[11px] leading-tight text-slate-400 line-clamp-2">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Progressive Subtitle Preview Teaser */}
        {hasSubtitles && job.status !== 'completed' && (
          <div className="mt-6 p-4 rounded-xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-600/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-purple-300" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-white">
                  Early Subtitles Ready ({job.subtitles.length} lines)
                </p>
                <p className="text-purple-300/80">
                  You can already play the video with translated subtitles while the rest of the audio is processing!
                </p>
              </div>
            </div>

            <button
              onClick={onPreviewClick}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shrink-0 transition-colors cursor-pointer"
            >
              Watch Video Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
