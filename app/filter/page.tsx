'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Harem',
  'Historical', 'Horror', 'Isekai', 'Martial Arts', 'Mecha',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Supernatural', 'Thriller', 'Cultivation', 'Reincarnation', 'System'
];

export default function FilterPage() {
  const [selectedType, setSelectedType] = useState('all');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [sortBy, setSortBy] = useState('latest');
  const [searchTitle, setSearchTitle] = useState('');

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function executeFilter() {
      setLoading(true);
      let query = supabase.from('series').select('id, slug, title, english_title, cover_image_url, reading_mode, rating, status', { count: 'exact' });

      if (selectedType === 'manga') query = query.eq('reading_mode', 'manga');
      else if (selectedType === 'manhwa' || selectedType === 'manhua') query = query.eq('reading_mode', 'webtoon');

      if (selectedStatus !== 'all') query = query.ilike('status', `%${selectedStatus}%`);
      if (searchTitle.trim()) query = query.or(`title.ilike.%${searchTitle.trim()}%,english_title.ilike.%${searchTitle.trim()}%`);

      if (sortBy === 'rating') query = query.order('rating', { ascending: false, nullsFirst: false });
      else if (sortBy === 'popular') query = query.order('followed_count', { ascending: false, nullsFirst: false });
      else if (sortBy === 'title') query = query.order('title', { ascending: true });
      else query = query.order('created_at', { ascending: false });

      const { data, count } = await query.limit(36);
      setResults(data || []);
      setTotalCount(count || 0);
      setLoading(false);
    }

    const timer = setTimeout(executeFilter, 150);
    return () => clearTimeout(timer);
  }, [selectedType, selectedGenre, selectedStatus, sortBy, searchTitle]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 min-h-screen text-neutral-100">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Browse Catalog</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{totalCount} titles available</p>
        </div>
      </div>

      <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-4 sm:p-5 space-y-4 mb-8 shadow-xl">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Filter by title..."
            value={searchTitle}
            onChange={(e) => setSearchTitle(e.target.value)}
            className="flex-1 bg-neutral-900/90 border border-neutral-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-indigo-500 transition"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold text-neutral-400 block mb-1.5 uppercase tracking-wider">Format</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="manga">Manga</option>
              <option value="manhwa">Manhwa / Webtoon</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-400 block mb-1.5 uppercase tracking-wider">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="releasing">Releasing</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-400 block mb-1.5 uppercase tracking-wider">Genre</label>
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Genres</option>
              {ALL_GENRES.map((g) => (
                <option key={g} value={g.toLowerCase()}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-neutral-400 block mb-1.5 uppercase tracking-wider">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="latest">Latest Release</option>
              <option value="popular">Most Followed</option>
              <option value="rating">Highest Rated</option>
              <option value="title">A - Z</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs">Filtering library...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="py-24 text-center text-xs text-neutral-500">
          No titles matched the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4">
          {results.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="group bg-[#12141c] border border-neutral-800/80 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col"
            >
              <div className="relative aspect-[3/4.2] overflow-hidden bg-neutral-900">
                <img
                  src={item.cover_image_url || '/placeholder.png'}
                  alt={item.title}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg bg-black/70 text-indigo-300 border border-white/10 backdrop-blur-md">
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between">
                <h3 className="text-xs font-bold text-white group-hover:text-indigo-400 line-clamp-2 transition">
                  {item.english_title || item.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
