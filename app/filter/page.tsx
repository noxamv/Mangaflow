'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Martial Arts', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Supernatural', 'Thriller', 'Historical', 'School Life',
  'Isekai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Reincarnation',
  'Monster Girls', 'Mecha', 'Tragedy', 'Magic'
];

export default function FilterPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [sort, setSort] = useState('latest');

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchFiltered = async () => {
    setLoading(true);
    let query = supabase.from('series').select('*', { count: 'exact' });

    if (searchTerm.trim()) {
      query = query.or(`title.ilike.%${searchTerm.trim()}%,english_title.ilike.%${searchTerm.trim()}%`);
    }

    if (type !== 'All') {
      query = query.eq('reading_mode', type === 'Manhwa' ? 'webtoon' : 'manga');
    }

    if (status !== 'All') {
      query = query.ilike('status', `%${status}%`);
    }

    if (selectedGenre !== 'All') {
      query = query.or(`synopsis.ilike.%${selectedGenre}%,title.ilike.%${selectedGenre}%`);
    }

    if (sort === 'latest') {
      query = query.order('updated_at', { ascending: false });
    } else if (sort === 'rating') {
      query = query.order('rating', { ascending: false, nullsFirst: false });
    } else if (sort === 'az') {
      query = query.order('title', { ascending: true });
    }

    const { data, count } = await query.limit(36);
    setResults(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchFiltered();
  }, [type, status, selectedGenre, sort]);

  const handleReset = () => {
    setSearchTerm('');
    setType('All');
    setStatus('All');
    setSelectedGenre('All');
    setSort('latest');
  };

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-neutral-800 pb-4">
        <h1 className="text-xl font-bold text-white">Browse & Filter</h1>
        <p className="text-xs text-neutral-400 mt-1">Explore titles using filters and genres</p>
      </div>

      {/* MangaFire-Style Filter Matrix */}
      <div className="bg-[#14161f] border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-xl">
        {/* Search Bar Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search titles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchFiltered()}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
          />
          <button
            onClick={fetchFiltered}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg transition"
          >
            Apply
          </button>
        </div>

        {/* Dropdown Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
            >
              <option value="All">All Types</option>
              <option value="Manhwa">Manhwa (Webtoon)</option>
              <option value="Manga">Manga</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
            >
              <option value="All">All Statuses</option>
              <option value="Releasing">Releasing / Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-1">Sort By</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
            >
              <option value="latest">Latest Release</option>
              <option value="rating">Highest Rated</option>
              <option value="az">A to Z</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleReset}
              className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-semibold text-xs rounded-lg transition"
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* 24+ Selectable Genres */}
        <div>
          <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block mb-2">Genres</label>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
            <button
              type="button"
              onClick={() => setSelectedGenre('All')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${selectedGenre === 'All' ? 'bg-amber-400 text-black font-semibold' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'}`}
            >
              All
            </button>
            {GENRES.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => setSelectedGenre(g)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${selectedGenre === g ? 'bg-amber-400 text-black font-semibold' : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-800'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Catalog Results Grid */}
      <div className="space-y-3">
        <p className="text-xs text-neutral-500 font-medium">{totalCount} titles found</p>

        {loading ? (
          <div className="py-20 text-center text-xs text-neutral-500">Filtering catalog...</div>
        ) : results.length === 0 ? (
          <div className="py-20 text-center text-xs text-neutral-500">No titles match the chosen filters.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
            {results.map((s) => (
              <Link
                key={s.id}
                href={`/series/${s.slug}`}
                className="group block bg-[#14161f] border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition"
              >
                <div className="aspect-[3/4.2] overflow-hidden bg-neutral-900">
                  <img
                    src={s.cover_image_url || '/placeholder.png'}
                    alt={s.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-white truncate group-hover:text-amber-400 transition">
                    {s.english_title || s.title}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                    <span className="uppercase">{s.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}</span>
                    <span className="text-amber-400">{s.status || 'Ongoing'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
