'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
  source: string | null;
}

// --- Internal Component: 16:9 Auto Slider (1.7s interval) ---
function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 1700);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];

  return (
    <div className="relative w-full aspect-[16/9] max-h-[300px] sm:max-h-[360px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      {current.cover_image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-30 transition-all duration-700"
          style={{ backgroundImage: `url(${current.cover_image_url})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/80 to-transparent z-10" />

      <div className="relative z-20 w-full h-full p-4 sm:p-6 flex items-end sm:items-center justify-between gap-4">
        <div className="max-w-md sm:max-w-lg space-y-1.5 sm:space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-black/60 text-neutral-300 border border-white/10">
              {current.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
            </span>
          </div>

          <h1 className="text-base sm:text-xl font-black text-white line-clamp-1 drop-shadow">
            {current.title}
          </h1>

          <p className="text-[11px] sm:text-xs text-neutral-300 line-clamp-2 drop-shadow-sm max-w-sm">
            {current.synopsis || 'Read online for free on MangaFlow.'}
          </p>

          <div className="pt-1">
            <Link
              href={`/series/${current.slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition"
            >
              Read Now →
            </Link>
          </div>
        </div>

        <div className="hidden sm:block shrink-0 w-28 aspect-[3/4.2] rounded-xl overflow-hidden border border-white/10 shadow-2xl">
          {current.cover_image_url && (
            <img
              src={current.cover_image_url}
              alt={current.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          )}
        </div>
      </div>

      <div className="absolute bottom-2 right-3 z-30 flex gap-1">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === index ? 'w-4 bg-indigo-500' : 'bg-neutral-600 hover:bg-neutral-400'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// --- Internal Component: MangaFire-Style Share Bar ---
function ShareBar() {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between bg-[#13151f] border border-neutral-800/80 px-3 py-2 rounded-xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">
        Share MangaFlow:
      </span>
      <div className="flex items-center gap-1.5">
        <a
          href="https://www.facebook.com/sharer/sharer.php?u=https://mangaflow-psi.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] rounded-lg transition"
          aria-label="Share on Facebook"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </a>

        <a
          href="https://twitter.com/intent/tweet?url=https://mangaflow-psi.vercel.app&text=Read%20free%20manga%20and%20manhwa%20on%20MangaFlow"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
          aria-label="Share on X"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>

        <a
          href="https://api.whatsapp.com/send?text=Read%20free%20manga%20and%20manhwa%20on%20MangaFlow"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg transition"
          aria-label="Share on WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
        </a>

        <a
          href="https://t.me/share/url?url=https://mangaflow-psi.vercel.app&text=Read%20free%20manga"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-lg transition"
          aria-label="Share on Telegram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.949z"/></svg>
        </a>

        <button
          onClick={copyUrl}
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition text-[11px]"
          title="Copy Link"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

// --- Main Page Component ---
export default function HomePage() {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode, source')
        .order('created_at', { ascending: false });
      setSeries(data || []);
      setLoading(false);
    }
    loadData();
  }, []);

  const spotlightItems = series.slice(0, 7);
  const trending = series.slice(0, 10);
  const popular = series.slice(10, 20);
  const mostViewed = series.slice(20, 30);
  const randomPicks = [...series].sort(() => 0.5 - Math.random()).slice(0, 10);
  const latestReleases = series.slice(30, 40);

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
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">No Cover</div>
                )}
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
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
        Loading catalog...
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

      <HorizontalRow title="Trending Series" viewAllHref="/browse?sort=trending" items={trending} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" viewAllHref="/browse?sort=popular" items={popular} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" viewAllHref="/browse?sort=views" items={mostViewed} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" viewAllHref="/browse?sort=random" items={randomPicks} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" viewAllHref="/browse?sort=latest" items={latestReleases} badgeColor="bg-cyan-500" />
    </main>
  );
}
