'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function ImportExportPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const [follows, history] = await Promise.all([
        supabase.from('user_follows').select('series_id, series:series_id(title, slug)').eq('user_id', auth.user.id),
        supabase.from('reading_history').select('series_id, chapter_number, updated_at, series:series_id(title, slug)').eq('user_id', auth.user.id),
      ]);

      const backup = {
        version: 1,
        exported_at: new Date().toISOString(),
        follows: follows.data || [],
        reading_history: history.data || [],
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mangaflow-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Export generated successfully!');
    } catch {
      setMsg('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const text = await file.text();
      const data = JSON.parse(text);

      if (Array.isArray(data.follows)) {
        for (const item of data.follows) {
          if (item.series_id) {
            await supabase.from('user_follows').upsert(
              { user_id: auth.user.id, series_id: item.series_id },
              { onConflict: 'user_id,series_id' }
            );
          }
        }
      }
      setMsg('Library imported successfully!');
    } catch {
      setMsg('Import failed. Invalid backup JSON file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div className="border-b border-neutral-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Import & Export</h1>
          <p className="text-xs text-neutral-400 mt-1">Backup or restore your followed comics and reading history</p>
        </div>
        <Link href="/" className="text-xs text-neutral-400 hover:text-white transition">← Back</Link>
      </div>

      {msg && (
        <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-200">
          {msg}
        </div>
      )}

      <div className="space-y-4">
        {/* Export Card */}
        <div className="bg-[#14161f] border border-neutral-800 rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Export Library</h2>
          <p className="text-xs text-neutral-400">
            Save a backup file of all your followed series, bookmarks, and read chapters to your device.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg transition"
          >
            {exporting ? 'Generating JSON...' : 'Download Backup JSON'}
          </button>
        </div>

        {/* Import Card */}
        <div className="bg-[#14161f] border border-neutral-800 rounded-xl p-5 space-y-3">
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">Restore Library</h2>
          <p className="text-xs text-neutral-400">
            Upload a MangaFlow backup JSON file to restore your bookmarks and history.
          </p>
          <label className="inline-block px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg cursor-pointer transition">
            {importing ? 'Importing data...' : 'Select Backup JSON File'}
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>
      </div>
    </main>
  );
}
