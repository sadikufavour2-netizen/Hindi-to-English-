import React, { useState, useEffect } from 'react';
import { Film, Play, Sparkles, X, Check, Loader2 } from 'lucide-react';
import type { TranslationJob, SampleVideo } from '../types';

interface SampleVideosModalProps {
  onSelectSample: (job: TranslationJob) => void;
  onClose: () => void;
}

export const SampleVideosModal: React.FC<SampleVideosModalProps> = ({
  onSelectSample,
  onClose
}) => {
  const [samples, setSamples] = useState<SampleVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/samples')
      .then((res) => res.json())
      .then((data) => {
        setSamples(data.samples || []);
      })
      .catch((err) => console.error('Failed to fetch samples:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleLoadSample = async (sampleId: string) => {
    setLoadingSampleId(sampleId);
    try {
      const res = await fetch(`/api/samples/${sampleId}/load`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to load sample');
      const data = await res.json();
      onSelectSample(data.job);
      onClose();
    } catch (err) {
      console.error('Sample load error:', err);
      alert('Failed to load sample video.');
    } finally {
      setLoadingSampleId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#0e101a] border border-purple-500/30 rounded-2xl shadow-2xl p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold font-display text-white">Select a Hindi Sample Video</h2>
              <p className="text-xs text-slate-400">
                Experience instant translation, live subtitle player, and the editor without uploading your own file.
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

        {/* Samples List */}
        <div className="mt-6 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400 mb-2" />
              Loading pre-packaged Hindi sample clips...
            </div>
          ) : (
            samples.map((sample) => (
              <div
                key={sample.id}
                className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0 text-purple-400 mt-0.5 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                        {sample.title}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-500/30">
                        {sample.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {sample.description}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 mt-2">
                      <span>Duration: {sample.duration}</span>
                      <span>·</span>
                      <span className="text-purple-400">{sample.subtitles.length} Subtitle Cues</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleLoadSample(sample.id)}
                  disabled={loadingSampleId === sample.id}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-md transition-all flex items-center gap-2 self-end sm:self-center shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {loadingSampleId === sample.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Load Clip & Translate
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
