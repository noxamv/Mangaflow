'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
}

// 16:9 Spotlight Slider with Auto Rotation
function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];

  return (
    <div className="relative w-full aspect-[16/9] max-h-[280px] sm:max-h-[340px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      {current.cover_image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-25 transition-all duration-700"
          style={{ backgroundImage: `url(${current.cover_image_url})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/85 to-black/30 z-10" />

      <div className="relative z-20 w-full h-full p-4 sm:p-6 flex items-center justify-between gap-4">
        <div className="max-w-[65%] sm:max-w-md space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-black/60 text-neutral-300 border border-white/10">
              {current.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
          </div>

          <h2 className="text-sm sm:text-lg font-black text-white line-clamp-1">
            {current.title}
          </h2>

          <p className="text-[10px] sm:text-xs text-neutral-400 line-clamp-2">
            {current.synopsis || 'Read online for free on MangaFlow.'}
          </p>

          <div className="pt-1">
            <Link
              href={`/series/${current.slug}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition"
            >
              Read Now →
            </Link>
          </div>
        </div>

        <div className="shrink-0 w-24 sm:w-32 aspect-[3/4.2] rounded-xl overflow-hidden border border-white/15 shadow-2xl bg-neutral-900">
          {current.cover_image_url ? (
            <img
              src={current.cover_image_url}
              alt={current.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">
              No Image
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-2 left-4 z-30 flex gap-1">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-4 bg-indigo-500' : 'w-1.5 bg-neutral-600'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// Icon-Only Share Bar (Facebook, X, Reddit, Messenger, Discord, Copy Link)
function ShareBar() {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const siteUrl = 'https://mangaflow-psi.vercel.app';
  const shareText = 'Read free manga and manhwa on MangaFlow!';

  return (
    <div className="flex items-center justify-between bg-[#13151f] border border-neutral-800/80 px-3.5 py-2.5 rounded-xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">Share:</span>
      <div className="flex items-center gap-2">
        {/* Facebook */}
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] rounded-lg transition"
          title="Share on Facebook"
          aria-label="Share on Facebook"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>

        {/* X */}
        <a
          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
          title="Share on X"
          aria-label="Share on X"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>

        {/* Reddit */}
        <a
          href={`https://reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent('MangaFlow Free Reader')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#FF4500]/20 hover:bg-[#FF4500]/30 text-[#FF4500] rounded-lg transition"
          title="Share on Reddit"
          aria-label="Share on Reddit"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .616-.319 1.157-.802 1.467.037.234.056.474.056.719 0 3.654-4.244 6.617-9.477 6.617-5.233 0-9.477-2.963-9.477-6.617 0-.245.019-.485.056-.719a1.745 1.745 0 0 1-.802-1.467c0-.968.786-1.754 1.754-1.754.477 0 .899.182 1.207.491 1.194-.856 2.85-1.418 4.674-1.488l.964-4.516a.375.375 0 0 1 .444-.289l3.18.669a1.248 1.248 0 0 1 1.066-.607z" />
          </svg>
        </a>

        {/* Facebook Messenger */}
        <a
          href={`fb-messenger://share/?link=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#00B2FF]/20 hover:bg-[#00B2FF]/30 text-[#00B2FF] rounded-lg transition"
          title="Share on Messenger"
          aria-label="Share on Messenger"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652v4.237l4.086-2.242c1.082.3 2.234.464 3.445.464 6.627 0 12-4.974 12-11.111S18.627 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259 6.556-6.963 3.13 3.259 5.889-3.259-6.556 6.963z" />
          </svg>
        </a>

        {/* Discord */}
        <a
          href="https://discord.com"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-[#5865F2] rounded-lg transition"
          title="Join Discord"
          aria-label="Join Discord"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </a>

        {/* Copy Link */}
        <button
          onClick={copyUrl}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
          title="Copy Link"
          aria-label="Copy Link"
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [trendingList, setTrendingList] = useState<SeriesItem[]>([]);
  const [popularList, setPopularList] = useState<SeriesItem[]>([]);
  const [viewedList, setViewedList] = useState<SeriesItem[]>([]);
  const [latestList, setLatestList] = useState<SeriesItem[]>([]);
  const [randomList, setRandomList] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Parallelize queries using Promise.all to cut wait time significantly
      const [trendingRes, popRes, viewsRes, latestRes, randomRes] = await Promise.all([
        supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode')
          .order('rating', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode')
          .order('followed_count', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode')
          .order('views_count', { ascending: false, nullsFirst: false })
          .limit(12),
        supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode')
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode')
          .limit(40),
      ]);

      const randomized = (randomRes.data || []).sort(() => 0.5 - Math.random()).slice(0, 12);

      setTrendingList(trendingRes.data || []);
      setPopularList(popRes.data || []);
      setViewedList(viewsRes.data || []);
      setLatestList(latestRes.data || []);
      setRandomList(randomized);
      setLoading(false);
    }
    loadData();
  }, []);

  const spotlightItems = trendingList.slice(0, 7);

  const HorizontalRow = ({
    title,
    viewAllHref,
    items,
    badgeColor,
  }: {
    title: string;
    viewAllHref: string;
    items: SeriesItem[];
    badgeColor: string;
  }) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between px-3 sm:px-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-4 ${badgeColor} rounded-sm`}></span>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">{title}</h2>
          </div>
          <Link href={viewAllHref} className="text-[11px] font-semibold text-neutral-400 hover:text-indigo-400 transition">
            View all →
          </Link>
        </div>

        <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0 scroll-smooth">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="shrink-0 w-28 sm:w-36 flex flex-col group"
            >
              <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition">
                {item.cover_image_url ? (
                  <img
                    src={item.cover_image_url}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">
                    No Cover
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
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
      <div className="min-h-[50vh] flex items-center justify-center text-xs text-neutral-500">
        Loading library...
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8">
      <div className="px-3 sm:px-0">
        <SpotlightSlider items={spotlightItems} />
      </div>

      <div className="px-3 sm:px-0">
        <ShareBar />
      </div>

      <HorizontalRow title="Trending Series" viewAllHref="/category/trending" items={trendingList} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" viewAllHref="/category/popular" items={popularList} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" viewAllHref="/category/views" items={viewedList} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" viewAllHref="/category/random" items={randomList} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" viewAllHref="/category/latest" items={latestList} badgeColor="bg-cyan-500" />
    </main>
  );
}
