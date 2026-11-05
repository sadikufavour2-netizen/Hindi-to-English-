import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { VideoUploader } from './components/VideoUploader';
import { VideoPlayer } from './components/VideoPlayer';
import { SubtitleEditor } from './components/SubtitleEditor';
import { DownloadOptions } from './components/DownloadOptions';
import { HowItWorks } from './components/HowItWorks';
import { FeaturesSection } from './components/FeaturesSection';
import { SampleVideosModal } from './components/SampleVideosModal';
import { Footer } from './components/Footer';
import { 
  ArrowLeft, 
  Sparkles, 
  Download, 
  Edit3, 
  Upload, 
  RotateCw, 
  CheckCircle2, 
  FileVideo,
  Layers
} from 'lucide-react';
import type { TranslationJob, SubtitleStyle, SubtitleCue } from './types';

export default function App() {
  const [activeJob, setActiveJob] = useState<TranslationJob | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isSamplesModalOpen, setIsSamplesModalOpen] = useState(false);
  const [showLandingUnderneath, setShowLandingUnderneath] = useState(false);

  // Subtitle styling options
  const [styleConfig, setStyleConfig] = useState<SubtitleStyle>({
    fontSize: 20,
    textColor: '#FFFFFF',
    bgColor: 'rgba(0,0,0,0.85)',
    position: 'bottom',
    syncOffset: 0
  });

  // Polling active job status & progressive subtitles
  useEffect(() => {
    if (!activeJob) return;

    const isRunning = ['uploading', 'extracting_audio', 'detecting_speech', 'translating', 'synchronizing'].includes(
      activeJob.status
    );

    if (!isRunning) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${activeJob.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.job) {
          setActiveJob(data.job);
        }
      } catch (err) {
        console.error('Job polling error:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeJob?.id, activeJob?.status]);

  const handleJobCreated = (job: TranslationJob) => {
    setActiveJob(job);
    setShowLandingUnderneath(false);
  };

  const handleSubtitlesUpdate = (newSubtitles: SubtitleCue[]) => {
    if (activeJob) {
      setActiveJob({
        ...activeJob,
        subtitles: newSubtitles
      });
    }
  };

  const handleRetryJob = async () => {
    if (!activeJob) return;
    try {
      const res = await fetch(`/api/jobs/${activeJob.id}/start`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setActiveJob(data.job);
      }
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const handleResetToNewUpload = () => {
    setActiveJob(null);
    setShowLandingUnderneath(false);
  };

  const scrollToUpload = () => {
    const el = document.getElementById('upload-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isJobProcessing = activeJob
    ? ['uploading', 'extracting_audio', 'detecting_speech', 'translating', 'synchronizing'].includes(activeJob.status)
    : false;

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0c14] text-slate-100 antialiased selection:bg-purple-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onUploadClick={handleResetToNewUpload}
        onSamplesClick={() => setIsSamplesModalOpen(true)}
        activeJob={activeJob}
        onOpenDashboard={() => setShowLandingUnderneath(false)}
      />

      {/* Main Content View Switch: FIT TO SCREEN STUDIO or LANDING */}
      {activeJob && !showLandingUnderneath ? (
        /* Dedicated Fit-To-Screen Translation Studio */
        <div className="flex-1 flex flex-col overflow-hidden max-h-[calc(100vh-4rem)]">
          {/* Studio Header Bar */}
          <div className="shrink-0 bg-slate-950/80 border-b border-purple-900/30 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 backdrop-blur-md">
            {/* Left: Back & Video Details */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleResetToNewUpload}
                className="px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Upload another video"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Upload New</span>
              </button>

              <div className="h-4 w-px bg-slate-800 hidden sm:block" />

              <div className="flex items-center gap-2">
                <FileVideo className="w-4 h-4 text-purple-400 shrink-0" />
                <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md">
                  {activeJob.fileName}
                </span>
                {activeJob.duration > 0 && (
                  <span className="text-[11px] font-mono text-slate-400 hidden md:inline">
                    · ~{Math.round(activeJob.duration)}s
                  </span>
                )}
              </div>
            </div>

            {/* Middle: Compact Processing Status & Progress */}
            <div className="flex items-center gap-2.5 text-xs">
              {isJobProcessing ? (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-950/70 border border-purple-500/30 text-purple-200">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  <span className="font-medium text-[11px] truncate max-w-[200px] sm:max-w-xs">
                    {activeJob.currentStepText}
                  </span>
                  <span className="font-mono text-purple-400 font-bold ml-1">
                    {activeJob.progress}%
                  </span>
                </div>
              ) : activeJob.status === 'completed' ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[11px] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Translation Complete ({activeJob.subtitles?.length || 0} Cues)</span>
                </div>
              ) : activeJob.status === 'error' ? (
                <button
                  onClick={handleRetryJob}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-200 text-[11px] font-medium hover:bg-red-900/80"
                >
                  <RotateCw className="w-3 h-3" />
                  <span>Retry Translation</span>
                </button>
              ) : null}
            </div>

            {/* Right: Actions & Overview toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditorOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">Editor</span>
              </button>

              <button
                onClick={() => setIsDownloadOpen(true)}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>

              <button
                onClick={() => setShowLandingUnderneath(true)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hidden xl:block"
                title="View How It Works & Features"
              >
                Info
              </button>
            </div>
          </div>

          {/* Fit to screen main workspace */}
          <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto lg:overflow-hidden flex flex-col justify-start">
            <VideoPlayer
              jobId={activeJob.id}
              videoUrl={activeJob.videoUrl}
              subtitles={activeJob.subtitles || []}
              styleConfig={styleConfig}
              onStyleChange={setStyleConfig}
              onSubtitlesUpdate={handleSubtitlesUpdate}
              onOpenEditor={() => setIsEditorOpen(true)}
              onOpenDownload={() => setIsDownloadOpen(true)}
              title={activeJob.fileName}
              processingProgress={activeJob.progress}
              processingStatusText={activeJob.currentStepText}
              isProcessing={isJobProcessing}
            />
          </div>
        </div>
      ) : (
        /* Standard Landing Page Mode (When no active video or when user requested info) */
        <main className="flex-1">
          {activeJob && showLandingUnderneath && (
            <div className="bg-purple-950/80 border-b border-purple-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-purple-200">
              <span className="flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                Active translation session: <strong className="text-white">{activeJob.fileName}</strong>
              </span>
              <button
                onClick={() => setShowLandingUnderneath(false)}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-md shadow-sm transition-all"
              >
                Return to Fit-To-Screen Studio →
              </button>
            </div>
          )}

          {/* Hero Section */}
          <Hero
            onUploadClick={scrollToUpload}
            onSampleClick={() => setIsSamplesModalOpen(true)}
          />

          {/* Ultra-Fast Video Upload Area */}
          <div className="py-8">
            <VideoUploader
              onJobCreated={handleJobCreated}
              onOpenSamples={() => setIsSamplesModalOpen(true)}
            />
          </div>

          {/* How It Works (6 Steps) */}
          <HowItWorks />

          {/* Features & Cultural Nuance Engine */}
          <FeaturesSection />

          {/* Footer */}
          <Footer />
        </main>
      )}

      {/* Subtitle Editor Modal */}
      {isEditorOpen && activeJob && (
        <SubtitleEditor
          jobId={activeJob.id}
          subtitles={activeJob.subtitles || []}
          styleConfig={styleConfig}
          onSubtitlesUpdate={handleSubtitlesUpdate}
          onStyleChange={setStyleConfig}
          onClose={() => setIsEditorOpen(false)}
        />
      )}

      {/* Download Options Modal (SRT, VTT, Burned MP4) */}
      {isDownloadOpen && activeJob && (
        <DownloadOptions
          job={activeJob}
          onClose={() => setIsDownloadOpen(false)}
        />
      )}

      {/* Sample Videos Selector Modal */}
      {isSamplesModalOpen && (
        <SampleVideosModal
          onSelectSample={handleJobCreated}
          onClose={() => setIsSamplesModalOpen(false)}
        />
      )}
    </div>
  );
}
