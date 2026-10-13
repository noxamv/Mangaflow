'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function ImportExportPage() {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'anilist'>('import');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);

  // File import state
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  // AniList Tracker state
  const [anilistUsername, setAnilistUsername] = useState('');
  const [syncingAnilist, setSyncingAnilist] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  // 1. Export Library
  const handleExport = async () => {
    if (!user) return;
    setLoading(true);
    setStatusMsg(null);

    const { data: bookmarks, error } = await supabase
      .from('user_bookmarks')
      .select('series (id, title, slug, reading_mode)')
      .eq('user_id', user.id);

    if (error || !bookmarks) {
      setStatusMsg({ text: 'Failed to export library.', error: true });
      setLoading(false);
      return;
    }

    const payload = {
      app: 'MangaFlow',
      version: '1.0',
      exported_at: new Date().toISOString(),
      titles_count: bookmarks.length,
      titles: bookmarks.map((b: any) => ({
        title: b.series?.title,
        slug: b.series?.slug,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mangaflow-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    setStatusMsg({ text: `Exported ${bookmarks.length} titles successfully!`, error: false });
    setLoading(false);
  };

  // 2. Handle File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target?.result as string);
      setStatusMsg({ text: `File loaded: ${file.name}`, error: false });
    };
    reader.readAsText(file);
  };

  // 3. Process File Import
  const handleImportSubmit = async () => {
    if (!user) {
      setStatusMsg({ text: 'Please sign in to import titles.', error: true });
      return;
    }
    if (!fileContent) {
      setStatusMsg({ text: 'Please choose a file first.', error: true });
      return;
    }

    setLoading(true);
    setStatusMsg(null);

    try {
      const parsed = JSON.parse(fileContent);
      const titlesToMatch: string[] = Array.isArray(parsed.titles)
        ? parsed.titles.map((t: any) => (typeof t === 'string' ? t : t.title || t.slug))
        : [];

      if (titlesToMatch.length === 0) {
        throw new Error('No valid titles found in the uploaded file.');
      }

      if (importMode === 'replace') {
        await supabase.from('user_bookmarks').delete().eq('user_id', user.id);
      }

      let matchedCount = 0;
      for (const title of titlesToMatch) {
        const { data: matchedSeries } = await supabase
          .from('series')
          .select('id')
          .ilike('title', `%${title}%`)
          .limit(1)
          .maybeSingle();

        if (matchedSeries) {
          await supabase.from('user_bookmarks').upsert(
            { user_id: user.id, series_id: matchedSeries.id },
            { onConflict: 'user_id,series_id' }
          );
          matchedCount++;
        }
      }

      setStatusMsg({
        text: `Import complete! Matched and saved ${matchedCount} of ${titlesToMatch.length} titles.`,
        error: false,
      });
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Invalid backup file format.', error: true });
    } finally {
      setLoading(false);
    }
  };

  // 4. AniList One-Click Sync
  const handleAnilistSync = async () => {
    if (!anilistUsername.trim() || !user) return;
    setSyncingAnilist(true);
    setStatusMsg(null);

    const query = `
      query ($username: String) {
        MediaListCollection(userName: $username, type: MANGA) {
          lists {
            entries {
              media {
                title {
                  romaji
                  english
                }
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { username: anilistUsername.trim() } }),
      });

      const data = await res.json();
      const lists = data?.data?.MediaListCollection?.lists || [];
      let matched = 0;

      for (const list of lists) {
        for (const entry of list.entries) {
          const title = entry.media.title.english || entry.media.title.romaji;
          if (!title) continue;

          const { data: matchedSeries } = await supabase
            .from('series')
            .select('id')
            .ilike('title', `%${title}%`)
            .limit(1)
            .maybeSingle();

          if (matchedSeries) {
            await supabase.from('user_bookmarks').upsert(
              { user_id: user.id, series_id: matchedSeries.id },
              { onConflict: 'user_id,series_id' }
            );
            matched++;
          }
        }
      }

      setStatusMsg({
        text: `Synced successfully! Added ${matched} matching series from your AniList profile.`,
        error: false,
      });
    } catch (err: any) {
      setStatusMsg({ text: 'Failed to connect to AniList. Verify your username and retry.', error: true });
    } finally {
      setSyncingAnilist(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 min-h-screen text-neutral-100">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-black text-white">
          Import / Export / Sync
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Back up your followed titles or import an existing reading list into MangaFlow.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800 mb-6">
        <button
          type="button"
          onClick={() => { setActiveTab('import'); setStatusMsg(null); }}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'import'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Import
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('export'); setStatusMsg(null); }}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'export'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Export
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('anilist'); setStatusMsg(null); }}
          className={`px-5 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'anilist'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          AniList Sync
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-xl text-xs mb-6 border ${
            statusMsg.error
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Import View */}
      {activeTab === 'import' && (
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-5 space-y-5 shadow-xl">
          <div>
            <label className="text-xs font-bold text-white block mb-1">
              Upload Backup File (.json)
            </label>
            <p className="text-[11px] text-neutral-400 mb-3">
              Upload a MangaFlow or compatible reader backup file to sync your saved series.
            </p>
            <input
              type="file"
              accept=".json,.xml,.txt"
              onChange={handleFileChange}
              className="text-xs text-neutral-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700 cursor-pointer"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-white block mb-1.5">
              Import Mode
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImportMode('merge')}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                  importMode === 'merge'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                Merge (Add to current)
              </button>
              <button
                type="button"
                onClick={() => setImportMode('replace')}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                  importMode === 'replace'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                Replace (Overwrite current)
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || !fileContent}
            onClick={handleImportSubmit}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            {loading ? 'Processing Import...' : 'Import to Library'}
          </button>
        </div>
      )}

      {/* Export View */}
      {activeTab === 'export' && (
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
          <p className="text-xs text-neutral-300 leading-relaxed">
            Exporting compiles your complete list of followed titles into a lightweight JSON file. You can use this file to restore your bookmarks anytime or transfer them to another device.
          </p>
          <button
            type="button"
            disabled={loading || !user}
            onClick={handleExport}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2"
          >
            <span>⭳</span> {loading ? 'Generating...' : 'Download Library Backup (.json)'}
          </button>
        </div>
      )}

      {/* AniList Sync View */}
      {activeTab === 'anilist' && (
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-5 space-y-4 shadow-xl">
          <div>
            <label className="text-xs font-bold text-white block mb-1">
              AniList Public Username
            </label>
            <p className="text-[11px] text-neutral-400 mb-3">
              Enter your AniList profile handle to match and import manga/manhwa directly into your followed titles.
            </p>
            <input
              type="text"
              value={anilistUsername}
              onChange={(e) => setAnilistUsername(e.target.value)}
              placeholder="e.g. Ichigokurosaki04"
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            disabled={syncingAnilist || !anilistUsername.trim() || !user}
            onClick={handleAnilistSync}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
          >
            {syncingAnilist ? 'Connecting to AniList...' : 'Sync AniList Library'}
          </button>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link href="/profile/following" className="text-xs text-indigo-400 hover:underline">
          ← View My Followed Titles
        </Link>
      </div>
    </main>
  );
}
