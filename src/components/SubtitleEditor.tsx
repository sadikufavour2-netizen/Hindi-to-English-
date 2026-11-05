import React, { useState } from 'react';
import { 
  Edit3, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  Clock, 
  Sparkles, 
  Check, 
  Sliders, 
  X,
  Volume2
} from 'lucide-react';
import type { SubtitleCue, SubtitleStyle } from '../types';

interface SubtitleEditorProps {
  jobId: string;
  subtitles: SubtitleCue[];
  styleConfig: SubtitleStyle;
  onSubtitlesUpdate: (newSubtitles: SubtitleCue[]) => void;
  onStyleChange: (newStyle: SubtitleStyle) => void;
  onClose: () => void;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  jobId,
  subtitles,
  styleConfig,
  onSubtitlesUpdate,
  onStyleChange,
  onClose
}) => {
  const [editedCues, setEditedCues] = useState<SubtitleCue[]>(JSON.parse(JSON.stringify(subtitles)));
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = (sec % 60).toFixed(2);
    return `${mins}:${Number(remainder) < 10 ? '0' : ''}${remainder}`;
  };

  const handleTextChange = (id: string, field: 'englishText' | 'hindiText' | 'speaker', value: string) => {
    setEditedCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleTimeAdjust = (id: string, field: 'startTime' | 'endTime', delta: number) => {
    setEditedCues((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const newVal = Math.max(0, Number((c[field] + delta).toFixed(2)));
          return { ...c, [field]: newVal };
        }
        return c;
      })
    );
  };

  const handleDeleteCue = (id: string) => {
    setEditedCues((prev) => prev.filter((c) => c.id !== id));
  };

  const handleAddCue = () => {
    const lastCue = editedCues[editedCues.length - 1];
    const newStart = lastCue ? Number((lastCue.endTime + 0.5).toFixed(2)) : 0;
    const newEnd = Number((newStart + 3.0).toFixed(2));

    const newCue: SubtitleCue = {
      id: `cue_custom_${Date.now()}`,
      startTime: newStart,
      endTime: newEnd,
      speaker: 'Speaker',
      hindiText: '',
      englishText: 'Enter English translation here...'
    };

    setEditedCues((prev) => [...prev, newCue]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/jobs/${jobId}/subtitles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles: editedCues })
      });

      if (!res.ok) throw new Error('Failed to save subtitles');
      const data = await res.json();
      onSubtitlesUpdate(data.subtitles || editedCues);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save changes to the server.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCues = editedCues.filter(
    (c) =>
      c.englishText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.hindiText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.speaker && c.speaker.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#0e101a] border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display text-white">Subtitle & Dialogue Editor</h2>
              <p className="text-xs text-slate-400">
                Correct phrases, adjust frame timestamps, or fine-tune English translations.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {saveSuccess ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
              {saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save & Sync'}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Search, Add, Subtitle styling */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Hindi or English dialogue..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleAddCue}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-purple-400" />
              Add Cue
            </button>

            <span className="text-slate-400 font-mono">
              Total Cues: {editedCues.length}
            </span>
          </div>
        </div>

        {/* Subtitle Rows List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {filteredCues.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No matching dialogue lines found.
            </div>
          ) : (
            filteredCues.map((cue, idx) => (
              <div
                key={cue.id}
                className="p-4 rounded-xl border border-slate-800/80 bg-slate-950/60 hover:border-purple-500/40 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60 text-xs">
                  {/* Sequence & Speaker */}
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-purple-950/80 text-purple-400 border border-purple-500/30 flex items-center justify-center font-mono font-bold text-[11px]">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={cue.speaker || ''}
                      onChange={(e) => handleTextChange(cue.id, 'speaker', e.target.value)}
                      placeholder="Speaker Name"
                      className="bg-slate-900 border border-slate-700/60 rounded px-2 py-1 text-slate-300 font-medium text-xs w-32 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Timing Adjusters */}
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <span className="text-slate-400">Start:</span>
                      <span className="text-purple-300">{formatSeconds(cue.startTime)}s</span>
                      <button
                        onClick={() => handleTimeAdjust(cue.id, 'startTime', -0.1)}
                        className="px-1 text-slate-400 hover:text-white"
                        title="-0.1s"
                      >
                        -
                      </button>
                      <button
                        onClick={() => handleTimeAdjust(cue.id, 'startTime', 0.1)}
                        className="px-1 text-slate-400 hover:text-white"
                        title="+0.1s"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <span className="text-slate-400">End:</span>
                      <span className="text-purple-300">{formatSeconds(cue.endTime)}s</span>
                      <button
                        onClick={() => handleTimeAdjust(cue.id, 'endTime', -0.1)}
                        className="px-1 text-slate-400 hover:text-white"
                        title="-0.1s"
                      >
                        -
                      </button>
                      <button
                        onClick={() => handleTimeAdjust(cue.id, 'endTime', 0.1)}
                        className="px-1 text-slate-400 hover:text-white"
                        title="+0.1s"
                      >
                        +
                      </button>
                    </div>

                    {/* Delete cue */}
                    <button
                      onClick={() => handleDeleteCue(cue.id)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete this cue"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Dialogue Text Inputs */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Original Spoken Hindi / Hinglish Dialogue
                    </label>
                    <textarea
                      rows={2}
                      value={cue.hindiText}
                      onChange={(e) => handleTextChange(cue.id, 'hindiText', e.target.value)}
                      placeholder="Spoken Hindi dialogue..."
                      className="w-full bg-slate-900/90 border border-slate-700/60 rounded-lg p-2 text-xs text-amber-200/90 focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-purple-300 block mb-1">
                      Natural English Translation (Subtitles)
                    </label>
                    <textarea
                      rows={2}
                      value={cue.englishText}
                      onChange={(e) => handleTextChange(cue.id, 'englishText', e.target.value)}
                      placeholder="Natural English translation..."
                      className="w-full bg-slate-900/90 border border-purple-500/40 rounded-lg p-2 text-xs text-white font-medium focus:outline-none focus:border-purple-400"
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Edits are immediately applied to the live video player & downloadable files.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer"
          >
            Done Editing
          </button>
        </div>
      </div>
    </div>
  );
};
