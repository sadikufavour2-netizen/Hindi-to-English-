import React from 'react';
import { Upload, Sparkles, Play, ShieldCheck, Zap, Subtitles } from 'lucide-react';

interface HeroProps {
  onUploadClick: () => void;
  onSampleClick: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onUploadClick, onSampleClick }) => {
  return (
    <section className="relative pt-12 pb-20 overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-purple-600/10 blur-[130px] -z-10 pointer-events-none rounded-full" />
      <div className="absolute top-1/3 left-1/4 w-[450px] h-[300px] bg-indigo-600/10 blur-[100px] -z-10 pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Pill Kicker */}
        <div className="flex items-center justify-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-950/50 border border-purple-500/20 text-xs font-medium text-purple-300">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Next-Gen Gemini Audio Intelligence</span>
            <span aria-hidden="true" className="text-purple-600">·</span>
            <span className="text-purple-200">Hindi to Natural English</span>
          </div>
        </div>

        {/* Headlines */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15] text-balance">
            Break the Language Barrier. <br />
            <span className="bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-400 bg-clip-text text-transparent">
              Watch Any Hindi Video in English.
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Upload Hindi movies, web series, episodes, and videos. Our AI detects Hindi & Hinglish dialogue, transcribes speech, translates cultural nuance, and generates frame-accurate English subtitles.
          </p>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={onUploadClick}
              className="px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-xl shadow-purple-600/30 transition-all duration-200 flex items-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Upload className="w-4 h-4" />
              Upload Hindi Video
            </button>

            <button
              onClick={onSampleClick}
              className="px-6 py-3.5 text-sm font-semibold text-slate-200 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/60 rounded-xl shadow-sm transition-all duration-200 flex items-center gap-2.5 cursor-pointer"
            >
              <Play className="w-4 h-4 text-purple-400 fill-purple-400" />
              Try With Sample Video
            </button>
          </div>

          {/* Formats Supported */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
            <span className="font-medium text-slate-300">Supported Formats:</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-slate-300">MP4</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-slate-300">MOV</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-slate-300">MKV</span>
            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-slate-300">WEBM</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Handles 30m, 44m & 1hr long videos</span>
          </div>
        </div>

        {/* Hero Cinematic Media Showcase */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl shadow-purple-950/60 bg-slate-950">
            <img
              src="/src/assets/images/sublyai_hero_cinematic_1793901877501.jpg"
              alt="SUBLYAI Cinema Studio Subtitle Preview"
              className="w-full h-auto object-cover max-h-[520px]"
              referrerPolicy="no-referrer"
            />
            {/* Subtle Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c14] via-transparent to-transparent opacity-80" />

            {/* Floating Live Subtitle Demo Badge */}
            <div className="absolute bottom-6 left-6 right-6 sm:left-10 sm:right-10 p-4 rounded-xl bg-slate-900/90 backdrop-blur-md border border-purple-500/30 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                  <Subtitles className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-purple-300">
                    <span>HINDI DETECTED [00:14.2]</span>
                    <span>·</span>
                    <span className="text-slate-400">Speaker: Kabir</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200 mt-0.5">
                    <span className="text-purple-300 font-semibold">"सच बताओ, उस रात तुम कहाँ थे?"</span>
                    <span className="text-slate-400 mx-2">→</span>
                    <span className="text-white font-semibold">"Tell me the truth, where were you that night?"</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 rounded-md flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Frame Synced (0.00s offset)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Quick Value Props */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Concurrent Segment Speed</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Long video audio is chunked into 60s windows and translated progressively so you see subtitles immediately.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Indian Cultural Nuance</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Understands colloquial Hindi, Hinglish, Mumbai slang, respect honorifics, and sarcasm without literal machine errors.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">SRT, VTT & Hardcoded Video</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Download synchronized subtitle tracks or let our FFmpeg engine burn subtitles permanently into the MP4 video.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
