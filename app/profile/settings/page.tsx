'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [readingMode, setReadingMode] = useState('webtoon');
  const [quality, setQuality] = useState('high');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('mangaflow_reading_mode', readingMode);
    localStorage.setItem('mangaflow_image_quality', quality);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div className="border-b border-neutral-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Reader Settings</h1>
          <p className="text-xs text-neutral-400 mt-1">Configure your viewing, loading, and display preferences</p>
        </div>
        <Link href="/" className="text-xs text-neutral-400 hover:text-white transition">← Back</Link>
      </div>

      {saved && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold">
          Preferences saved locally!
        </div>
      )}

      <div className="bg-[#14161f] border border-neutral-800 rounded-xl p-5 space-y-5">
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Default Reading Mode</label>
          <select
            value={readingMode}
            onChange={(e) => setReadingMode(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
          >
            <option value="webtoon">Vertical Continuous (Webtoon/Manhwa)</option>
            <option value="single">Single Page (Standard Manga)</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Image Loading Quality</label>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
          >
            <option value="high">High Resolution (Original Uncompressed)</option>
            <option value="data-saver">Data Saver Mode</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg transition"
        >
          Save Preferences
        </button>
      </div>
    </main>
  );
}
