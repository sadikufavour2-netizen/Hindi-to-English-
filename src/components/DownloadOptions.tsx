import React, { useState } from 'react';
import { 
  Download, 
  FileText, 
  Film, 
  Sparkles, 
  Check, 
  Copy, 
  X, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import type { TranslationJob } from '../types';

interface DownloadOptionsProps {
  job: TranslationJob;
  onClose: () => void;
}

export const DownloadOptions: React.FC<DownloadOptionsProps> = ({ job, onClose }) => {
  const [isBurning, setIsBurning] = useState(false);
  const [burnCompleted, setBurnCompleted] = useState(Boolean(job.burnedVideoUrl));
  const [burnedDownloadUrl, setBurnedDownloadUrl] = useState<string | null>(
    job.burnedVideoUrl ? `/api/jobs/${job.id}/download/video` : null
  );
  const [burnError, setBurnError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'srt' | 'vtt' | null>(null);

  // Trigger FFmpeg subtitle burning
  const handleBurnSubtitles = async () => {
    setIsBurning(true);
    setBurnError(null);

    try {
      const res = await fetch(`/api/jobs/${job.id}/burn`, {
        method: 'POST'
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to render subtitles into video');
      }

      const data = await res.json();
      setBurnCompleted(true);
      setBurnedDownloadUrl(data.downloadUrl || `/api/jobs/${job.id}/download/video`);
    } catch (err: any) {
      console.error('Burn error:', err);
      setBurnError(err.message || 'Subtitles burning failed.');
    } finally {
      setIsBurning(false);
    }
  };

  const handleCopyClipboard = async (type: 'srt' | 'vtt') => {
    try {
      const url = `/api/jobs/${job.id}/download/${type}`;
      const res = await fetch(url);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0e101a] border border-purple-500/30 rounded-2xl shadow-2xl p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-white">Download Translation</h2>
              <p className="text-xs text-slate-400">
                Choose your desired export format: subtitle files or subtitled video.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="mt-6 space-y-4">
          {/* Option A: SRT Subtitles */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0 text-indigo-400 mt-0.5">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">SubRip Subtitles (.SRT)</h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Universal standard for VLC, YouTube, Netflix, Premiere Pro, and media players.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                onClick={() => handleCopyClipboard('srt')}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy raw SRT to clipboard"
              >
                {copiedType === 'srt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedType === 'srt' ? 'Copied' : 'Copy'}
              </button>

              <a
                href={`/api/jobs/${job.id}/download/srt`}
                download
                className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-md transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download .SRT
              </a>
            </div>
          </div>

          {/* Option B: WebVTT Subtitles */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 text-blue-400 mt-0.5">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">WebVTT Subtitles (.VTT)</h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-500/30">
                    Web Native
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Optimized for web video elements, HTML5 video players, and streaming platforms.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                onClick={() => handleCopyClipboard('vtt')}
                className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Copy raw VTT to clipboard"
              >
                {copiedType === 'vtt' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedType === 'vtt' ? 'Copied' : 'Copy'}
              </button>

              <a
                href={`/api/jobs/${job.id}/download/vtt`}
                download
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-md transition-colors flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download .VTT
              </a>
            </div>
          </div>

          {/* Option C: Hardcoded Subtitled Video (FFmpeg) */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900/60 border border-purple-500/40 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-400 mt-0.5">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-white">Permanently Subtitled Video (.MP4)</h4>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-500/30">
                      Hardcoded Burn
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    FFmpeg embeds English subtitles directly into the video frames. Ready for WhatsApp, Instagram, or any TV player without needing external subtitle files.
                  </p>
                </div>
              </div>
            </div>

            {/* Burn Progress / Action */}
            {burnError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{burnError}</span>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-purple-900/30">
              <span className="text-xs text-slate-400">
                {burnCompleted ? 'Subtitles successfully burned into MP4!' : 'Requires 5-15 seconds for FFmpeg video frame re-encoding.'}
              </span>

              {burnCompleted && burnedDownloadUrl ? (
                <a
                  href={burnedDownloadUrl}
                  download
                  className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Subtitled MP4 Video
                </a>
              ) : (
                <button
                  onClick={handleBurnSubtitles}
                  disabled={isBurning}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isBurning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Burning Subtitles via FFmpeg...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-purple-200" />
                      Render & Burn English Subtitles into Video
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
