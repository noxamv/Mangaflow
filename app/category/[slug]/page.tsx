// app/category/[slug]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string;
  cover_image_url: string;
  cover_url?: string;
  reading_mode: string;
  rating?: number;
  followed_count?: number;
}

const ITEMS_PER_PAGE = 24;

export default function CategoryPage() {
  const params = useParams();
  const rawSlug = ((params?.slug as string) || '').toLowerCase();

  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Dynamic Category Meta Configuration
  const getCategoryMeta = (slug: string) => {
    switch (slug) {
      case 'manhwa':
        return { title: 'Korean Manhwa', desc: 'Full-color vertical scrolling comics from South Korea.', color: 'bg-rose-500' };
      case 'manga':
        return { title: 'Japanese Manga', desc: 'Traditional black & white Japanese manga series.', color: 'bg-indigo-500' };
      case 'manhua':
        return { title: 'Chinese Manhua', desc: 'Action, martial arts, and cultivation series from China.', color: 'bg-emerald-500' };
      case 'trending':
        return { title: 'Trending Series', desc: 'Top-rated titles actively being read right now.', color: 'bg-amber-500' };
      case 'popular':
        return { title: 'Popular Series', desc: 'Most followed and bookmarked titles on MangaFlow.', color: 'bg-purple-500' };
      case 'latest':
        return { title: 'Latest Releases', desc: 'Freshly updated chapters and newly added series.', color: 'bg-cyan-500' };
      default:
        return { 
          title: slug.charAt(0).toUpperCase() + slug.slice(1) + ' Comics', 
          desc: `Browse all ${slug} series available on MangaFlow.`, 
          color: 'bg-indigo-500' 
        };
    }
  };

  const meta = getCategoryMeta(rawSlug);

  useEffect(() => {
    async function fetchCategoryData() {
      setLoading(true);

      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('series')
        .select('id, slug, title, english_title, cover_image_url, cover_url, reading_mode, rating, followed_count', {
          count: 'exact',
        });

      // Filter by type or reading mode
      if (rawSlug === 'manhwa') {
        query = query.or('reading_mode.eq.webtoon,slug.ilike.%manhwa%');
      } else if (rawSlug === 'manga') {
        query = query.or('reading_mode.eq.manga,slug.ilike.%manga%');
      } else if (rawSlug === 'trending') {
        query = query.order('rating', { ascending: false, nullsFirst: false });
      } else if (rawSlug === 'popular') {
        query = query.order('followed_count', { ascending: false, nullsFirst: false });
      } else if (rawSlug === 'latest') {
        query = query.order('updated_at', { ascending: false });
      } else {
        // Genre or generic keyword fallback
        query = query.or(`title.ilike.%${rawSlug}%,synopsis.ilike.%${rawSlug}%`);
      }

      const { data, count, error } = await query.range(from, to);

      if (!error && data) {
        setSeriesList(data as SeriesItem[]);
        setTotalCount(count || 0);
      }
      setLoading(false);
    }

    fetchCategoryData();
  }, [rawSlug, currentPage]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  return (
    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-6 min-h-screen text-white">
      {/* Dynamic Header */}
      <div className="border-b border-neutral-800/80 pb-4 space-y-1">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-5 rounded-full ${meta.color}`} />
          <h1 className="text-xl sm:text-2xl font-black tracking-tight">{meta.title}</h1>
        </div>
        <p className="text-xs sm:text-sm text-neutral-400">{meta.desc}</p>
      </div>

      {/* Grid Content */}
      {loading ? (
        <div className="py-24 flex justify-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : seriesList.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <div className="text-4xl">📂</div>
          <p className="text-neutral-400 text-sm">No series found in this category.</p>
          <Link href="/" className="inline-block px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold">
            Back to Home
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
          {seriesList.map((item) => {
            const cover = item.cover_image_url || item.cover_url || '';
            const title = item.english_title || item.title || 'Untitled';

            return (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="group flex flex-col space-y-1.5"
              >
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 shadow-md transition">
                  {cover ? (
                    <img
                      src={cover}
                      alt={title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                      No Poster
                    </div>
                  )}

                  {item.reading_mode && (
                    <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200 border border-white/10">
                      {item.reading_mode === 'webtoon' ? 'MANHWA' : 'MANGA'}
                    </span>
                  )}

                  {item.rating && item.rating > 0 && (
                    <span className="absolute bottom-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-amber-400 border border-white/10">
                      ★ {item.rating.toFixed(1)}
                    </span>
                  )}
                </div>

                <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-indigo-400 line-clamp-1 transition">
                  {title}
                </h3>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-6">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-semibold disabled:opacity-30 transition"
          >
            ← Previous
          </button>
          <span className="text-xs text-neutral-400 font-mono px-2">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-semibold disabled:opacity-30 transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
