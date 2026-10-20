'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'sync'>('import');
  const [user, setUser] = useState<any>(null);
  const [importSource, setImportSource] = useState('MyAnimeList');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [username, setUsername] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const handleExport = async () => {
    if (!user) {
      setStatusMsg({ text: 'Please sign in to export your library.', error: true });
      return;
    }
    setStatusMsg(null);

    // Fixed: Queries user_follows instead of user_bookmarks
    const { data: follows, error } = await supabase
      .from('user_follows')
      .select('series_id, folder, created_at, series (id, title, slug, reading_mode)')
      .eq('user_id', user.id);

    if (error || !follows) {
      setStatusMsg({ text: 'Failed to export library.', error: true });
      return;
    }

    const payload = {
      app: 'MangaFlow',
      version: '1.0',
      exported_at: new Date().toISOString(),
      user: user.email,
      titles: follows.map((f: any) => ({
        id: f.series_id,
        title: f.series?.title,
        slug: f.series?.slug,
        folder: f.folder || 'reading',
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mangaflow-library-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg({ text: 'Library successfully exported!', error: false });
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-white">Import / Export / Sync</h1>
        <p className="text-xs text-neutral-400">
          Sync your manga library across MyAnimeList, AniList, ComicK, or backup file.
        </p>
      </div>

      <div className="flex bg-[#13151f] border border-neutral-800 rounded-2xl p-1 gap-1">
        {(['import', 'export', 'sync'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl capitalize transition ${
              activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className={`p-3 rounded-xl text-xs font-semibold ${statusMsg.error ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30' : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'}`}>
          {statusMsg.text}
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl p-6 space-y-5">
          <div>
            <label className="text-[10px] font-bold uppercase text-neutral-400 block mb-2">Source</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {['MyAnimeList', 'AniList', 'MangaUpdates', 'ComicK', 'File'].map((s) => (
                <button
                  key={s}
                  onClick={() => setImportSource(s)}
                  className={`py-2 rounded-xl text-xs font-bold transition ${
                    importSource === s ? 'bg-indigo-600 text-white' : 'bg-neutral-900 border border-neutral-800 text-neutral-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-neutral-400 block mb-1">
              {importSource === 'File' ? 'Upload Backup File (.json)' : `${importSource} Username`}
            </label>
            <input
              type={importSource === 'File' ? 'file' : 'text'}
              value={importSource === 'File' ? undefined : username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={`Enter ${importSource} public username...`}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-neutral-400 block mb-2">Import Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setImportMode('merge')}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  importMode === 'merge' ? 'bg-neutral-800 text-white border border-neutral-700' : 'bg-neutral-900 text-neutral-500 border border-neutral-800'
                }`}
              >
                Merge (Add to current)
              </button>
              <button
                onClick={() => setImportMode('replace')}
                className={`py-2 rounded-xl text-xs font-bold transition ${
                  importMode === 'replace' ? 'bg-neutral-800 text-white border border-neutral-700' : 'bg-neutral-900 text-neutral-500 border border-neutral-800'
                }`}
              >
                Replace (Overwrite current)
              </button>
            </div>
          </div>

          <button
            onClick={() => setStatusMsg({ text: `Import queued from ${importSource}!`, error: false })}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition shadow-lg"
          >
            Import to Library
          </button>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl p-6 text-center space-y-4">
          <p className="text-xs text-neutral-300">
            Export compiles your complete list of followed titles into a lightweight JSON file.
          </p>
          <button
            onClick={handleExport}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            Download Library Backup (.json)
          </button>
        </div>
      )}

      {activeTab === 'sync' && (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl p-6 space-y-4">
          <p className="text-xs text-neutral-300">Connect your AniList account to auto-sync chapter reads.</p>
          <input
            type="text"
            placeholder="e.g. ichigokurosaki04"
            className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-white outline-none"
          />
          <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl shadow-lg">
            Sync AniList Library
          </button>
        </div>
      )}
    </main>
  );
}
