'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { ShareBar } from '../components/ShareBar';

interface ChapterItem {
  id: string;
  chapter_number: number;
  created_at?: string;
  published_at?: string;
}

interface SeriesItem {
  id: string;
  title: string;
  slug: string;
  cover_url: string | null;
  cover_image_url: string | null;
  description: string | null;
  synopsis: string | null;
  type: string | null;
  reading_mode?: string | null;
  status: string | null;
  views_count?: number;
  rating?: number;
  genres: string[] | string | null;
  updated_at: string;
  chapters?: ChapterItem[];
}

const FALLBACK_POSTER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><rect width="300" height="420" fill="%2312151c"/><text x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="14">No Cover Available</text></svg>';

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
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!items.length) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items.length) return null;
  const active = items[current];

  return (
    <div className="relative w-full h-[320px] md:h-[460px] rounded-3xl overflow-hidden mb-12 shadow-2xl border border-white/5 bg-slate-900 group">
      {/* Background Poster Blur */}
      <div className="absolute inset-0 z-0">
        <PosterImage
          src={active.cover_url || active.cover_image_url}
          alt={active.title}
          className="w-full h-full object-cover blur-2xl opacity-30 transform scale-110 transition-transform duration-1000 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d14] via-[#0b0d14]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0d14] via-[#0b0d14]/80 to-transparent" />
      </div>

      {/* Content Layer */}
      <div className="relative z-10 w-full h-full p-6 md:p-12 flex flex-col justify-end max-w-3xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
            Spotlight #{current + 1}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-white/10 text-white backdrop-blur-md">
            {active.type || 'Manga'}
          </span>
          {active.status && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {active.status}
            </span>
          )}
        </div>

        <h1 className="text-2xl md:text-5xl font-black text-white leading-tight mb-3 line-clamp-2 drop-shadow-md">
          {active.title}
        </h1>

        <p className="text-sm md:text-base text-slate-300 line-clamp-3 mb-6 drop-shadow">
          {active.description || active.synopsis || 'Explore this trending title on MangaFlow.'}
        </p>

        <div className="flex items-center gap-4">
          <Link
            href={`/series/${active.slug}`}
            className="px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-sm md:text-base shadow-xl shadow-indigo-500/25 transition-all transform active:scale-95"
          >
            Read Now
          </Link>
          <div className="flex gap-2">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  current === idx ? 'w-8 bg-indigo-500' : 'w-2 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SeriesCard({ series }: { series: SeriesItem }) {
  const latestChapters = series.chapters || [];

  return (
    <div className="flex flex-col group bg-slate-900/40 rounded-2xl border border-white/5 overflow-hidden hover:border-indigo-500/30 transition-all hover:shadow-xl hover:shadow-indigo-500/10">
      <Link href={`/series/${series.slug}`} className="relative aspect-[3/4] w-full overflow-hidden bg-slate-800">
        <PosterImage
          src={series.cover_url || series.cover_image_url}
          alt={series.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-slate-950/80 text-white backdrop-blur-md">
            {series.type || 'Manga'}
          </span>
          {series.status === 'Completed' && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-500/80 text-white backdrop-blur-md">
              End
            </span>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
          <span className="text-xs font-semibold text-white bg-indigo-600 px-3 py-1.5 rounded-xl shadow-lg w-full text-center">
            View Details
          </span>
        </div>
      </Link>

      <div className="p-3.5 flex flex-col flex-1">
        <Link href={`/series/${series.slug}`}>
          <h3 className="font-bold text-sm text-slate-100 line-clamp-1 group-hover:text-indigo-400 transition-colors">
            {series.title}
          </h3>
        </Link>

        <div className="mt-2.5 flex flex-col gap-1.5 flex-1 justify-end">
          {latestChapters.length > 0 ? (
            latestChapters.slice(0, 2).map((ch) => (
              <Link
                key={ch.id}
                href={`/read/${ch.id}`}
                className="flex items-center justify-between text-[11px] font-medium px-2 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-600/20 hover:text-indigo-300 text-slate-300 transition-colors"
              >
                <span>Ch. {ch.chapter_number}</span>
                <span className="text-[10px] text-slate-500">Read</span>
              </Link>
            ))
          ) : (
            <div className="text-[11px] text-slate-500 italic py-1">No chapters indexed</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch top series along with latest 2 chapters
        const { data, error } = await supabase
          .from('series')
          .select(`
            id,
            title,
            slug,
            cover_url,
            cover_image_url,
            description,
            synopsis,
            type,
            status,
            genres,
            updated_at,
            views_count,
            rating,
            chapters:chapters (
              id,
              chapter_number,
              published_at,
              created_at
            )
          `)
          .order('updated_at', { ascending: false })
          .limit(80);

        if (error) {
          console.error('Error fetching series for home:', error);
        } else if (data) {
          // Sort chapters descending for each series
          const formatted = (data as any[]).map((s) => ({
            ...s,
            chapters: (s.chapters || []).sort(
              (a: ChapterItem, b: ChapterItem) => b.chapter_number - a.chapter_number
            ),
          }));
          setSeriesList(formatted);
        }
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const spotlightItems = useMemo(() => {
    return seriesList.slice(0, 5);
  }, [seriesList]);

  const filteredSeries = useMemo(() => {
    if (!searchQuery.trim()) return seriesList;
    const q = searchQuery.toLowerCase();
    return seriesList.filter((s) => s.title.toLowerCase().includes(q));
  }, [seriesList, searchQuery]);

  const latestReleases = useMemo(() => {
    return filteredSeries.slice(0, 24);
  }, [filteredSeries]);

  const popularManhwa = useMemo(() => {
    return filteredSeries.filter((s) => (s.type || '').toLowerCase() === 'manhwa').slice(0, 12);
  }, [filteredSeries]);

  const popularManga = useMemo(() => {
    return filteredSeries.filter((s) => (s.type || '').toLowerCase() === 'manga').slice(0, 12);
  }, [filteredSeries]);

  return (
    <div className="min-h-screen bg-[#0b0d14] text-slate-100 pb-20">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Spotlight Showcase */}
        {!loading && spotlightItems.length > 0 && <SpotlightSlider items={spotlightItems} />}

        {/* Global ShareBar Banner */}
        <div className="mb-10">
          <ShareBar title="MangaFlow - Free High-Speed Manga & Manhwa Reader" />
        </div>

        {/* Search & Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <span className="w-2.5 h-6 bg-indigo-500 rounded-full inline-block" />
              Latest Chapter Drops
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Continuously aggregated across official and scanlator mirrors
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <input
              type="text"
              placeholder="Search active series..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-slate-900/60 rounded-2xl aspect-[3/4] animate-pulse border border-white/5"
              />
            ))}
          </div>
        )}

        {/* Latest Releases Grid */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-16">
            {latestReleases.map((series) => (
              <SeriesCard key={series.id} series={series} />
            ))}
          </div>
        )}

        {/* Trending Manhwa Row */}
        {!loading && popularManhwa.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <span className="w-2.5 h-5 bg-purple-500 rounded-full inline-block" />
                  Trending Webtoons & Manhwa
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Top serialized full-color Korean comics</p>
              </div>
              <Link
                href="/filter?type=manhwa"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View All &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {popularManhwa.map((series) => (
                <SeriesCard key={series.id} series={series} />
              ))}
            </div>
          </div>
        )}

        {/* Japanese Manga Row */}
        {!loading && popularManga.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <span className="w-2.5 h-5 bg-rose-500 rounded-full inline-block" />
                  Popular Japanese Manga
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Original black & white chapter releases</p>
              </div>
              <Link
                href="/filter?type=manga"
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View All &rarr;
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {popularManga.map((series) => (
                <SeriesCard key={series.id} series={series} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
