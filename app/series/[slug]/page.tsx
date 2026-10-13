'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesDetail {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
  status?: string;
  rating?: number;
  followed_count?: number;
}

interface ChapterItem {
  id: string;
  chapter_number: number;
  title: string | null;
  created_at: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    async function fetchSeriesData() {
      if (!slug) return;
      setLoading(true);

      const { data: seriesData } = await supabase
        .from('series')
        .select('*')
        .eq('slug', slug)
        .single();

      if (seriesData) {
        setSeries(seriesData);

        const { data: chaptersData } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, created_at')
          .eq('series_id', seriesData.id)
          .order('chapter_number', { ascending: false });

        setChapters(chaptersData || []);

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: bookmark } = await supabase
            .from('user_bookmarks')
            .select('id')
            .eq('user_id', userData.user.id)
            .eq('series_id', seriesData.id)
            .maybeSingle();

          setIsBookmarked(!!bookmark);
        }
      }
      setLoading(false);
    }

    fetchSeriesData();
  }, [slug]);

  const toggleBookmark = async () => {
    if (!user) {
      alert('Please sign in to bookmark this title.');
      return;
    }
    if (!series) return;

    if (isBookmarked) {
      await supabase
        .from('user_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('series_id', series.id);
      setIsBookmarked(false);
    } else {
      await supabase
        .from('user_bookmarks')
        .insert({ user_id: user.id, series_id: series.id });
      setIsBookmarked(true);
    }
  };

  const filteredChapters = useMemo(() => {
    let result = [...chapters];
    if (searchChapter.trim()) {
      result = result.filter(
        (ch) =>
          ch.chapter_number.toString().includes(searchChapter.trim()) ||
          (ch.title && ch.title.toLowerCase().includes(searchChapter.toLowerCase()))
      );
    }
    result.sort((a, b) =>
      sortAsc ? a.chapter_number - b.chapter_number : b.chapter_number - a.chapter_number
    );
    return result;
  }, [chapters, searchChapter, sortAsc]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-xs text-neutral-400">
        Loading series...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <h2 className="text-lg font-bold text-white">Series Not Found</h2>
        <Link href="/" className="text-xs text-indigo-400 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  const firstChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

  return (
    <main className="min-h-screen bg-[#0b0c10] text-neutral-200 pb-20">
      {/* Blurred Ambient Backdrop Header */}
      <div className="relative w-full overflow-hidden bg-neutral-950 border-b border-neutral-800/80">
        {series.cover_image_url && (
          <div
            className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-125 opacity-20"
            style={{ backgroundImage: `url(${series.cover_image_url})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-black/80 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
          {/* Cover Art */}
          <div className="shrink-0 w-40 sm:w-56 aspect-[3/4.2] rounded-2xl overflow-hidden border border-neutral-700/80 shadow-2xl bg-neutral-900">
            {series.cover_image_url ? (
              <img
                src={series.cover_image_url}
                alt={series.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                No Cover
              </div>
            )}
          </div>

          {/* Details & CTAs */}
          <div className="flex-1 space-y-3.5 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {series.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {series.status || 'Ongoing'}
              </span>
            </div>

            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
              {series.title}
            </h1>

            <p className="text-xs sm:text-sm text-neutral-300 max-w-2xl leading-relaxed">
              {series.synopsis || 'No synopsis provided for this series.'}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3">
              {firstChapter && (
                <Link
                  href={`/read/${firstChapter.id}`}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition"
                >
                  Start Reading (Ch. {firstChapter.chapter_number})
                </Link>
              )}

              <button
                type="button"
                onClick={toggleBookmark}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition border ${
                  isBookmarked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700/80'
                }`}
              >
                <span>{isBookmarked ? '★ Bookmarked' : '☆ Bookmark'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Chapters Index Card */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-4 sm:p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Chapters</span>
              <span className="text-xs text-neutral-400 font-normal">
                ({chapters.length} available)
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search chapter number..."
                value={searchChapter}
                onChange={(e) => setSearchChapter(e.target.value)}
                className="flex-1 sm:w-56 bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 text-xs font-semibold rounded-xl transition flex items-center gap-1 shrink-0"
              >
                {sortAsc ? 'Ascending ↑' : 'Descending ↓'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-800/60 mt-2">
            {filteredChapters.length === 0 ? (
              <div className="text-center py-10 text-xs text-neutral-500">
                No matching chapters found.
              </div>
            ) : (
              filteredChapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/read/${ch.id}`}
                  className="flex items-center justify-between py-3 px-2 sm:px-3 hover:bg-neutral-800/40 rounded-xl transition group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 transition">
                      Chapter {ch.chapter_number}
                    </span>
                    {ch.title && (
                      <span className="text-xs text-neutral-400 truncate max-w-xs sm:max-w-md hidden sm:inline">
                        - {ch.title}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    {new Date(ch.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
