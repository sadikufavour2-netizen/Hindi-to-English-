import React from 'react';
import { 
  Sparkles, 
  Clock, 
  Users, 
  Flame, 
  Sliders, 
  Film, 
  CheckCircle2, 
  Zap, 
  ShieldCheck, 
  FileCode 
} from 'lucide-react';

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      title: 'Indian Cultural & Slang Intelligence',
      description: 'Understands colloquial Hindi, Hinglish, regional metaphors, proverbs, and street slang ("Arre yaar", "Jugaad", "Lafda", "Kya baat hai"). Translations read like natural dialogue written by Hollywood scriptwriters.',
      icon: Sparkles,
      tag: 'Semantic Engine'
    },
    {
      title: 'Speaker Diarization & Character Separation',
      description: 'Accurately distinguishes between conversational partners, interrogators, heroes, and background speakers. Each cue labels the speaker clearly so dialogue flow remains effortless.',
      icon: Users,
      tag: 'Multi-Speaker'
    },
    {
      title: 'Progressive Live Preview',
      description: 'Don\'t wait 20 minutes for a whole movie to finish before seeing anything. Watch segment 1 with translated subtitles in the video player while segment 2 and 3 are still rendering.',
      icon: Zap,
      tag: 'Zero Wait Time'
    },
    {
      title: 'True Long Video Architecture',
      description: 'Engineered specifically for full 30-minute sitcoms, 44-minute drama episodes, and 1-hour feature films. Employs resumable chunk uploads and concurrent background worker pipelines.',
      icon: Clock,
      tag: 'Up to 1 Hour+'
    },
    {
      title: 'In-Browser Subtitle Studio',
      description: 'Full subtitle editor built right in. Fine-tune any translation, correct names, shift timestamps by tenths of a second, and customize font sizes, colors, and backgrounds in real time.',
      icon: Sliders,
      tag: 'Interactive Studio'
    },
    {
      title: 'Permanent Hardcoded FFmpeg Burn',
      description: 'Need a video that plays everywhere with subtitles burned directly into the picture? Our FFmpeg engine renders high-contrast, crisp subtitles permanently onto the MP4 with one click.',
      icon: Film,
      tag: 'FFmpeg Rendering'
    }
  ];

  return (
    <section id="features" className="py-20 relative bg-slate-950/40 border-t border-b border-purple-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <span className="text-xs font-semibold text-purple-400 uppercase tracking-widest">
            Capabilities
          </span>
          <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold font-display text-white">
            Engineered Specifically for Hindi Cinema & Video
          </h2>
          <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed">
            Generic translation tools produce awkward, robotic literal translations. SUBLYAI captures the soul, emotion, and cadence of Hindi storytelling.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800/80 hover:border-purple-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2.5 py-0.5 rounded border border-slate-700/60">
                      {feat.tag}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white">
                    {feat.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800/50 flex items-center gap-1.5 text-xs text-purple-300 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Production Grade</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Translation Quality Comparison Box */}
        <div className="mt-16 max-w-4xl mx-auto rounded-2xl border border-purple-500/30 bg-slate-900/80 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <Flame className="w-6 h-6 text-purple-400" />
            <h3 className="text-lg font-bold font-display text-white">
              Why Word-for-Word Machine Translation Fails for Hindi
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 text-xs">
              <span className="font-bold text-red-400 uppercase tracking-wider block mb-2">
                ❌ Generic AI / Literal Translation
              </span>
              <p className="font-mono text-slate-300">
                "Hindi: 'अपना मुँह बंद रख, वरना हाथ-पाँव तोड़ दूँगा!'"
              </p>
              <p className="text-red-300 font-medium mt-1">
                Literal: "Keep your mouth closed, otherwise I will break your hands and legs!"
              </p>
              <p className="text-slate-400 mt-2 text-[11px]">
                Sounds comical, stiff, and robotic. Completely ruins dramatic tension.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs">
              <span className="font-bold text-purple-300 uppercase tracking-wider block mb-2">
                ✅ SUBLYAI Natural Cinematic Translation
              </span>
              <p className="font-mono text-slate-300">
                "Hindi: 'अपना मुँह बंद रख, वरना हाथ-पाँव तोड़ दूँगा!'"
              </p>
              <p className="text-purple-200 font-bold mt-1">
                SUBLYAI: "Shut your mouth, or I will beat you to a pulp!"
              </p>
              <p className="text-purple-300/80 mt-2 text-[11px]">
                Preserves the authentic grit, intensity, and cinematic impact.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
