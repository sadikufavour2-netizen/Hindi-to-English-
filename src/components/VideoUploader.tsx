import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileVideo, X, CheckCircle2, AlertCircle, Sparkles, Film, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import type { TranslationJob } from '../types';

interface VideoUploaderProps {
  onJobCreated: (job: TranslationJob) => void;
  onOpenSamples: () => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onJobCreated, onOpenSamples }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);
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

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsUploading(false);
    setUploadProgress(0);
    setUploadStatusText('');
    setErrorMessage('Upload cancelled.');
  };

  const handleClearSelected = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setSelectedFile(null);
    setVideoPreviewUrl(null);
    setDurationSec(null);
    setErrorMessage(null);
    setUploadProgress(0);
    setUploadStatusText('');
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

  // Resilient Chunked Upload supporting any file size, completely immune to proxy body limits
  const uploadViaChunks = async (file: File, signal: AbortSignal): Promise<TranslationJob> => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk (safely under Cloud Run 32MB payload limit)
    const totalSize = file.size;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    setUploadStatusText(`Initializing session (${totalChunks} chunks)...`);

    // 1. Initialize upload session
    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, totalSize }),
      signal
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to initialize upload session');
    }

    const { uploadId } = await initRes.json();

    // 2. Upload chunks with 3 parallel concurrent workers for maximum speed
    const uploadedBytes = new Array(totalChunks).fill(0);
    let completedChunks = 0;
    const CONCURRENCY = 3;

    const uploadSingleChunk = async (chunkIndex: number, attempt = 1): Promise<void> => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkBlob = file.slice(start, end);

      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('chunk', chunkBlob, 'chunk');

      try {
        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
          signal
        });

        if (!res.ok) {
          if (attempt <= 3) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            return uploadSingleChunk(chunkIndex, attempt + 1);
          }
          throw new Error(`Chunk ${chunkIndex + 1} upload failed`);
        }

        completedChunks++;
        uploadedBytes[chunkIndex] = chunkBlob.size;
        const totalUploaded = uploadedBytes.reduce((a, b) => a + b, 0);
        const percent = Math.min(95, Math.round((totalUploaded / totalSize) * 100));
        setUploadProgress(percent);
        setUploadStatusText(`Uploaded ${completedChunks} of ${totalChunks} chunks (${percent}%)...`);
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        if (attempt <= 3) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          return uploadSingleChunk(chunkIndex, attempt + 1);
        }
        throw err;
      }
    };

    // Worker queue
    const queue = Array.from({ length: totalChunks }, (_, i) => i);
    const workers = Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, async () => {
      while (queue.length > 0) {
        const nextIndex = queue.shift();
        if (nextIndex !== undefined) {
          await uploadSingleChunk(nextIndex);
        }
      }
    });

    await Promise.all(workers);

    // 3. Assemble and complete on server
    setUploadStatusText('Assembling video on server...');
    setUploadProgress(98);

    const completeRes = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId, fileName: file.name }),
      signal
    });

    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to assemble video');
    }

    const completeData = await completeRes.json();
    return completeData.job;
  };

  // Direct single-request upload for small files (< 15MB)
  const uploadDirect = (file: File, signal: AbortSignal): Promise<TranslationJob> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('video', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.min(95, Math.round((e.loaded / e.total) * 100));
          setUploadProgress(pct);
          setUploadStatusText(`Uploading ${pct}%...`);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.job);
          } catch (e: any) {
            reject(new Error('Invalid response from server: ' + e.message));
          }
        } else {
          try {
            const errData = JSON.parse(xhr.responseText);
            reject(new Error(errData.error || `Upload returned HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`Upload returned HTTP ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network connection error during direct upload'));
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

      signal.addEventListener('abort', () => xhr.abort());
      xhr.open('POST', '/api/upload', true);
      xhr.send(formData);
    });
  };

  // Main Upload orchestrator
  const handleStartUploadAndTranslate = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(2);
    setErrorMessage(null);
    setUploadStatusText('Starting fast upload...');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let createdJob: TranslationJob;

      // If file is > 15MB, use chunked upload directly to stay safely within Cloud Run proxy limits
      if (selectedFile.size > 15 * 1024 * 1024) {
        createdJob = await uploadViaChunks(selectedFile, abortController.signal);
      } else {
        try {
          createdJob = await uploadDirect(selectedFile, abortController.signal);
        } catch (directErr: any) {
          if (directErr.name === 'AbortError') throw directErr;
          console.warn('Direct upload failed, falling back to chunked upload:', directErr);
          setUploadStatusText('Switching to resilient chunked upload...');
          createdJob = await uploadViaChunks(selectedFile, abortController.signal);
        }
      }

      setUploadProgress(100);
      setUploadStatusText('Starting AI Hindi translation...');

      // Trigger background translation pipeline
      const startRes = await fetch(`/api/jobs/${createdJob.id}/start`, { method: 'POST' });
      if (startRes.ok) {
        const startData = await startRes.json();
        onJobCreated(startData.job || createdJob);
      } else {
        onJobCreated(createdJob);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setErrorMessage('Upload cancelled.');
      } else {
        console.error('Upload failed:', err);
        setErrorMessage(err.message || 'Video upload failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
      abortControllerRef.current = null;
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
                Resilient Fast Stream
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP4, MOV, MKV, and WEBM. Uploads stream smoothly with chunked protection.
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

        {/* Error Alert with Retry button */}
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
                handleStartUploadAndTranslate();
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
              Movies, drama episodes, clips, or interviews up to 1GB. Direct fast streaming.
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

                  {!isUploading && (
                    <button
                      onClick={handleClearSelected}
                      className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Upload Progress Bar if active */}
                {isUploading && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-purple-300 font-medium flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                        {uploadStatusText || 'Uploading video to server...'}
                      </span>
                      <span className="font-mono text-purple-400 font-bold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!isUploading ? (
                    <>
                      <button
                        onClick={handleStartUploadAndTranslate}
                        className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                      >
                        <Zap className="w-4 h-4 text-purple-200 fill-current" />
                        Fast Upload & Translate to English
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        onClick={handleClearSelected}
                        className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
                      >
                        Choose Different File
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCancelUpload}
                      className="px-3.5 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/40 border border-red-500/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Cancel Upload
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
