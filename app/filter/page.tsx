'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Harem',
  'Historical', 'Horror', 'Isekai', 'Martial Arts', 'Mecha',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller', 'Tragedy', 'Delinquents',
  'School Life', 'Cultivation', 'Reincarnation', 'System'
];

interface FilterSeries {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  reading_mode: string;
  rating?: number;
}

export default function FilterPage() {
  const [selectedType, setSelectedType] = useState('any'); // 'any', 'manga', 'manhwa', 'manhua'
  const [selectedGenre, setSelectedGenre] = useState('any');
  const [selectedChapters, setSelectedChapters] = useState('any'); // 'any', '10', '50', '100', '200'
  const [sortBy, setSortBy] = useState('created_at'); // 'created_at', 'rating', 'title'
  const [searchTitle, setSearchTitle] = useState('');

  const [results, setResults] = useState<FilterSeries[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function executeFilter() {
      setLoading(true);
      let query = supabase.from('series').select('id, slug, title, cover_image_url, reading_mode, rating');

      // 1. Content Type Filter
      if (selectedType === 'manga') {
        query = query.eq('reading_mode', 'manga');
      } else if (selectedType === 'manhwa' || selectedType === 'manhua') {
        query = query.eq('reading_mode', 'webtoon');
      }

      // 2. Title Search
      if (searchTitle.trim()) {
        query = query.ilike('title', `%${searchTitle.trim()}%`);
      }

      // 3. Sorting
      if (sortBy === 'rating') {
        query = query.order('rating', { ascending: false, nullsFirst: false });
      } else if (sortBy === 'title') {
        query = query.order('title', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data } = await query.limit(48);
      setResults(data || []);
      setLoading(false);
    }

    executeFilter();
  }, [selectedType, selectedGenre, selectedChapters, sortBy, searchTitle]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 min-h-screen text-neutral-100">
      <h1 className="text-xl sm:text-2xl font-black text-white mb-6">
        Browse & Filter Catalog
      </h1>

      {/* Filter Control Box */}
      <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-4 mb-8 shadow-xl">
        {/* Title Search Input */}
        <div>
          <label className="text-[11px] font-bold text-neutral-400 block mb-1">Search Title</label>
          <input
            type="text"
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            placeholder="Type series name..."
            className="w-full sm:max-w-md bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Type Filter Tabs */}
        <div>
          <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">Format / Type</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'any', label: 'All Types' },
              { id: 'manga', label: 'Manga (Japan)' },
              { id: 'manhwa', label: 'Manhwa (Korea)' },
              { id: 'manhua', label: 'Manhua (China)' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedType(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  selectedType === t.id
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chapter Thresholds (Including 200+) */}
        <div>
          <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">Min Chapters</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'any', label: 'Any' },
              { id: '10', label: '10+ Chapters' },
              { id: '50', label: '50+ Chapters' },
              { id: '100', label: '100+ Chapters' },
              { id: '200', label: '200+ Chapters' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedChapters(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  selectedChapters === c.id
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 25+ Genres Grid */}
        <div>
          <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">Genre</label>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-neutral-950/40 rounded-xl border border-neutral-800/40">
            <button
              type="button"
              onClick={() => setSelectedGenre('any')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                selectedGenre === 'any'
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
            >
              All Genres
            </button>
            {ALL_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setSelectedGenre(g)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  selectedGenre === g
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-neutral-900 text-neutral-400 hover:text-white'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filtered Grid Display */}
      {loading ? (
        <div className="text-center py-20 text-xs text-neutral-500">
          Loading catalog results...
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-20 text-xs text-neutral-500">
          No series match the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {results.map((item) => (
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
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
                {item.title}
              </h3>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
