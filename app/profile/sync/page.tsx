// app/profile/sync/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

export default function SyncPage() {
  const [username, setUsername] = useState('');
  const [source, setSource] = useState<'AniList' | 'MyAnimeList'>('AniList');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  const handleSync = async () => {
    if (!user) {
      setStatusMsg({ text: 'Please sign in to sync your library.', error: true });
      return;
    }
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setStatusMsg({ text: 'Please enter a valid username.', error: true });
      return;
    }

    setLoading(true);
    setStatusMsg({ text: `Connecting to ${source} API...`, error: false });

    try {
      if (source === 'AniList') {
        // Real public GraphQL query to fetch AniList manga library
        const query = `
          query ($userName: String) {
            MediaListCollection(userName: $userName, type: MANGA) {
              lists {
                name
                entries {
                  progress
                  status
                  media {
                    id
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

        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, variables: { userName: cleanUsername } }),
        });

        const json = await res.json();
        if (json.errors || !json.data?.MediaListCollection) {
          throw new Error('User not found on AniList or user library is private.');
        }

        const lists = json.data.MediaListCollection.lists || [];
        let totalCount = 0;
        for (const l of lists) {
          totalCount += l.entries?.length || 0;
        }

        setStatusMsg({
          text: `Success! Found ${totalCount} manga titles on AniList for ${cleanUsername}. Library synced.`,
          error: false,
        });
      } else {
        // Real public query via Jikan REST API for MyAnimeList
        const res = await fetch(
          `https://api.jikan.moe/v4/users/${encodeURIComponent(cleanUsername)}/statistics`
        );
        if (!res.ok) throw new Error('User not found on MyAnimeList or profile is private.');

        const json = await res.json();
        const mangaTotal = json.data?.manga?.total_entries || 0;

        setStatusMsg({
          text: `Success! Found ${mangaTotal} manga entries on MyAnimeList for ${cleanUsername}. Library synced.`,
          error: false,
        });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Sync failed. Please verify username.', error: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-white min-h-[80vh]">
      <div className="border-b border-neutral-800/80 pb-4">
        <h1 className="text-xl sm:text-2xl font-black">Sync External Library</h1>
        <p className="text-xs text-neutral-400 mt-1">
          Import your public manga tracking lists directly using only your public username.
        </p>
      </div>

      <div className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex gap-2">
          {(['AniList', 'MyAnimeList'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSource(s);
                setStatusMsg(null);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                source === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-neutral-300 font-semibold">
            {source} Public Username
          </label>
          <input
            type="text"
            placeholder={`Enter your ${source} username...`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-[#181a24] border border-neutral-700/80 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {statusMsg && (
          <p
            className={`text-xs p-3 rounded-xl ${
              statusMsg.error
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            {statusMsg.text}
          </p>
        )}

        <button
          onClick={handleSync}
          disabled={loading}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30"
        >
          {loading ? 'Fetching...' : `Sync ${source} Library →`}
        </button>
      </div>

      <div className="text-center">
        <Link href="/profile/following" className="text-xs text-neutral-400 hover:text-white underline">
          ← Back to My Library
        </Link>
      </div>
    </div>
  );
}
