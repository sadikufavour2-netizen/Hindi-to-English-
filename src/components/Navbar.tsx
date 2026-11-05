import React from 'react';
import { Languages, Film, Sparkles, Upload } from 'lucide-react';
import type { TranslationJob } from '../types';

interface NavbarProps {
  onUploadClick: () => void;
  onSamplesClick: () => void;
  activeJob: TranslationJob | null;
  onOpenDashboard: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onUploadClick,
  onSamplesClick,
  activeJob,
  onOpenDashboard
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-[#0b0c14]/90 backdrop-blur-md border-b border-purple-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Brand Zone */}
        <a href="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 p-0.5 shadow-lg shadow-purple-500/20">
            <div className="w-full h-full bg-[#0b0c14] rounded-[10px] flex items-center justify-center">
              <Languages className="w-5 h-5 text-purple-400 group-hover:text-purple-300 transition-colors" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-display font-extrabold text-xl tracking-tight text-white group-hover:text-purple-200 transition-colors">
              SUBLY<span className="text-purple-400">AI</span>
            </span>
          </div>
        </a>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#how-it-works" className="hover:text-purple-400 transition-colors whitespace-nowrap shrink-0">
            How It Works
          </a>
          <a href="#features" className="hover:text-purple-400 transition-colors whitespace-nowrap shrink-0">
            Features
          </a>
          <button
            onClick={onSamplesClick}
            className="hover:text-purple-400 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer text-slate-300"
          >
            <Film className="w-4 h-4 text-purple-400" />
            Sample Clips
          </button>
          <a href="#faq" className="hover:text-purple-400 transition-colors whitespace-nowrap shrink-0">
            Formats & FAQ
          </a>
        </nav>

        {/* Primary Action Zone */}
        <div className="flex items-center gap-3 shrink-0">
          {activeJob && (
            <button
              onClick={onOpenDashboard}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-purple-950/60 text-purple-300 border border-purple-500/30 hover:bg-purple-900/40 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>Workspace: {activeJob.fileName.substring(0, 16)}...</span>
            </button>
          )}

          <button
            onClick={onUploadClick}
            className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-purple-600/25 transition-all duration-200 whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload Video
          </button>
        </div>
      </div>
    </header>
  );
};
