'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80';

interface BookmarkedSeries {
  id: string;
  series_id: string;
  created_at: string;
  series: {
    id: string;
    slug: string;
    title: string;
    cover_image_url: string | null;
    reading_mode: string | null;
    status: string | null;
  };
}

export default function ProfileFollowingPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkedSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  async function loadUserData() {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        setUser(null);
        setBookmarks([]);
        setLoading(false);
        return;
      }

      setUser(authData.user);

      // Fetch user bookmarked series
      const { data, error } = await supabase
        .from('user_follows')
        .select(`
          id,
          series_id,
          created_at,
          series (
            id,
            slug,
            title,
            cover_image_url,
            reading_mode,
            status
          )
        `)
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted = (data || [])
        .filter((item) => item.series)
        .map((item) => ({
          ...item,
          series: Array.isArray(item.series) ? item.series[0] : item.series,
        }));

      setBookmarks(formatted as any);
    } catch (err) {
      console.error('Failed to load following library:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUserData();
  }, []);

  const handleRemoveBookmark = async (seriesId: string) => {
    if (!user) return;

    // Optimistically remove from UI state so it disappears instantly
    setBookmarks((prev) => prev.filter((b) => b.series_id !== seriesId));

    try {
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('user_id', user.id)
        .eq('series_id', seriesId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to remove bookmark:', err);
      // Reload on failure to sync back
      loadUserData();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBookmarks([]);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-xs text-neutral-500">
        Loading followed series...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-bold text-white mb-2">My Following</h1>
        <p className="text-xs text-neutral-400 mb-4">
          Sign in to view your bookmarks, reading library, and account preferences.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition shadow-md"
        >
          Sign In / Register
        </button>
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => {
            setShowAuthModal(false);
            loadUserData();
          }}
        />
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* User Header Profile Card */}
      <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-xl font-black text-white shadow-lg">
            {user.email ? user.email[0].toUpperCase() : 'U'}
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{user.email}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {bookmarks.length} Bookmarked {bookmarks.length === 1 ? 'Series' : 'Series'}
            </p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="px-3.5 py-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition"
        >
          Sign Out
        </button>
      </div>

      {/* Bookmarked Library Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-sm"></span>
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Bookmarked Series
            </h1>
          </div>
          <span className="text-xs text-neutral-400">{bookmarks.length} Titles</span>
        </div>

        {bookmarks.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800/80 bg-[#12141c] p-12 text-center space-y-3">
            <p className="text-sm font-semibold text-neutral-300">No bookmarked series yet</p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Click &ldquo;+ Bookmark Series&rdquo; on any manga or manhwa details page to save it here.
            </p>
            <Link
              href="/"
              className="inline-block mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition shadow-md"
            >
              Browse Catalog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {bookmarks.map((b) => {
              const s = b.series;
              const cover = s.cover_image_url || FALLBACK_COVER;

              return (
                <div
                  key={b.id}
                  className="group relative flex flex-col rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 hover:border-indigo-500/50 transition shadow-lg"
                >
                  <Link
                    href={`/series/${s.slug || s.id}`}
                    className="relative aspect-[3/4.2] w-full overflow-hidden block"
                  >
                    <img
                      src={cover}
                      alt={s.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_COVER;
                      }}
                    />
                    <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                      {s.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                    </span>
                  </Link>

                  <div className="p-2.5 flex flex-col justify-between flex-1 space-y-2">
                    <Link href={`/series/${s.slug || s.id}`}>
                      <h3 className="text-xs font-semibold text-neutral-200 line-clamp-1 hover:text-indigo-400 transition">
                        {s.title}
                      </h3>
                    </Link>

                    <button
                      onClick={() => handleRemoveBookmark(s.id)}
                      className="w-full py-1 text-[10px] font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
