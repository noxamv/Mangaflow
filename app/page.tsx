'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%230d0e14'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14px' fill='%23f59e0b' font-weight='bold'%3EMangaFlow%3C/text%3E%3C/svg%3E";

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

function resolveCoverUrl(item: any): string {
  if (!item) return FALLBACK_POSTER;
  const target = Array.isArray(item) ? item[0] : item;
  const url = target?.cover_image_url || target?.cover_url || '';
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return FALLBACK_POSTER;
  }
  return url;
}

function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [imgSrc, setImgSrc] = useState(src || FALLBACK_POSTER);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setImgSrc(src || FALLBACK_POSTER);
    setAttempt(0);
  }, [src]);

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      className={className}
      onError={() => {
        if (attempt === 0 && imgSrc && !imgSrc.includes('/api/proxy-image') && !imgSrc.startsWith('data:')) {
          setAttempt(1);
          setImgSrc(`/api/proxy-image?url=${encodeURIComponent(imgSrc)}`);
        } else if (attempt <= 1) {
          setAttempt(2);
          setImgSrc(FALLBACK_POSTER);
        }
      }}
    />
  );
}

function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];
  const coverUrl = resolveCoverUrl(current);
  const displayTitle = current.english_title || current.title;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-neutral-800 bg-[#0d0e14] shadow-2xl group">
      {/* Blurred background backdrop */}
      <div
        className="absolute inset-0 bg-cover bg-center filter blur-2xl scale-125 opacity-20 transition-all duration-700"
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#090a0d] via-[#090a0d]/80 to-transparent z-10" />

      {/* Slide Content */}
      <div className="relative z-20 w-full p-4 sm:p-7 flex items-center justify-between gap-4 min-h-[220px] sm:min-h-[280px]">
        <div className="flex-1 max-w-xl space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-md bg-neutral-900 text-neutral-300 border border-neutral-800">
              {current.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
          </div>

          <h2 className="text-sm sm:text-2xl font-black text-white line-clamp-2 tracking-tight">
            {displayTitle}
          </h2>

          <p className="text-[11px] sm:text-xs text-neutral-400 line-clamp-2 leading-relaxed">
            {current.synopsis || 'Read online for free in high definition on MangaFlow.'}
          </p>

          <div className="pt-2">
            <Link
              href={`/series/${current.slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs rounded-xl shadow-lg transition"
            >
              Read Now →
            </Link>
          </div>
        </div>

        {/* Poster thumbnail */}
        <div className="shrink-0 w-24 sm:w-36 aspect-[3/4.2] rounded-xl overflow-hidden border border-neutral-800 shadow-2xl bg-neutral-950">
          <SafeImage src={coverUrl} alt={displayTitle} className="w-full h-full object-cover" />
        </div>
      </div>

      {/* Pagination dots */}
      <div className="relative z-30 pb-3 flex items-center justify-center gap-1.5">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === i ? 'w-6 bg-amber-400' : 'w-1.5 bg-neutral-800 hover:bg-neutral-600'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function ShareBar() {
  const [copied, setCopied] = useState(false);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mangaflow.app';
  const shareText = 'Read free manga and manhwa on MangaFlow!';

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0d0e14] border border-neutral-800/80 px-4 py-2.5 rounded-xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">Share MangaFlow:</span>
      <div className="flex items-center gap-2">
        <a
          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg border border-neutral-800 transition"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        <a
          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-lg border border-[#25D366]/20 transition"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
        </a>
        <button onClick={copyUrl} className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 rounded-lg border border-neutral-800 transition">
          {copied ? '✓' : '🔗'}
        </button>
      </div>
    </div>
  );
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
      const baseCols = 'id, slug, title, english_title, synopsis, cover_image_url, reading_mode';

      try {
        const [trendingRes, popRes, latestRes, randomRes] = await Promise.all([
          supabase.from('series').select(baseCols).order('rating', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('followed_count', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('created_at', { ascending: false }).limit(12),
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

        let resolvedHistory: ContinueItem[] = [];

        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: historyData } = await supabase
            .from('reading_history')
            .select('series_id, chapter_id, chapter_number, series (id, slug, title, english_title, cover_image_url, reading_mode)')
            .eq('user_id', authData.user.id)
            .order('updated_at', { ascending: false })
            .limit(10);

          if (historyData && historyData.length > 0) {
            resolvedHistory = historyData.map((h: any) => {
              const sObj = Array.isArray(h.series) ? h.series[0] : h.series;
              return {
                series_id: h.series_id,
                chapter_id: h.chapter_id,
                chapter_number: h.chapter_number,
                series: sObj || {},
              };
            });
          }
        }

        if (resolvedHistory.length === 0 && typeof window !== 'undefined') {
          try {
            const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
            resolvedHistory = Object.values(local).map((item: any) => ({
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
          } catch {}
        }

        setContinueList(resolvedHistory);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Standard Horizontal Carousel Row
  const CarouselRow = ({
    title,
    viewAllHref,
    items,
    accentColor = 'bg-amber-400',
  }: {
    title: string;
    viewAllHref: string;
    items: SeriesItem[];
    accentColor?: string;
  }) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between px-3 sm:px-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-4 ${accentColor} rounded-full`} />
            <h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>
          </div>
          <Link href={viewAllHref} className="text-[11px] font-semibold text-neutral-400 hover:text-amber-400 transition">
            View all →
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0">
          {items.map((item) => {
            const coverUrl = resolveCoverUrl(item);

            return (
              <Link key={item.id} href={`/series/${item.slug}`} className="shrink-0 w-28 sm:w-36 flex flex-col group">
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-amber-400/50 transition">
                  <SafeImage
                    src={coverUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-300">
                    {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-amber-400 transition">
                  {item.title}
                </h3>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3 text-xs text-neutral-500">
        <div className="w-8 h-8 border-2 border-neutral-800 border-t-amber-400 rounded-full animate-spin" />
        <span>Loading library catalog...</span>
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8 pb-24 md:pb-12">
      {/* 1. Hero Spotlight Carousel */}
      <div className="px-3 sm:px-0">
        <SpotlightSlider items={trendingList.slice(0, 7)} />
      </div>

      {/* 2. Share Bar */}
      <div className="px-3 sm:px-0">
        <ShareBar />
      </div>

      {/* 3. Continue Reading Shelf (If available) */}
      {continueList.length > 0 && (
        <section className="space-y-3 px-3 sm:px-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-emerald-400 rounded-full" />
            <h2 className="text-sm sm:text-base font-bold text-white">Continue Reading</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {continueList.map((entry) => {
              const coverUrl = resolveCoverUrl(entry.series);

              return (
                <Link key={entry.series_id} href={`/read/${entry.chapter_id}`} className="shrink-0 w-28 sm:w-36 flex flex-col group">
                  <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800 group-hover:border-emerald-400/50 transition">
                    <SafeImage src={coverUrl} alt="" className="w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-black/90 text-emerald-400 border border-emerald-500/30">
                      Ch. {entry.chapter_number}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-emerald-400 transition">
                    {entry.series?.title}
                  </h3>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Trending Carousel */}
      <CarouselRow title="Trending Now" viewAllHref="/trending" items={trendingList} accentColor="bg-amber-400" />

      {/* 5. Popular Carousel */}
      <CarouselRow title="Popular Series" viewAllHref="/popular" items={popularList} accentColor="bg-amber-500" />

      {/* 6. Latest Updates - 2-Col Mobile / 6-Col Desktop Responsive Grid */}
      <section className="space-y-3 px-3 sm:px-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
            <h2 className="text-sm sm:text-base font-bold text-white">Latest Releases</h2>
          </div>
          <Link href="/latest" className="text-[11px] font-semibold text-neutral-400 hover:text-amber-400 transition">
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {latestList.slice(0, 12).map((item) => {
            const coverUrl = resolveCoverUrl(item);

            return (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="flex flex-col group bg-[#0d0e14] p-2 rounded-xl border border-neutral-800/80 hover:border-amber-400/40 transition"
              >
                <div className="relative aspect-[3/4.2] w-full rounded-lg overflow-hidden bg-neutral-950">
                  <SafeImage
                    src={coverUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-1 left-1 text-[8px] font-black uppercase px-1 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-300">
                    {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 truncate mt-2 group-hover:text-amber-400 transition">
                  {item.title}
                </h3>
                <span className="text-[10px] text-amber-400/90 font-medium mt-0.5">Updated</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 7. Random Recommendations Carousel */}
      <CarouselRow title="Discover Something New" viewAllHref="/browse" items={randomList} accentColor="bg-amber-400" />
    </main>
  );
}
