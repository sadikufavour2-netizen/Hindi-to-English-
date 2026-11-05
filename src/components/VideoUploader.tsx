import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileVideo, X, CheckCircle2, AlertCircle, Sparkles, Film, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import type { TranslationJob } from '../types';
import { createLocalJob } from '../services/translationService';

interface VideoUploaderProps {
  onJobCreated: (job: TranslationJob, file?: File) => void;
  onOpenSamples: () => void;
  onStartTranslation?: (file: File, durationSec: number | null) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onJobCreated, onOpenSamples, onStartTranslation }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = (file: File) => {
    setErrorMessage(null);
    setSelectedFile(file);

    try {
      const localUrl = URL.createObjectURL(file);
      setVideoPreviewUrl(localUrl);

      // Read metadata duration
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.onloadedmetadata = () => {
        setDurationSec(tempVideo.duration);
      };
      tempVideo.src = localUrl;
    } catch {
      // Preview generation optional
    }
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleClearSelected = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setDurationSec(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleStart = () => {
    if (!selectedFile) return;

    if (onStartTranslation) {
      onStartTranslation(selectedFile, durationSec);
    } else {
      const job = createLocalJob(selectedFile, durationSec || 0);
      onJobCreated(job, selectedFile);
    }
  };

  return (
    <div id="upload-section" className="w-full max-w-4xl mx-auto px-4 sm:px-6">
      <div className="rounded-2xl border border-purple-500/20 bg-slate-900/60 backdrop-blur-xl p-5 sm:p-7 shadow-2xl shadow-purple-950/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
          <div>
            <h2 className="text-xl font-bold font-display text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              Upload Hindi Video
              <span className="text-[11px] font-normal text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-purple-400 fill-current" />
                Ultra-Fast Processing
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP4, MOV, MKV, and WEBM. Audio is extracted directly in your browser with zero upload waiting.
            </p>
          </div>

          <button
            onClick={onOpenSamples}
            type="button"
            className="text-xs font-semibold text-purple-300 hover:text-purple-200 bg-purple-950/60 border border-purple-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <Film className="w-3.5 h-3.5 text-purple-400" />
            Try Pre-loaded Hindi Clip
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-5 p-3.5 rounded-xl bg-red-950/50 border border-red-500/30 text-red-200 text-xs flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-red-300">Upload Issue</p>
              <p className="mt-0.5 text-red-200/90">{errorMessage}</p>
            </div>
            <button
              onClick={() => {
                setErrorMessage(null);
                handleStart();
              }}
              className="text-purple-300 hover:text-white font-bold flex items-center gap-1 cursor-pointer bg-purple-950 px-2 py-1 rounded border border-purple-500/30"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {/* Drop Zone */}
        {!selectedFile ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`mt-5 rounded-xl border-2 border-dashed transition-all duration-200 p-8 sm:p-10 text-center cursor-pointer flex flex-col items-center justify-center ${
              dragActive
                ? 'border-purple-400 bg-purple-950/30 scale-[1.01]'
                : 'border-slate-700/80 hover:border-purple-500/60 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.mov,.mkv,.webm,.m4v,.avi"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-900/60 to-indigo-900/40 border border-purple-500/30 flex items-center justify-center mb-3 shadow-lg shadow-purple-900/20 group">
              <FileVideo className="w-7 h-7 text-purple-400 group-hover:scale-110 transition-transform" />
            </div>

            <p className="text-base font-semibold text-white">
              Drag & drop your Hindi video here, or <span className="text-purple-400 underline underline-offset-4">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md">
              Movies, drama episodes, clips, or interviews up to 1GB. Opens immediately in the Fit-to-Screen Studio.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {['MP4', 'MOV', 'MKV', 'WEBM'].map((fmt) => (
                <span
                  key={fmt}
                  className="px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-800/80 border border-slate-700/60 text-slate-300"
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        ) : (
          /* Selected Video File Card & Local Preview */
          <div className="mt-5 rounded-xl border border-purple-500/30 bg-slate-950/60 p-4 sm:p-5">
            <div className="flex flex-col md:flex-row gap-4 items-start">
              {/* Local Video Thumbnail / Preview */}
              {videoPreviewUrl && (
                <div className="w-full md:w-52 aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 shrink-0 relative group">
                  <video
                    src={videoPreviewUrl}
                    className="w-full h-full object-cover"
                    controls={false}
                    muted
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] font-medium text-white px-2 py-0.5 bg-slate-900/80 rounded">
                      Local Preview
                    </span>
                  </div>
                </div>
              )}

              {/* File Info */}
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-950 border border-purple-500/30 text-purple-300 uppercase">
                        {selectedFile.name.split('.').pop() || 'VIDEO'}
                      </span>
                      <h4 className="text-sm sm:text-base font-semibold text-white truncate max-w-sm sm:max-w-md">
                        {selectedFile.name}
                      </h4>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400 mt-1.5 font-mono">
                      <span>Size: {formatFileSize(selectedFile.size)}</span>
                      {durationSec && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Duration: ~{formatDuration(durationSec)}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400 flex items-center gap-1 font-sans">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ready for AI
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleClearSelected}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Actions */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleStart}
                    className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Zap className="w-4 h-4 text-purple-200 fill-current" />
                    Open Studio & Translate to English
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleClearSelected}
                    className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                  >
                    Choose Different File
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
