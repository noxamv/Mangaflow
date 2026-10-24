'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

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

function resolveCoverUrl(item: any): string {
  if (!item) return FALLBACK_POSTER;
  const target = Array.isArray(item) ? item[0] : item;
  const url = target?.cover_image_url || target?.cover_url || '';
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return FALLBACK_POSTER;
  }
  return url;
}

function PosterImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
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
      referrerPolicy="no-referrer"
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
    if (!items.length) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [items.length]);

  if (!items.length) return null;
  const current = items[index];

  return (
    <div className="relative w-full h-72 sm:h-80 md:h-96 rounded-2xl overflow-hidden bg-[#13151f] border border-neutral-800/80 shadow-2xl">
      <div className="absolute inset-0 z-0">
        <PosterImage
          src={resolveCoverUrl(current)}
          alt={current.title}
          className="w-full h-full object-cover blur-md scale-105 opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c14] via-[#0b0c14]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c14] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 h-full flex flex-col justify-end p-5 sm:p-7 md:p-8 max-w-2xl">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-[11px] font-semibold w-fit mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Spotlight #{index + 1}
        </div>
        <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight line-clamp-2">
          {current.title}
        </h2>
        {current.synopsis && (
          <p className="mt-2 text-xs sm:text-sm text-neutral-300 line-clamp-2 leading-relaxed">
            {current.synopsis}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <Link
            href={`/series/${current.slug}`}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold transition shadow-lg shadow-indigo-600/30 active:scale-95"
          >
            Read Now
          </Link>
          <div className="flex gap-1.5 ml-2">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === i ? 'w-6 bg-indigo-500' : 'w-1.5 bg-neutral-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareBar() {
  const [copied, setCopied] = useState(false);
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://mangaflow-psi.vercel.app';
  const shareText = 'Read free manga and manhwa on MangaFlow!';

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-[#13151f] border border-neutral-800/80 px-4 py-2.5 rounded-2xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">Share MangaFlow:</span>
      <div className="flex items-center gap-2">
        <a
          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </a>
        <button
          onClick={copyUrl}
          className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesItem }) {
  return (
    <Link
      href={`/series/${series.slug}`}
      className="group relative flex flex-col bg-[#13151f] border border-neutral-800/80 rounded-2xl overflow-hidden hover:border-neutral-700 transition duration-300"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-900">
        <PosterImage
          src={resolveCoverUrl(series)}
          alt={series.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#13151f] via-transparent to-transparent opacity-80" />
      </div>

      <div className="p-3 flex flex-col flex-1 justify-between">
        <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-indigo-400 transition line-clamp-1">
          {series.title}
        </h3>
        <p className="text-[11px] text-neutral-400 line-clamp-1 mt-1">
          {series.synopsis || 'Read online free'}
        </p>
      </div>
    </Link>
  );
}

export default function Home() {
  const [spotlight, setSpotlight] = useState<SeriesItem[]>([]);
  const [continueReading, setContinueReading] = useState<ContinueItem[]>([]);
  const [popular, setPopular] = useState<SeriesItem[]>([]);
  const [latest, setLatest] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: history } = await supabase
            .from('reading_history')
            .select(`
              series_id,
              chapter_id,
              chapter_number,
              series:series_id (
                id,
                slug,
                title,
                synopsis,
                cover_image_url,
                cover_url,
                reading_mode
              )
            `)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(4);

          if (history) {
            const mapped = history
              .map((h: any) => ({
                series_id: h.series_id,
                chapter_id: h.chapter_id,
                chapter_number: h.chapter_number,
                series: Array.isArray(h.series) ? h.series[0] : h.series,
              }))
              .filter((h: any) => h.series);
            setContinueReading(mapped);
          }
        }

        const { data: spotData } = await supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, cover_url, reading_mode')
          .order('followed_count', { ascending: false })
          .limit(5);

        if (spotData) setSpotlight(spotData);

        const { data: popData } = await supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, cover_url, reading_mode')
          .order('views_count', { ascending: false })
          .limit(12);

        if (popData) setPopular(popData);

        const { data: latData } = await supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, cover_url, reading_mode')
          .order('updated_at', { ascending: false })
          .limit(12);

        if (latData) setLatest(latData);
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* 1. Spotlight Slider */}
      <SpotlightSlider items={spotlight} />

      {/* 2. Continue Reading */}
      {continueReading.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full" />
              Continue Reading
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {continueReading.map((item) => (
              <Link
                key={item.series_id}
                href={`/read/${item.chapter_id}`}
                className="group flex gap-2.5 bg-[#13151f] border border-neutral-800/80 p-2 rounded-2xl hover:border-neutral-700 transition"
              >
                <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-neutral-900 shrink-0">
                  <PosterImage
                    src={resolveCoverUrl(item.series)}
                    alt={item.series.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                </div>
                <div className="flex flex-col justify-center min-w-0 pr-1">
                  <span className="text-[11px] font-bold text-white truncate group-hover:text-indigo-400 transition">
                    {item.series.title}
                  </span>
                  <span className="text-[10px] text-neutral-400 mt-0.5">
                    Chapter {item.chapter_number}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 3. Popular Titles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-full" />
            Most Popular
          </h2>
          <Link
            href="/popular"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-[#13151f] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {popular.map((item) => (
              <SeriesCard key={item.id} series={item} />
            ))}
          </div>
        )}
      </section>

      {/* 4. Latest Updates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-full" />
            Latest Updates
          </h2>
          <Link
            href="/latest"
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition"
          >
            View All &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-[#13151f] rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {latest.map((item) => (
              <SeriesCard key={item.id} series={item} />
            ))}
          </div>
        )}
      </section>

      {/* 5. Share Bar */}
      <div className="pt-2">
        <ShareBar />
      </div>
    </div>
  );
}
