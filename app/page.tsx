'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { Flame, Clock, Sparkles, BookOpen, ChevronRight, ChevronLeft } from 'lucide-react';

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string;
  cover_url?: string;
  cover_image_url?: string;
  description?: string;
  synopsis?: string;
  rating?: number;
  followed_count?: number;
  genres?: string[] | string;
  reading_mode?: string;
  type?: string;
  status?: string;
  latest_chapter?: number;
  updated_at?: string;
}

const FALLBACK_POSTER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420"><rect width="100%" height="100%" fill="%23111318"/><rect x="18" y="18" width="264" height="384" rx="14" fill="%23171b24" stroke="%232b3140" stroke-width="2"/><circle cx="150" cy="170" r="44" fill="%23232938"/><path d="M126 194 L174 194 L150 148 Z" fill="%23ff5b6b"/><text x="150" y="250" text-anchor="middle" fill="%23ffffff" font-size="18" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">MANGAFLOW</text><text x="150" y="274" text-anchor="middle" fill="%237e89a0" font-size="12" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif">COVER IN PROGRESS</text></svg>';

function SafeImage({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [imgSrc, setImgSrc] = useState<string>(src || FALLBACK_POSTER);
  const [attempt, setAttempt] = useState<number>(0);

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
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [items.length]);

  if (!items.length) return null;
  const current = items[index];
  const cover = current.cover_url || current.cover_image_url || FALLBACK_POSTER;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-[#12151c] border border-white/5 shadow-2xl">
      <div className="relative min-h-[360px] md:min-h-[420px] flex items-center">
        {/* Background Ambient Blur */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <SafeImage
            src={cover}
            alt={current.title}
            className="w-full h-full object-cover scale-110 filter blur-3xl opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c10] via-[#0b0c10]/60 to-transparent" />
        </div>

        {/* Content Box */}
        <div className="relative z-10 p-6 md:p-10 flex flex-col md:flex-row gap-6 md:gap-8 items-center w-full">
          <div className="w-36 md:w-52 aspect-[3/4] flex-shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10 group">
            <SafeImage
              src={cover}
              alt={current.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>

          <div className="flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" /> SPOTLIGHT #{index + 1}
            </div>

            <h1 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight line-clamp-2 mb-2">
              {current.title}
            </h1>

            {current.english_title && current.english_title !== current.title && (
              <p className="text-sm text-gray-400 mb-3 italic line-clamp-1">
                {current.english_title}
              </p>
            )}

            <p className="text-xs md:text-sm text-gray-300 line-clamp-3 mb-6 max-w-2xl leading-relaxed">
              {current.description || current.synopsis || 'No description provided.'}
            </p>

            <div className="flex items-center justify-center md:justify-start gap-4">
              <Link
                href={`/series/${current.slug}`}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition-colors shadow-lg shadow-red-600/30 flex items-center gap-2"
              >
                <BookOpen className="w-4 h-4" /> Read Series
              </Link>
            </div>
          </div>
        </div>

        {/* Navigation arrows */}
        {items.length > 1 && (
          <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2">
            <button
              onClick={() => setIndex((prev) => (prev - 1 + items.length) % items.length)}
              className="p-2 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIndex((prev) => (prev + 1) % items.length)}
              className="p-2 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 text-white/70 hover:text-white transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  linkText,
  linkHref,
}: {
  icon: any;
  title: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-5 mt-10">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{title}</h2>
      </div>
      {linkHref && (
        <Link
          href={linkHref}
          className="text-xs md:text-sm text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
        >
          {linkText || 'View All'} <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

function CompactCard({ item }: { item: SeriesItem }) {
  const cover = item.cover_url || item.cover_image_url || FALLBACK_POSTER;

  return (
    <Link
      href={`/series/${item.slug}`}
      className="group flex flex-col bg-[#12151c] rounded-xl overflow-hidden border border-white/5 hover:border-red-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-red-500/5 hover:-translate-y-1"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#171a22]">
        <SafeImage
          src={cover}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        {item.type && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-black/70 backdrop-blur-md text-white border border-white/10">
            {item.type}
          </span>
        )}
        {item.rating && item.rating > 0 && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/90 text-black">
            ★ {Number(item.rating).toFixed(1)}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-semibold text-sm text-white line-clamp-1 group-hover:text-red-400 transition-colors">
          {item.title}
        </h3>
        <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-gray-400">
          <span>{item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}</span>
          <span className="text-gray-500">Ch. {item.latest_chapter ?? '?'}</span>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [spotlights, setSpotlights] = useState<SeriesItem[]>([]);
  const [popular, setPopular] = useState<SeriesItem[]>([]);
  const [latest, setLatest] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHomeData() {
      setLoading(true);
      try {
        // 1. Fetch Spotlight Items
        const { data: spotData } = await supabase
          .from('series')
          .select('id, slug, title, english_title, cover_url, cover_image_url, description, synopsis, rating, followed_count')
          .order('followed_count', { ascending: false })
          .limit(5);

        // 2. Fetch Most Popular
        const { data: popData } = await supabase
          .from('series')
          .select('id, slug, title, english_title, cover_url, cover_image_url, rating, reading_mode, type')
          .order('followed_count', { ascending: false })
          .limit(10);

        // 3. Fetch Latest Updates with highest chapter number
        const { data: recentSeries } = await supabase
          .from('series')
          .select(`
            id,
            slug,
            title,
            english_title,
            cover_url,
            cover_image_url,
            rating,
            reading_mode,
            type,
            updated_at,
            chapters (
              chapter_number
            )
          `)
          .order('updated_at', { ascending: false })
          .limit(12);

        if (spotData) setSpotlights(spotData as SeriesItem[]);
        if (popData) setPopular(popData as SeriesItem[]);

        if (recentSeries) {
          const formatted = recentSeries.map((s: any) => {
            const chNumbers = (s.chapters || [])
              .map((c: any) => c.chapter_number)
              .filter((n: any) => typeof n === 'number');
            const maxCh = chNumbers.length ? Math.max(...chNumbers) : null;
            return {
              ...s,
              latest_chapter: maxCh,
            };
          });
          setLatest(formatted as SeriesItem[]);
        }
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadHomeData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0c10] text-gray-100 pb-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        {/* Spotlight Top Showcase */}
        {spotlights.length > 0 ? (
          <SpotlightSlider items={spotlights} />
        ) : loading ? (
          <div className="w-full h-80 rounded-2xl bg-[#12151c] animate-pulse" />
        ) : null}

        {/* Popular Trending Section */}
        <SectionHeader
          icon={Flame}
          title="Trending Popular"
          linkHref="/popular"
          linkText="See Ranking"
        />

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-[#12151c] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {popular.slice(0, 10).map((item) => (
              <CompactCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Latest Releases Section */}
        <SectionHeader
          icon={Clock}
          title="Fresh Chapter Drops"
          linkHref="/latest"
          linkText="Full Feed"
        />

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-xl bg-[#12151c] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {latest.map((item) => (
              <CompactCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
