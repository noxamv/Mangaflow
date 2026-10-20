'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// High-speed dark fallback placeholder
const FALLBACK_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%2313151f'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14px' fill='%234f46e5' font-weight='bold'%3EMangaFlow%3C/text%3E%3C/svg%3E";

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string | null;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
}

interface ContinueItem {
  series_id: string;
  chapter_id: string;
  chapter_number: number;
  series: SeriesItem;
}

function getCover(item: any): string {
  const url = item?.cover_image_url || item?.cover_url;
  if (!url || typeof url !== 'string' || url.trim() === '' || url.includes('unsplash')) {
    return FALLBACK_COVER;
  }
  return url;
}

export default function HomePage() {
  const [continueList, setContinueList] = useState<ContinueItem[]>([]);
  const [trendingList, setTrendingList] = useState<SeriesItem[]>([]);
  const [popularList, setPopularList] = useState<SeriesItem[]>([]);
  const [latestList, setLatestList] = useState<SeriesItem[]>([]);
  const [randomList, setRandomList] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Direct column select without heavy inner joins
      const baseCols = 'id, slug, title, english_title, synopsis, cover_image_url, reading_mode';

      try {
        const [trendingRes, popRes, latestRes, randomRes] = await Promise.all([
          supabase.from('series').select(baseCols).order('rating', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('followed_count', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('created_at', { ascending: false }).limit(10),
          supabase.from('series').select(baseCols).limit(20),
        ]);

        const sanitize = (list: any[]): SeriesItem[] =>
          (list || []).map((s) => ({
            id: s.id,
            slug: s.slug || s.id,
            title: s.english_title || s.title,
            english_title: s.english_title,
            synopsis: s.synopsis,
            cover_image_url: s.cover_image_url,
            reading_mode: s.reading_mode,
          }));

        setTrendingList(sanitize(trendingRes.data || []));
        setPopularList(sanitize(popRes.data || []));
        setLatestList(sanitize(latestRes.data || []));
        setRandomList(sanitize(randomRes.data || []).sort(() => 0.5 - Math.random()).slice(0, 10));

        // Instant Local Reading History (Works for guests and offline users)
        if (typeof window !== 'undefined') {
          try {
            const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
            const items = Object.values(local).map((item: any) => ({
              series_id: item.seriesId,
              chapter_id: item.chapterId,
              chapter_number: item.chapterNumber,
              series: {
                id: item.seriesId,
                slug: item.seriesSlug,
                title: item.seriesTitle,
                english_title: item.seriesTitle,
                cover_image_url: item.coverUrl,
                synopsis: null,
                reading_mode: 'manga',
              },
            }));
            setContinueList(items as any);
          } catch {}
        }
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const Row = ({ title, items, color }: { title: string; items: SeriesItem[]; color: string }) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between px-3 sm:px-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-4 ${color} rounded-sm`} />
            <h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>
          </div>
          <Link href="/browse" className="text-[11px] font-semibold text-neutral-400 hover:text-indigo-400">
            View all →
          </Link>
        </div>

        <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0">
          {items.map((item) => (
            <Link key={item.id} href={`/series/${item.slug}`} className="shrink-0 w-28 sm:w-36 flex flex-col group">
              <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition">
                <img
                  src={getCover(item)}
                  alt={item.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_COVER; }}
                />
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200">
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400">
                {item.title}
              </h3>
            </Link>
          ))}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-xs text-neutral-500">
        Loading library...
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8">
      {/* Continue Reading Section */}
      {continueList.length > 0 && (
        <section className="space-y-3 px-3 sm:px-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-sm" />
            <h2 className="text-sm sm:text-base font-bold text-white">Continue Reading</h2>
          </div>
          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2">
            {continueList.map((entry) => (
              <Link key={entry.series_id} href={`/read/${entry.chapter_id}`} className="shrink-0 w-28 sm:w-36 flex flex-col group">
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800">
                  <img src={getCover(entry.series)} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-black/90 text-emerald-400">
                    Ch. {entry.chapter_number}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5">{entry.series?.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Row title="Trending Series" items={trendingList} color="bg-amber-500" />
      <Row title="Popular Series" items={popularList} color="bg-indigo-500" />
      <Row title="Latest Updates" items={latestList} color="bg-cyan-500" />
      <Row title="Random Recommendations" items={randomList} color="bg-emerald-500" />
    </main>
  );
}
