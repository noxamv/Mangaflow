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
  rating?: number | null;
}

interface ContinueItem {
  series_id: string;
  chapter_id: string;
  chapter_number: number;
  series: SeriesItem;
}

function resolveCoverUrl(target: any): string {
  let url = target?.cover_image_url || target?.cover_url || '';
  if (!url) return FALLBACK_POSTER;
  if (url.startsWith('/api/proxy') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (
    url.includes('mangadex.org') ||
    url.includes('readdetectiveconan.com') ||
    url.includes('mangapill.com') ||
    url.includes('weebcentral.com') ||
    url.includes('mpcdn.top')
  ) {
    return `/api/proxy-image?url=${encodeURIComponent(url)}`;
  }
  return url;
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

// 1. FIXED & CONSISTENT SPOTLIGHT BAR (Exactly 7 items, Fixed Height, Tap-to-Navigate, Micro Dots)
function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);
  const spotlightItems = items.slice(0, 7);

  useEffect(() => {
    if (spotlightItems.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % spotlightItems.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [spotlightItems.length]);

  if (!spotlightItems || spotlightItems.length === 0) return null;
  const current = spotlightItems[index];
  const coverUrl = resolveCoverUrl(current);
  const displayTitle = current.english_title || current.title;

  return (
    <div className="relative w-full h-[210px] sm:h-[250px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-2xl flex flex-col justify-between">
      {/* Background blurred cover */}
      <div
        className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-25 transition-all duration-700 pointer-events-none"
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#0a0b0e] via-[#0a0b0e]/90 to-transparent z-10 pointer-events-none" />

      {/* Main Clickable Hero Link */}
      <Link
        href={`/series/${current.slug}`}
        className="relative z-20 w-full p-4 sm:p-6 flex justify-between items-center gap-4 flex-1 group"
      >
        {/* Left Side Metadata */}
        <div className="flex flex-col justify-between self-stretch flex-1 min-w-0 pr-2">
          {/* Top Badges */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-md bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 shadow-sm">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-md bg-black/75 text-neutral-300 border border-white/10 shadow-sm">
              {current.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
            {current.rating && current.rating > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ★ {current.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* Middle Title & Description */}
          <div className="my-auto py-1.5 space-y-1">
            <h2 className="text-base sm:text-2xl font-black text-white line-clamp-1 sm:line-clamp-2 tracking-tight group-hover:text-indigo-400 transition-colors leading-snug">
              {displayTitle}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-2xl font-normal">
              {current.synopsis || 'Read online for free in high definition with fast chapter loading on MangaFlow.'}
            </p>
          </div>

          {/* Bottom Action Button */}
          <div className="shrink-0 pt-1">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 sm:px-5 sm:py-2 bg-indigo-600 group-hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition transform group-hover:-translate-y-0.5">
              Read Now →
            </span>
          </div>
        </div>

        {/* Right Cover Poster */}
        <div className="shrink-0 w-24 sm:w-32 aspect-[3/4.2] rounded-xl overflow-hidden border border-white/15 shadow-2xl bg-neutral-900 self-center">
          <SafeImage src={coverUrl} alt={displayTitle} className="w-full h-full object-cover" />
        </div>
      </Link>

      {/* Slide Navigation Dots (Clean & Small) */}
      <div className="relative z-30 pb-2.5 flex items-center justify-center gap-1">
        {spotlightItems.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            className={`rounded-full transition-all duration-300 ${
              index === i ? 'w-3 h-1 bg-indigo-500 shadow-sm shadow-indigo-500/50' : 'w-1 h-1 bg-neutral-700 hover:bg-neutral-500'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// 2. SOCIAL SHARE BAR (Includes Instagram, Repaired Twitter/X Intent, WhatsApp, Facebook, Reddit, Telegram, Copy)
function ShareBar() {
  const [copied, setCopied] = useState(false);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mangaflow-psi.vercel.app';
  const shareText = 'Read trending manga and manhwa free on MangaFlow!';

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#13151f] border border-neutral-800/80 px-4 py-2 rounded-2xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">Share MangaFlow:</span>
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Twitter / X */}
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
          aria-label="Share on X"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </a>

        {/* Facebook */}
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-[#1877F2] rounded-lg transition"
          aria-label="Share on Facebook"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </a>

        {/* Instagram */}
        <a
          href="https://www.instagram.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-[#E4405F] rounded-lg transition"
          aria-label="Share on Instagram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
        </a>

        {/* WhatsApp */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${shareText}${siteUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg transition"
          aria-label="Share on WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>
          </svg>
        </a>

        {/* Telegram */}
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-lg transition"
          aria-label="Share on Telegram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.832.941z"/>
          </svg>
        </a>

        {/* Copy Link */}
        <button
          onClick={copyUrl}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition text-xs font-semibold"
          title="Copy Link"
        >
          {copied ? '✓' : '🔗'}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);
  const [featuredList, setFeaturedList] = useState<SeriesItem[]>([]);
  const [trendingList, setTrendingList] = useState<SeriesItem[]>([]);
  const [latestList, setLatestList] = useState<SeriesItem[]>([]);
  const [popularList, setPopularList] = useState<SeriesItem[]>([]);

  const [selectedSeries, setSelectedSeries] = useState<SeriesItem | null>(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);

  const openActionMenu = (e: React.MouseEvent, s: SeriesItem) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSeries(s);
    setActionModalOpen(true);
  };

  useEffect(() => {
    async function loadData() {
      const baseCols = 'id, slug, title, english_title, synopsis, cover_image_url, cover_url, reading_mode, rating';

      try {
        const [trendingRes, popRes, latestRes, featuredRes] = await Promise.all([
          supabase.from('series').select(baseCols).order('followed_count', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('rating', { ascending: false, nullsFirst: false }).limit(10),
          supabase.from('series').select(baseCols).order('updated_at', { ascending: false }).limit(10),
          supabase.from('series').select(baseCols).order('created_at', { ascending: false }).limit(10),
        ]);

        const sanitize = (list: any[]): SeriesItem[] =>
          (list || []).map((s) => ({
            id: s.id,
            slug: s.slug || s.id,
            title: s.english_title || s.title,
            english_title: s.english_title,
            synopsis: s.synopsis,
            cover_image_url: s.cover_image_url || s.cover_url,
            cover_url: s.cover_url || s.cover_image_url,
            reading_mode: s.reading_mode,
            rating: s.rating,
          }));

        setTrendingList(sanitize(trendingRes.data || []));
        setPopularList(sanitize(popRes.data || []));
        setLatestList(sanitize(latestRes.data || []));
        setFeaturedList(sanitize(featuredRes.data || []));
      } catch (err) {
        console.error('Data loading error:', err);
      }

      // Check Local Device Reading History First
      const localHist = getAllLocalHistory();
      const localItems = Object.values(localHist);

      if (localItems.length > 0) {
        setContinueReading(
          localItems.slice(0, 10).map((h) => ({
            series_id: h.seriesId,
            chapter_id: h.chapterId,
            chapter_number: h.chapterNumber,
            series: {
              id: h.seriesId,
              slug: h.seriesSlug || h.seriesId,
              title: h.seriesTitle || 'Unknown Title',
              english_title: null,
              synopsis: null,
              cover_image_url: null,
              reading_mode: 'webtoon',
            },
          }))
        );
        return;
      }

      // Fallback: Supabase Authenticated Reading History
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: hist } = await supabase
            .from('reading_history')
            .select(`
              series_id,
              chapter_id,
              chapter_number,
              series:series_id (id, slug, title, english_title, cover_image_url, cover_url, reading_mode)
            `)
            .eq('user_id', session.user.id)
            .order('updated_at', { ascending: false })
            .limit(10);

          if (hist && hist.length > 0) {
            setContinueReading(
              hist.map((h: any) => ({
                series_id: h.series_id,
                chapter_id: h.chapter_id,
                chapter_number: h.chapter_number,
                series: {
                  id: h.series?.id || h.series_id,
                  slug: h.series?.slug || h.series_id,
                  title: h.series?.english_title || h.series?.title || 'Unknown Title',
                  english_title: h.series?.english_title,
                  synopsis: null,
                  cover_image_url: h.series?.cover_image_url || h.series?.cover_url,
                  cover_url: h.series?.cover_url,
                  reading_mode: h.series?.reading_mode,
                },
              }))
            );
          }
        }
      } catch {}
    }

    loadData();
  }, []);

  const HorizontalRow = ({
    title,
    items,
    color,
    href = '/filter',
  }: {
    title: string;
    items: SeriesItem[];
    color: string;
    href?: string;
  }) => {
    if (!items || items.length === 0) return null;

    return (
      <section className="space-y-3">
        {/* Prominent Scaled Section Titles */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`w-1.5 h-4 sm:h-5 rounded-full ${color}`} />
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              {title}
            </h2>
          </div>
          <Link
            href={href}
            className="text-xs text-neutral-400 hover:text-white font-medium transition"
          >
            View All →
          </Link>
        </div>

        {/* Scrollable Card Ladder */}
        <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-2 scrollbar-none w-full max-w-full">
          {items.map((item) => {
            const cover = resolveCoverUrl(item);
            const titleText = item.english_title || item.title;

            return (
              <div
                key={item.id}
                className="relative shrink-0 w-28 sm:w-36 flex flex-col space-y-1.5 group"
              >
                <Link href={`/series/${item.slug}`} className="block">
                  <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 shadow-md transition">
                    <SafeImage
                      src={cover}
                      alt={titleText}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />

                    {/* Format Badge */}
                    {item.reading_mode && (
                      <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200 border border-white/10">
                        {item.reading_mode === 'webtoon' ? 'MANHWA' : 'MANGA'}
                      </span>
                    )}

                    {/* MangaFire-Style Bookmark Quick Action Trigger */}
                    <button
                      type="button"
                      onClick={(e) => openActionMenu(e, item)}
                      title="Bookmark / Save"
                      aria-label="Bookmark"
                      className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-lg bg-black/75 hover:bg-indigo-600 text-neutral-200 hover:text-white flex items-center justify-center backdrop-blur-sm border border-white/10 transition shadow-lg"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                    </button>
                  </div>

                  <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-indigo-400 line-clamp-1 transition pt-1">
                    {titleText}
                  </h3>
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 space-y-6">
      {/* 1. Consistent Spotlight Slider (Exactly 7 items, Fixed height, Tap-through enabled) */}
      <SpotlightSlider items={trendingList} />

      {/* 2. Repaired Social Share Bar (Includes Instagram & Verified X intent) */}
      <ShareBar />

      {/* 3. Continue Reading */}
      {continueReading.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-4 sm:h-5 rounded-full bg-emerald-500" />
            <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              Continue Reading
            </h2>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-2 scrollbar-none w-full max-w-full">
            {continueReading.map((item, idx) => {
              const cover = resolveCoverUrl(item.series);
              return (
                <Link
                  key={idx}
                  href={`/read/${item.chapter_id}`}
                  className="shrink-0 w-28 sm:w-36 flex flex-col space-y-1.5 group"
                >
                  <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-emerald-500/50 shadow-md transition">
                    <SafeImage
                      src={cover}
                      alt={item.series?.title || 'Comic'}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-black/80 text-emerald-400 border border-emerald-500/30">
                      Ch. {item.chapter_number}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-emerald-400 line-clamp-1 transition">
                    {item.series?.title}
                  </h3>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. All 4 Distinct Series Shelves */}
      <HorizontalRow
        title="Trending Series"
        items={trendingList}
        color="bg-indigo-500"
        href="/trending"
      />
      <HorizontalRow
        title="Popular Series"
        items={popularList}
        color="bg-amber-500"
        href="/popular"
      />
      <HorizontalRow
        title="Latest Releases"
        items={latestList}
        color="bg-cyan-500"
        href="/latest"
      />
      <HorizontalRow
        title="Random Series / Recommended"
        items={featuredList}
        color="bg-rose-500"
        href="/filter"
      />

      {/* Universal Action Modal */}
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
