'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface BookmarkItem {
  id: string;
  series: {
    id: string;
    slug: string;
    title: string;
    cover_image_url: string;
    reading_mode: string;
  };
}

export default function FollowingPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadBookmarks() {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      setUser(authData?.user || null);

      if (authData?.user) {
        const { data } = await supabase
          .from('user_bookmarks')
          .select('id, series (id, slug, title, cover_image_url, reading_mode)')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false });

        setBookmarks((data as any) || []);
      }
      setLoading(false);
    }
    loadBookmarks();
  }, []);

  const handleExportJSON = () => {
    const exportData = bookmarks.map((b) => ({
      title: b.series.title,
      slug: b.series.slug,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mangaflow-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const removeBookmark = async (bookmarkId: string) => {
    await supabase.from('user_bookmarks').delete().eq('id', bookmarkId);
    setBookmarks(bookmarks.filter((b) => b.id !== bookmarkId));
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-xs text-neutral-500">
        Loading followed titles...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <h2 className="text-sm font-bold text-white">Sign In Required</h2>
        <p className="text-xs text-neutral-400">Please sign in to view your followed titles.</p>
        <Link href="/" className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 min-h-screen text-neutral-100">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-neutral-800 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">
            Followed Titles
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            {bookmarks.length} titles saved in your library
          </p>
        </div>

        {bookmarks.length > 0 && (
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700/80 hover:bg-neutral-800 text-xs font-semibold text-neutral-200 transition flex items-center gap-1.5"
          >
            <span>⭳</span> Export Library (JSON)
          </button>
        )}
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-24 text-xs text-neutral-500">
          You haven&apos;t bookmarked any titles yet. Browse the catalog and tap ☆ Bookmark to follow your favorite series!
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4 mt-6">
          {bookmarks.map((item) => (
            <div key={item.id} className="relative group flex flex-col">
              <Link href={`/series/${item.series.slug}`} className="flex flex-col">
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition shadow-md">
                  {item.series.cover_image_url ? (
                    <img
                      src={item.series.cover_image_url}
                      alt={item.series.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">
                      No Cover
                    </div>
                  )}
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                    {item.series.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
                  {item.series.title}
                </h3>
              </Link>
              <button
                type="button"
                onClick={() => removeBookmark(item.id)}
                className="mt-1 text-[10px] text-neutral-500 hover:text-rose-400 transition text-left"
              >
                Remove from library
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
