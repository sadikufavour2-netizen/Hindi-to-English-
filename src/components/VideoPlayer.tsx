import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Subtitles, 
  Clock, 
  Download,
  Edit3,
  Sliders,
  Search,
  Plus,
  Trash2,
  Save,
  Check,
  Sparkles,
  Tv,
  Scan
} from 'lucide-react';
import type { SubtitleCue, SubtitleStyle } from '../types';

interface VideoPlayerProps {
  jobId?: string;
  videoUrl: string;
  subtitles: SubtitleCue[];
  styleConfig: SubtitleStyle;
  onStyleChange: (newStyle: SubtitleStyle) => void;
  onSubtitlesUpdate?: (newSubtitles: SubtitleCue[]) => void;
  onOpenEditor: () => void;
  onOpenDownload: () => void;
  title?: string;
  processingProgress?: number;
  processingStatusText?: string;
  isProcessing?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  jobId,
  videoUrl,
  subtitles,
  styleConfig,
  onStyleChange,
  onSubtitlesUpdate,
  onOpenEditor,
  onOpenDownload,
  title,
  processingProgress,
  processingStatusText,
  isProcessing
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'fit' | 'theatre'>('fit');
  const [subtitleMode, setSubtitleMode] = useState<'english' | 'hindi' | 'dual' | 'off'>('english');
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [activeCue, setActiveCue] = useState<SubtitleCue | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'transcript' | 'editor'>('transcript');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [inlineSaveSuccess, setInlineSaveSuccess] = useState(false);

  // Time formatting helper
  const formatTime = (time: number) => {
    if (isNaN(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Video event handlers
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * (videoRef.current.duration || 0);
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  // Update current time and calculate active subtitle cue
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    // Apply sync offset in seconds
    const offsetSec = styleConfig.syncOffset / 1000;
    const adjustedTime = time + offsetSec;

    // Find cue
    const current = subtitles.find(
      (cue) => adjustedTime >= cue.startTime && adjustedTime <= cue.endTime
    );
    setActiveCue(current || null);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  // Subtitle cue click in sidebar seeks video
  const handleCueClick = (cue: SubtitleCue) => {
    if (videoRef.current) {
      videoRef.current.currentTime = cue.startTime;
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Inline editing handlers
  const handleInlineTextChange = (id: string, field: 'englishText' | 'hindiText', value: string) => {
    if (!onSubtitlesUpdate) return;
    const updated = subtitles.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    onSubtitlesUpdate(updated);
  };

  const handleInlineTimeNudge = (id: string, delta: number) => {
    if (!onSubtitlesUpdate) return;
    const updated = subtitles.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          startTime: Math.max(0, Number((c.startTime + delta).toFixed(2))),
          endTime: Math.max(0.5, Number((c.endTime + delta).toFixed(2)))
        };
      }
      return c;
    });
    onSubtitlesUpdate(updated);
  };

  const handleInlineSaveToServer = async () => {
    if (!jobId) return;
    setIsSavingInline(true);
    try {
      await fetch(`/api/jobs/${jobId}/subtitles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles })
      });
      setInlineSaveSuccess(true);
      setTimeout(() => setInlineSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to sync inline changes', e);
    } finally {
      setIsSavingInline(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        skipTime(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        skipTime(5);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted]);

  const filteredSubtitles = subtitles.filter(
    (c) =>
      c.englishText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.hindiText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.speaker && c.speaker.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full h-full flex flex-col justify-start">
      {/* Fit to screen container layout */}
      <div className={`grid gap-4 items-start ${fitMode === 'theatre' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        
        {/* Main Video Screen (8 cols on large screen in fitMode) */}
        <div className={`flex flex-col ${fitMode === 'theatre' ? 'w-full' : 'lg:col-span-8'}`}>
          <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl shadow-purple-950/50 group select-none flex items-center justify-center max-h-[calc(100vh-220px)]"
          >
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain cursor-pointer"
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
              playsInline
            />

            {/* Subtitle Overlay */}
            {subtitleMode !== 'off' && activeCue && (
              <div
                className={`absolute left-3 right-3 sm:left-6 sm:right-6 text-center pointer-events-none transition-all duration-150 z-20 ${
                  styleConfig.position === 'top' ? 'top-6' : 'bottom-14 sm:bottom-16'
                }`}
              >
                <div
                  className="inline-block max-w-[92%] px-3.5 py-1.5 rounded-lg backdrop-blur-sm transition-all shadow-lg"
                  style={{
                    backgroundColor: styleConfig.bgColor,
                    color: styleConfig.textColor,
                    fontSize: `${styleConfig.fontSize}px`,
                    textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)',
                    lineHeight: 1.3
                  }}
                >
                  {/* Speaker Label */}
                  {activeCue.speaker && (
                    <span className="block text-[10px] font-semibold text-purple-300 tracking-wider uppercase mb-0.5 opacity-90">
                      {activeCue.speaker}
                    </span>
                  )}

                  {/* Hindi Source */}
                  {(subtitleMode === 'hindi' || subtitleMode === 'dual') && activeCue.hindiText && (
                    <p className={`font-normal ${subtitleMode === 'dual' ? 'text-xs text-amber-200/90 mb-0.5' : ''}`}>
                      {activeCue.hindiText}
                    </p>
                  )}

                  {/* English Translation */}
                  {(subtitleMode === 'english' || subtitleMode === 'dual') && (
                    <p className="font-semibold tracking-wide">
                      {activeCue.englishText}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Center Play Button Overlay on Pause */}
            {!isPlaying && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-purple-600/80 hover:bg-purple-600 text-white flex items-center justify-center backdrop-blur-md shadow-2xl transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
              >
                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
              </button>
            )}

            {/* Custom Video Controls Bar */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-3 sm:px-4 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
              {/* Timeline Progress Bar */}
              <div
                ref={timelineRef}
                onClick={handleSeek}
                className="w-full h-1.5 hover:h-2.5 bg-slate-700/60 rounded-full cursor-pointer relative mb-2.5 transition-all"
              >
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full relative"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                >
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform" />
                </div>
              </div>

              {/* Controls Row */}
              <div className="flex items-center justify-between gap-3 text-white text-xs">
                {/* Left Controls */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={togglePlay}
                    className="p-1 hover:text-purple-400 transition-colors cursor-pointer"
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
                  </button>

                  <button
                    onClick={() => skipTime(-10)}
                    className="p-1 hover:text-purple-400 transition-colors cursor-pointer hidden sm:block"
                    title="Rewind 10s (Left Arrow)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => skipTime(10)}
                    className="p-1 hover:text-purple-400 transition-colors cursor-pointer hidden sm:block"
                    title="Forward 10s (Right Arrow)"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>

                  {/* Volume */}
                  <div className="flex items-center gap-1.5 group/vol">
                    <button
                      onClick={toggleMute}
                      className="p-1 hover:text-purple-400 transition-colors cursor-pointer"
                      title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                    >
                      {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-red-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="w-12 sm:w-16 h-1 bg-slate-700 rounded-lg accent-purple-500 cursor-pointer hidden sm:block"
                    />
                  </div>

                  {/* Time Counter */}
                  <span className="font-mono text-[10px] sm:text-[11px] text-slate-300">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {/* Subtitle Toggle Mode */}
                  <button
                    onClick={() => {
                      const modes: ('english' | 'hindi' | 'dual' | 'off')[] = ['english', 'dual', 'hindi', 'off'];
                      const nextIdx = (modes.indexOf(subtitleMode) + 1) % modes.length;
                      setSubtitleMode(modes[nextIdx]);
                    }}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded border transition-all flex items-center gap-1 cursor-pointer ${
                      subtitleMode !== 'off'
                        ? 'bg-purple-950 border-purple-500/50 text-purple-300'
                        : 'bg-slate-900 border-slate-700 text-slate-500'
                    }`}
                    title="Cycle subtitle mode (English, Dual, Hindi, Off)"
                  >
                    <Subtitles className="w-3 h-3" />
                    <span className="uppercase">{subtitleMode}</span>
                  </button>

                  {/* Playback Speed */}
                  <div className="relative hidden sm:block">
                    <button
                      onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                      className="px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-300 hover:text-white bg-slate-800/80 rounded border border-slate-700 cursor-pointer"
                    >
                      {playbackRate}x
                    </button>
                    {showSpeedMenu && (
                      <div className="absolute bottom-8 right-0 bg-slate-900 border border-slate-700 rounded-lg shadow-xl p-1 flex flex-col gap-0.5 z-40 min-w-14">
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => handleSpeedSelect(rate)}
                            className={`px-2 py-1 text-left text-[11px] font-mono rounded ${
                              playbackRate === rate ? 'bg-purple-600 text-white font-bold' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subtitle Appearance Settings */}
                  <button
                    onClick={() => setShowStylePanel(!showStylePanel)}
                    className="p-1 hover:text-purple-400 text-slate-300 transition-colors cursor-pointer"
                    title="Subtitle Appearance Settings"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>

                  {/* Fit Screen / Theatre mode toggle */}
                  <button
                    onClick={() => setFitMode(fitMode === 'fit' ? 'theatre' : 'fit')}
                    className="p-1 hover:text-purple-400 text-slate-300 transition-colors cursor-pointer hidden lg:block"
                    title={fitMode === 'fit' ? 'Switch to Theatre Mode' : 'Fit to Screen Mode'}
                  >
                    <Tv className="w-3.5 h-3.5" />
                  </button>

                  {/* Fullscreen */}
                  <button
                    onClick={toggleFullscreen}
                    className="p-1 hover:text-purple-400 text-slate-300 transition-colors cursor-pointer"
                    title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
                  >
                    {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Subtitle Customization Panel */}
          {showStylePanel && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-900/95 border border-purple-500/30 backdrop-blur-md">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-purple-400" />
                  Subtitle Appearance & Sync Offset
                </h4>
                <button
                  onClick={() => setShowStylePanel(false)}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* Font Size */}
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Font Size</label>
                  <select
                    value={styleConfig.fontSize}
                    onChange={(e) => onStyleChange({ ...styleConfig, fontSize: Number(e.target.value) })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                  >
                    <option value={16}>Small (16px)</option>
                    <option value={20}>Medium (20px)</option>
                    <option value={24}>Large (24px)</option>
                    <option value={28}>Extra Large (28px)</option>
                  </select>
                </div>

                {/* Subtitle Color */}
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Text Color</label>
                  <select
                    value={styleConfig.textColor}
                    onChange={(e) => onStyleChange({ ...styleConfig, textColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                  >
                    <option value="#FFFFFF">Crisp White</option>
                    <option value="#FDE047">Cinema Yellow</option>
                    <option value="#38BDF8">Sky Cyan</option>
                    <option value="#A7F3D0">Mint Green</option>
                  </select>
                </div>

                {/* Background Box */}
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Background</label>
                  <select
                    value={styleConfig.bgColor}
                    onChange={(e) => onStyleChange({ ...styleConfig, bgColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                  >
                    <option value="rgba(0,0,0,0.85)">Semi-Transparent Black</option>
                    <option value="rgba(0,0,0,0.98)">Solid Black</option>
                    <option value="rgba(15,23,42,0.85)">Dark Indigo</option>
                    <option value="transparent">Transparent (Outline only)</option>
                  </select>
                </div>

                {/* Sync Timing Offset */}
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">
                    Sync Nudge: <span className="font-mono text-purple-400">{styleConfig.syncOffset}ms</span>
                  </label>
                  <div className="flex items-center gap-1">
                    {[-300, 0, 300].map((offset) => (
                      <button
                        key={offset}
                        onClick={() => onStyleChange({ ...styleConfig, syncOffset: offset })}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          styleConfig.syncOffset === offset
                            ? 'bg-purple-600 text-white border-purple-400'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {offset === 0 ? '0' : `${offset > 0 ? '+' : ''}${offset}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions Bar under Video */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-semibold text-white truncate max-w-[200px]">{title || 'Video Player'}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-purple-300 font-mono text-[11px]">{subtitles.length} Cues</span>
              {isProcessing && (
                <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 animate-spin" />
                  Generating...
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenEditor}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3 h-3 text-purple-400" />
                Full Editor
              </button>

              <button
                onClick={onOpenDownload}
                className="px-3 py-1 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Download className="w-3 h-3" />
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Live Subtitle Transcript & Inline Editor (4 cols in fitMode) */}
        <div className={`rounded-xl sm:rounded-2xl border border-purple-500/20 bg-slate-900/70 backdrop-blur-xl p-3.5 sm:p-4 flex flex-col h-[380px] sm:h-[440px] lg:h-[calc(100vh-220px)] max-h-[620px] ${fitMode === 'theatre' ? 'w-full' : 'lg:col-span-4'}`}>
          
          {/* Tabs: Live Transcript / Inline Editor */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 mb-2.5">
            <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
              <button
                onClick={() => setSidebarTab('transcript')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  sidebarTab === 'transcript'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Transcript
              </button>
              <button
                onClick={() => setSidebarTab('editor')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  sidebarTab === 'editor'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Quick Editor
              </button>
            </div>

            {sidebarTab === 'editor' ? (
              <button
                onClick={handleInlineSaveToServer}
                disabled={isSavingInline}
                className="px-2 py-1 text-[10px] font-bold rounded bg-purple-950 hover:bg-purple-900 border border-purple-500/40 text-purple-300 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {inlineSaveSuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3" />}
                {inlineSaveSuccess ? 'Saved' : isSavingInline ? 'Saving...' : 'Sync'}
              </button>
            ) : (
              <span className="text-[10px] font-mono text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/30">
                Click cue to seek
              </span>
            )}
          </div>

          {/* Search bar inside sidebar */}
          <div className="relative mb-2.5">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dialogue words..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Subtitle List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {filteredSubtitles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 text-xs">
                <Clock className="w-7 h-7 mb-2 text-slate-600 animate-pulse" />
                <p>Generating Hindi transcription and English translation...</p>
                <p className="text-[10px] text-slate-600 mt-1">Cues appear immediately as segments finish.</p>
              </div>
            ) : (
              filteredSubtitles.map((cue) => {
                const isCurrent = currentTime >= cue.startTime && currentTime <= cue.endTime;
                
                if (sidebarTab === 'editor') {
                  return (
                    <div
                      key={cue.id}
                      className={`p-2.5 rounded-lg border text-xs transition-all ${
                        isCurrent ? 'border-purple-500 bg-purple-950/40' : 'border-slate-800/80 bg-slate-950/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1 font-mono text-[10px] text-slate-400">
                        <span className="text-purple-400 font-bold">
                          {formatTime(cue.startTime)} → {formatTime(cue.endTime)}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleInlineTimeNudge(cue.id, -0.1)}
                            className="px-1 text-slate-400 hover:text-white bg-slate-800 rounded"
                            title="-0.1s"
                          >
                            -0.1s
                          </button>
                          <button
                            onClick={() => handleInlineTimeNudge(cue.id, 0.1)}
                            className="px-1 text-slate-400 hover:text-white bg-slate-800 rounded"
                            title="+0.1s"
                          >
                            +0.1s
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={1}
                        value={cue.englishText}
                        onChange={(e) => handleInlineTextChange(cue.id, 'englishText', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/60 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500 resize-none"
                      />
                    </div>
                  );
                }

                return (
                  <div
                    key={cue.id}
                    onClick={() => handleCueClick(cue)}
                    className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                      isCurrent
                        ? 'border-purple-500 bg-purple-950/60 shadow-md shadow-purple-900/30 text-white'
                        : 'border-slate-800/80 bg-slate-950/40 hover:bg-slate-900 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[10px] text-purple-400 font-semibold">
                        {formatTime(cue.startTime)} → {formatTime(cue.endTime)}
                      </span>
                      {cue.speaker && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {cue.speaker}
                        </span>
                      )}
                    </div>

                    {cue.hindiText && (
                      <p className="text-[10px] text-slate-400 font-normal mb-0.5 line-clamp-1">
                        {cue.hindiText}
                      </p>
                    )}

                    <p className={`font-semibold text-[11px] leading-snug ${isCurrent ? 'text-white' : 'text-slate-200'}`}>
                      {cue.englishText}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
