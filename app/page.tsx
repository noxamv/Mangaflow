// app/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import SeriesActionModal from '../components/SeriesActionModal';
import { getAllLocalHistory } from '../lib/useReadingHistory';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%2313151f'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='15px' fill='%236366f1' font-weight='bold'%3EMangaFlow%3C/text%3E%3C/svg%3E";

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string | null;
  synopsis: string | null;
  cover_image_url: string | null;
  cover_url?: string | null;
  reading_mode: string | null;
}

interface ContinueItem {
  series_id: string;
  chapter_id: string;
  chapter_number: number;
  series: SeriesItem;
}

function SafeImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [imgSrc, setImgSrc] = useState<string>(src || FALLBACK_POSTER);

  useEffect(() => {
    setImgSrc(src || FALLBACK_POSTER);
  }, [src]);

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading="lazy"
      onError={() => setImgSrc(FALLBACK_POSTER)}
      className={className}
    />
  );
}

export default function HomePage() {
  const [spotlight, setSpotlight] = useState<SeriesItem[]>([]);
  const [trending, setTrending] = useState<SeriesItem[]>([]);
  const [latest, setLatest] = useState<SeriesItem[]>([]);
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick Action Modal State
  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  const openActionMenu = (e: React.MouseEvent, s: SeriesItem) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSeries(s);
    setActionModalOpen(true);
  };

  useEffect(() => {
    async function loadFeed() {
      setLoading(true);
      const baseCols =
        'id, slug, title, english_title, synopsis, cover_image_url, cover_url, reading_mode';

      try {
        const [spRes, trRes, ltRes] = await Promise.all([
          supabase.from('series').select(baseCols).order('rating', { ascending: false }).limit(6),
          supabase.from('series').select(baseCols).order('updated_at', { ascending: false }).limit(14),
          supabase.from('series').select(baseCols).order('created_at', { ascending: false }).limit(14),
        ]);

        if (spRes.data) setSpotlight(spRes.data as SeriesItem[]);
        if (trRes.data) setTrending(trRes.data as SeriesItem[]);
        if (ltRes.data) setLatest(ltRes.data as SeriesItem[]);

        // Check Local Storage + DB for reading history
        const localHist = getAllLocalHistory();
        const localItems = Object.values(localHist);

        if (localItems.length > 0) {
          const mapped: ContinueItem[] = localItems.slice(0, 6).map((item) => ({
            series_id: item.seriesId,
            chapter_id: item.chapterId,
            chapter_number: item.chapterNumber,
            series: {
              id: item.seriesId,
              slug: item.seriesSlug,
              title: item.seriesTitle,
              synopsis: null,
              cover_image_url: null,
              reading_mode: 'webtoon',
            },
          }));
          setContinueReading(mapped);
        }
      } finally {
        setLoading(false);
      }
    }

    loadFeed();
  }, []);

  const renderSeriesCard = (item: SeriesItem) => {
    const cover = item.cover_image_url || item.cover_url;
    const titleText = item.title || item.english_title || 'Untitled';

    return (
      <div key={item.id} className="relative group shrink-0 w-28 sm:w-36 flex flex-col space-y-1.5">
        <Link href={`/series/${item.slug}`} className="block">
          <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 shadow-md transition">
            <SafeImage
              src={cover}
              alt={titleText}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
            {item.reading_mode && (
              <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200 border border-white/10">
                {item.reading_mode === 'webtoon' ? 'MANHWA' : 'MANGA'}
              </span>
            )}
          </div>
          <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-indigo-400 line-clamp-1 transition pt-1">
            {titleText}
          </h3>
        </Link>

        {/* 3-Dot Quick Action Trigger */}
        <button
          type="button"
          onClick={(e) => openActionMenu(e, item)}
          aria-label="Open series options"
          className="absolute top-1 right-1 z-10 w-6 h-6 rounded-lg bg-black/70 hover:bg-black text-neutral-300 hover:text-white flex items-center justify-center text-xs backdrop-blur-sm border border-white/10 opacity-90 sm:opacity-0 group-hover:opacity-100 transition shadow-lg"
        >
          ⋮
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0d0e15] text-white pb-24">
      {/* Spotlight Hero Section */}
      {spotlight.length > 0 && (
        <div className="relative w-full bg-[#13151f] border-b border-neutral-800/80 py-8 px-4 sm:px-8">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-3 max-w-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                Spotlight Feature
              </span>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                {spotlight[0].title}
              </h1>
              {spotlight[0].synopsis && (
                <p className="text-xs sm:text-sm text-neutral-400 line-clamp-3 leading-relaxed">
                  {spotlight[0].synopsis}
                </p>
              )}
              <div className="pt-2 flex items-center gap-3">
                <Link
                  href={`/series/${spotlight[0].slug}`}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs sm:text-sm rounded-xl transition shadow-lg shadow-indigo-600/30"
                >
                  Read Now →
                </Link>
                <button
                  type="button"
                  onClick={(e) => openActionMenu(e, spotlight[0])}
                  className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs rounded-xl font-semibold transition"
                >
                  Quick Options ⋮
                </button>
              </div>
            </div>

            <div className="w-32 sm:w-44 aspect-[3/4.2] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-neutral-900 shrink-0">
              <SafeImage
                src={spotlight[0].cover_image_url || spotlight[0].cover_url}
                alt={spotlight[0].title}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-10">
        {/* Continue Reading Shelf (Device Storage Powered) */}
        {continueReading.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>📖</span> Continue Reading
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {continueReading.map((item) => (
                <Link
                  key={item.series_id}
                  href={`/read/${item.chapter_id}`}
                  className="shrink-0 p-3 bg-[#13151f] hover:bg-neutral-800/80 border border-neutral-800 rounded-xl flex items-center gap-3 transition min-w-[200px]"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 font-black flex items-center justify-center text-xs">
                    ▶
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-white truncate">{item.series.title}</p>
                    <p className="text-[10px] text-neutral-400">Ch. {item.chapter_number}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Trending Shelf */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>🔥</span> Trending Titles
            </h2>
            <Link href="/trending" className="text-xs text-indigo-400 hover:underline">
              View All →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
            {trending.map(renderSeriesCard)}
          </div>
        </div>

        {/* Latest Releases Shelf */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>⚡</span> Latest Releases
            </h2>
            <Link href="/latest" className="text-xs text-indigo-400 hover:underline">
              View All →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
            {latest.map(renderSeriesCard)}
          </div>
        </div>
      </div>

      {/* Universal Quick Action Modal */}
      <SeriesActionModal
        series={selectedSeries}
        isOpen={actionModalOpen}
        onClose={() => {
          setActionModalOpen(false);
          setSelectedSeries(null);
        }}
      />
    </div>
  );
}
