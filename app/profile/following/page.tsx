// app/profile/following/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';

interface FollowedItem {
  id: string;
  series_id: string;
  folder: string;
  created_at: string;
  series: {
    id: string;
    slug: string;
    title: string;
    english_title?: string;
    cover_image_url: string;
    cover_url?: string;
    reading_mode: string;
  };
}

const FOLDERS = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading' },
  { id: 'plan_to_read', label: 'Plan to Read' },
  { id: 'completed', label: 'Completed' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'dropped', label: 'Dropped' },
];

export default function FollowingPage() {
  const [items, setItems] = useState<FollowedItem[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadFollows() {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);

      const { data, error } = await supabase
        .from('user_follows')
        .select(`
          id,
          series_id,
          folder,
          created_at,
          series:series_id (
            id,
            slug,
            title,
            english_title,
            cover_image_url,
            cover_url,
            reading_mode
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setItems(data as unknown as FollowedItem[]);
      }
      setLoading(false);
    }

    loadFollows();
  }, [user]);

  const filteredItems = items.filter((item) => {
    if (activeFolder === 'all') return true;
    return item.folder === activeFolder;
  });

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-[#0d0e15] text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold mb-2">My Library</h1>
        <p className="text-neutral-400 text-sm mb-4">Sign in to track your reading lists and bookmarks.</p>
        <button
          onClick={() => setAuthOpen(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30"
        >
          Sign In / Register
        </button>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0e15] text-white pb-24 pt-6 px-4 sm:px-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
            <span>📚</span> My Library
          </h1>
          <p className="text-neutral-400 text-xs">Organize and track your active series.</p>
        </div>

        <Link
          href="/profile/sync"
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#13151f] hover:bg-neutral-800 border border-neutral-700/80 rounded-xl text-xs font-semibold text-neutral-300 transition self-start sm:self-auto"
        >
          <span>🔄</span> Sync AniList / MAL
        </Link>
      </div>

      {/* Folder Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeFolder === f.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-[#13151f] text-neutral-400 hover:text-white border border-neutral-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="py-24 flex justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        /* Empty State with 1-Click Migration Banner */
        <div className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4 my-12">
          <div className="text-4xl">📂</div>
          <div className="space-y-1">
            <h3 className="text-white font-bold text-base">No series in this folder yet</h3>
            <p className="text-neutral-400 text-xs leading-relaxed">
              Bookmark series from the catalog, or migrate your entire reading list automatically from other platforms.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <Link
              href="/profile/sync"
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30"
            >
              Import AniList / MAL →
            </Link>
            <Link
              href="/"
              className="w-full sm:w-auto px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold transition"
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
          {filteredItems.map((item) => {
            const cover = item.series?.cover_image_url || item.series?.cover_url;
            const title = item.series?.title || item.series?.english_title || 'Untitled';

            return (
              <Link
                key={item.id}
                href={`/series/${item.series?.slug}`}
                className="group flex flex-col space-y-1.5"
              >
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 shadow-md transition">
                  {cover ? (
                    <img
                      src={cover}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
                      No Art
                    </div>
                  )}
                  {item.series?.reading_mode && (
                    <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200 border border-white/10">
                      {item.series.reading_mode === 'webtoon' ? 'MANHWA' : 'MANGA'}
                    </span>
                  )}
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-indigo-400 line-clamp-1 transition">
                  {title}
                </h3>
              </Link>
            );
          })}
        </div>
      )}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
