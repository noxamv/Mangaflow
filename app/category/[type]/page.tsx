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
  rating?: number;
  followed_count?: number;
}

const CATEGORY_CONFIG: Record<
  string,
  { title: string; description: string; badgeColor: string }
> = {
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
  latest: {
    title: 'Latest Releases',
    description: 'Recently indexed titles and fresh catalog updates.',
    badgeColor: 'bg-cyan-500',
  },
  random: {
    title: 'Random Picks',
    description: 'Discover unexpected series from our complete library.',
    badgeColor: 'bg-emerald-500',
  },
};

const ITEMS_PER_PAGE = 24;

export default function CategoryPage() {
  const params = useParams();
  const rawType = params?.type as string;
  const categoryKey = rawType?.toLowerCase();

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
        .select('id, slug, title, cover_image_url, reading_mode, rating, followed_count', {
          count: 'exact',
        });

      // Format filtering
      if (selectedFormat === 'manga') {
        query = query.eq('reading_mode', 'manga');
      } else if (selectedFormat === 'manhwa' || selectedFormat === 'manhua') {
        query = query.eq('reading_mode', 'webtoon');
      }

      // Order query based on category
      if (categoryKey === 'trending') {
        query = query.order('rating', { ascending: false, nullsFirst: false });
      } else if (categoryKey === 'popular') {
        query = query.order('followed_count', { ascending: false, nullsFirst: false });
      } else if (categoryKey === 'latest') {
        query = query.order('created_at', { ascending: false });
      } else if (categoryKey === 'random') {
        // Sample broader batch and randomize client-side
        query = query.limit(60);
      }

      if (categoryKey !== 'random') {
        query = query.range(from, to);
      }

      const { data, count, error } = await query;

      if (!error && data) {
        if (categoryKey === 'random') {
          const randomized = [...data].sort(() => 0.5 - Math.random()).slice(0, ITEMS_PER_PAGE);
          setSeriesList(randomized);
          setTotalCount(randomized.length);
        } else {
          setSeriesList(data);
          setTotalCount(count || 0);
        }
      }

      setLoading(false);
    }

    if (config) {
      fetchCategoryData();
    }
  }, [categoryKey, currentPage, selectedFormat]);

  if (!config) return null;

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 min-h-screen text-neutral-100">
      {/* Header */}
      <div className="pb-6 border-b border-neutral-800/80 mb-6">
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`w-2 h-5 ${config.badgeColor} rounded-sm`}></span>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {config.title}
          </h1>
        </div>
        <p className="text-xs text-neutral-400 max-w-2xl">
          {config.description}
        </p>

        {/* Format Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {[
            { id: 'all', label: 'All Formats' },
            { id: 'manga', label: 'Manga' },
            { id: 'manhwa', label: 'Manhwa' },
            { id: 'manhua', label: 'Manhua' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedFormat(tab.id);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                selectedFormat === tab.id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center text-xs text-neutral-500">
          Loading {config.title.toLowerCase()}...
        </div>
      ) : seriesList.length === 0 ? (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-xs text-neutral-500">
          <p>No series found in this category.</p>
          <Link href="/filter" className="text-indigo-400 hover:underline">
            Browse all catalog titles →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {seriesList.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="flex flex-col group"
            >
              <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition shadow-md">
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
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
                {item.rating && (
                  <span className="absolute bottom-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/85 text-amber-400 border border-amber-500/30">
                    ★ {item.rating}
                  </span>
                )}
              </div>
              <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
                {item.title}
              </h3>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {categoryKey !== 'random' && totalPages > 1 && !loading && (
        <div className="mt-10 flex items-center justify-center gap-3 text-xs font-semibold">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 disabled:opacity-40 transition"
          >
            ← Previous
          </button>
          <span className="text-neutral-400 px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            className="px-3.5 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 disabled:opacity-40 transition"
          >
            Next →
          </button>
        </div>
      )}
    </main>
  );
}
