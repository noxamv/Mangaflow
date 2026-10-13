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

// 16:9 Spotlight Slider with Official Poster Embedded (3.0s Auto Rotation)
function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 3000); // 3.0 seconds per slide
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];

  return (
    <div className="relative w-full aspect-[16/9] max-h-[280px] sm:max-h-[340px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      {/* Blurred ambient background */}
      {current.cover_image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-25 transition-all duration-700"
          style={{ backgroundImage: `url(${current.cover_image_url})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/85 to-black/30 z-10" />

      {/* Main card body with Official Cover Poster */}
      <div className="relative z-20 w-full h-full p-4 sm:p-6 flex items-center justify-between gap-4">
        {/* Left: Text & Read button */}
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

        {/* Right: Official Series Poster Image */}
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

      {/* Indicators */}
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

// Share Bar with Reddit, Discord, WhatsApp, Telegram & Icon-Only Copy
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
      <span className="text-[11px] font-semibold text-neutral-400">Share MangaFlow:</span>
      <div className="flex items-center gap-2">
        {/* WhatsApp */}
        <a
          href="https://api.whatsapp.com/send?text=Read%20free%20manga%20and%20manhwa%20on%20MangaFlow%20https://mangaflow-psi.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg transition"
          aria-label="Share on WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
          </svg>
        </a>

        {/* Telegram */}
        <a
          href="https://t.me/share/url?url=https://mangaflow-psi.vercel.app&text=Read%20free%20manga"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-lg transition"
          aria-label="Share on Telegram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.949z" />
          </svg>
        </a>

        {/* Reddit */}
        <a
          href="https://reddit.com/submit?url=https://mangaflow-psi.vercel.app&title=MangaFlow%20Free%20Reader"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#FF4500]/20 hover:bg-[#FF4500]/30 text-[#FF4500] rounded-lg transition"
          aria-label="Share on Reddit"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .616-.319 1.157-.802 1.467.037.234.056.474.056.719 0 3.654-4.244 6.617-9.477 6.617-5.233 0-9.477-2.963-9.477-6.617 0-.245.019-.485.056-.719a1.745 1.745 0 0 1-.802-1.467c0-.968.786-1.754 1.754-1.754.477 0 .899.182 1.207.491 1.194-.856 2.85-1.418 4.674-1.488l.964-4.516a.375.375 0 0 1 .444-.289l3.18.669a1.248 1.248 0 0 1 1.066-.607z" />
          </svg>
        </a>

        {/* Discord */}
        <a
          href="https://discord.com"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-[#5865F2] rounded-lg transition"
          aria-label="Discord Community"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </a>

        {/* Copy Link (Icon Only) */}
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

// Default export makes app/page.tsx a valid module
export default function HomePage() {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data } = await supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
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

      <HorizontalRow title="Trending Series" viewAllHref="/category/trending" items={trending} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" viewAllHref="/category/popular" items={popular} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" viewAllHref="/category/views" items={mostViewed} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" viewAllHref="/category/random" items={randomPicks} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" viewAllHref="/category/latest" items={latestReleases} badgeColor="bg-cyan-500" />
    </main>
  );
}
