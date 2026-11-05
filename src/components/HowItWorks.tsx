import React from 'react';
import { UploadCloud, AudioWaveform, Languages, Sparkles, Sliders, Download } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      num: '01',
      title: 'Upload Hindi Video',
      description: 'Upload MP4, MOV, MKV, or WEBM files. Resumable chunked upload ensures smooth transmission for 30-min, 44-min, and 1-hour episodes.',
      icon: UploadCloud,
    },
    {
      num: '02',
      title: 'FFmpeg Audio Extraction',
      description: 'Our backend isolates the spoken dialogue audio track at high fidelity, eliminating video overhead for maximum AI processing speed.',
      icon: AudioWaveform,
    },
    {
      num: '03',
      title: 'Speech & Dialect Detection',
      description: 'Neural models identify Hindi, Hinglish, regional accents, and speaker transitions while filtering out background movie music and sound effects.',
      icon: Languages,
    },
    {
      num: '04',
      title: 'Cultural Context Translation',
      description: 'Google Gemini translates conversations into idiomatic, natural English—preserving Bollywood references, Indian humor, proverbs, and emotional gravity.',
      icon: Sparkles,
    },
    {
      num: '05',
      title: 'Progressive Synchronization',
      description: 'Subtitles are aligned to exact millisecond timestamps and streamed into your live preview player segment-by-segment as they finish.',
      icon: Sliders,
    },
    {
      num: '06',
      title: 'Export SRT, VTT or Hardcoded Video',
      description: 'Download standard subtitle tracks for streaming players or have FFmpeg permanently burn English subtitles directly into your MP4 video.',
      icon: Download,
    },
  ];

  return (
    <section id="how-it-works" className="py-20 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">
            Pipeline Architecture
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold font-display text-white">
            How SUBLYAI Works
          </h2>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            From raw Hindi video files to frame-synchronized, culturally authentic English subtitles in six automated steps.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 hover:border-purple-500/40 transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="font-mono text-2xl font-extrabold text-slate-700 group-hover:text-purple-400/80 transition-colors">
                      {step.num}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white group-hover:text-purple-200 transition-colors">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-purple-400 font-mono">
                  <span>STEP {step.num}</span>
                  <span>·</span>
                  <span>AUTOMATED</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
