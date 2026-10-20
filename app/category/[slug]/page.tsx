'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  reading_mode: string;
  type?: string;
  rating?: number;
  followed_count?: number;
}

const CATEGORY_CONFIG: Record<string, { title: string; description: string; badgeColor: string }> = {
  trending: {
    title: 'Trending Series',
    description: 'Top-rated manga, manhwa, and manhua actively being read right now.',
    badgeColor: 'bg-amber-500',
  },
  popular: {
    title: 'Popular Series',
    description: 'Most bookmarked and followed series in the MangaFlow catalog.',
    badgeColor: 'bg-indigo-500',
  },
};

const ITEMS_PER_PAGE = 24;

export default function CategoryPage() {
  const params = useParams();
  const rawSlug = (params?.slug as string) || '';
  const categoryKey = rawSlug.toLowerCase();
  const config = CATEGORY_CONFIG[categoryKey];

  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedFormat, setSelectedFormat] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);

  if (!config && typeof window !== 'undefined') {
    notFound();
  }

  useEffect(() => {
    async function fetchCategoryData() {
      setLoading(true);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('series')
        .select('id, slug, title, cover_image_url, reading_mode, type, rating, followed_count', {
          count: 'exact',
        });

      // Strict distinction: Manhwa vs Manhua vs Manga
      if (selectedFormat === 'manga') {
        query = query.eq('type', 'manga');
      } else if (selectedFormat === 'manhwa') {
        query = query.eq('type', 'manhwa');
      } else if (selectedFormat === 'manhua') {
        query = query.eq('type', 'manhua');
      }

      if (categoryKey === 'trending') {
        query = query.order('rating', { ascending: false, nullsFirst: false });
      } else {
        query = query.order('followed_count', { ascending: false, nullsFirst: false });
      }

      const { data, count, error } = await query.range(from, to);

      if (!error && data) {
        setSeriesList(data as any);
        setTotalCount(count || 0);
      }
      setLoading(false);
    }

    fetchCategoryData();
  }, [categoryKey, currentPage, selectedFormat]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-5 ${config?.badgeColor || 'bg-indigo-500'} rounded-sm`} />
          <h1 className="text-xl sm:text-2xl font-black text-white">{config?.title}</h1>
        </div>
        <p className="text-xs text-neutral-400">{config?.description}</p>
      </div>

      {/* MangaFire-Style Format Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {['all', 'manga', 'manhwa', 'manhua'].map((fmt) => (
          <button
            key={fmt}
            onClick={() => {
              setSelectedFormat(fmt);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition capitalize ${
              selectedFormat === fmt
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {fmt === 'all' ? 'All Formats' : fmt}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-neutral-500">Loading {config?.title}...</div>
      ) : seriesList.length === 0 ? (
        <div className="py-20 text-center text-xs text-neutral-500">No series found under this format filter.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {seriesList.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="group flex flex-col bg-[#13151f] border border-neutral-800/80 hover:border-indigo-500/50 rounded-2xl overflow-hidden transition shadow-lg"
            >
              <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-neutral-900">
                <img
                  src={item.cover_image_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200">
                  {item.type || (item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga')}
                </span>
                {item.rating && (
                  <span className="absolute bottom-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded bg-black/80 text-amber-400">
                    ★ {item.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <h3 className="text-xs font-bold text-white group-hover:text-indigo-400 truncate transition">
                  {item.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs text-neutral-400">Page {currentPage} of {totalPages}</span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-semibold disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
