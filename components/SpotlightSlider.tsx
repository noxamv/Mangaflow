'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SpotlightItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
}

export default function SpotlightSlider({ items }: { items: SpotlightItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 1700); // 1.7 second motion timer
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];

  return (
    <div className="relative w-full aspect-[16/9] max-h-[300px] sm:max-h-[360px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      {/* Background Image Backdrop */}
      {current.cover_image_url && (
        <div 
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-30 transition-all duration-700"
          style={{ backgroundImage: `url(${current.cover_image_url})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/80 to-transparent z-10" />

      {/* Content Container */}
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

        {/* Thumbnail on tablet/desktop */}
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

      {/* Carousel Dots */}
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
