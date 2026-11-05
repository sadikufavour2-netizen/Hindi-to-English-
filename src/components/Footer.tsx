import React from 'react';
import { Languages, Github, Shield, Heart } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-purple-900/20 bg-[#07080d] py-12 text-xs text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white">
              <Languages className="w-4 h-4" />
            </div>
            <span className="font-display font-extrabold text-base text-white">
              SUBLY<span className="text-purple-400">AI</span>
            </span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span className="text-slate-400">Watch Any Hindi Video in English</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap items-center gap-6 text-slate-400">
            <a href="#how-it-works" className="hover:text-purple-300 transition-colors">
              How It Works
            </a>
            <a href="#features" className="hover:text-purple-300 transition-colors">
              AI Engine
            </a>
            <a href="#upload-section" className="hover:text-purple-300 transition-colors">
              Upload Video
            </a>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span className="font-mono text-purple-400/80">Gemini 3.8 Flash Powered</span>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
          <p>© {new Date().getFullYear()} SUBLYAI. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span>Built with precision for Hindi cinema & video creators</span>
          </p>
        </div>
      </div>
    </footer>
  );
};
