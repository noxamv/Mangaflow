import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    sort?: string;
    rating?: string;
  }>;
}

export default async function FilterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params?.q || '';
  const type = params?.type || 'any';
  const sort = params?.sort || 'latest';

  let query = supabase.from('series').select('id, slug, title, cover_image_url, reading_mode', { count: 'exact' });

  if (q) {
    query = query.ilike('title', `%${q}%`);
  }
  if (type === 'webtoon') {
    query = query.eq('reading_mode', 'webtoon');
  } else if (type === 'manga') {
    query = query.eq('reading_mode', 'manga');
  }

  // Handle distinct sort metrics
  if (sort === 'popular') {
    query = query.order('followed_count', { ascending: false, nullsFirst: false });
  } else if (sort === 'views') {
    query = query.order('views_count', { ascending: false, nullsFirst: false });
  } else if (sort === 'rating') {
    query = query.order('rating', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: results, count } = await query.limit(60);
  const series = results || [];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Browse</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{count || series.length} titles</p>
        </div>
      </div>

      {/* MangaFire-Style Filter Panel (Exact 2-column grid structure) */}
      <form method="GET" action="/filter" className="bg-[#12141f] border border-neutral-800/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
        
        {/* Top search input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search titles..."
              className="w-full bg-[#181b29] border border-neutral-700/80 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none"
            />
            <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
            Filter
          </button>
        </div>

        {/* 2-Column Grid Filters (Matching MangaFire) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs">
          
          {/* Content Rating */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Content Rating</label>
            <select name="rating" className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="safe">Safe</option>
              <option value="suggestive">Suggestive</option>
            </select>
          </div>

          {/* Type */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Type</label>
            <select name="type" defaultValue={type} className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="manga">Manga (Japan)</option>
              <option value="webtoon">Manhwa & Manhua (Webtoon)</option>
            </select>
          </div>

          {/* Genres */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Genres</label>
            <select name="genre" className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="action">Action</option>
              <option value="fantasy">Fantasy</option>
              <option value="romance">Romance</option>
              <option value="comedy">Comedy</option>
            </select>
          </div>

          {/* Languages */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Languages</label>
            <select name="lang" className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Status</label>
            <select name="status" className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="ongoing">Releasing</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Author / Artist */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Author / Artist</label>
            <input
              type="text"
              name="author"
              placeholder="Any"
              className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200 placeholder-neutral-500"
            />
          </div>

          {/* Release Year */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Release Year</label>
            <div className="flex items-center gap-1.5">
              <input type="text" placeholder="From" className="w-1/2 bg-[#181b29] border border-neutral-700/70 rounded-lg px-2.5 py-2 text-neutral-200 text-xs" />
              <span className="text-neutral-500">-</span>
              <input type="text" placeholder="To" className="w-1/2 bg-[#181b29] border border-neutral-700/70 rounded-lg px-2.5 py-2 text-neutral-200 text-xs" />
            </div>
          </div>

          {/* Minimum Chapters */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Minimum Chapters</label>
            <select name="minChapters" className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="any">Any</option>
              <option value="10">10+ chapters</option>
              <option value="50">50+ chapters</option>
              <option value="100">100+ chapters</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Sort</label>
            <select name="sort" defaultValue={sort} className="w-full bg-[#181b29] border border-neutral-700/70 rounded-lg px-3 py-2 text-neutral-200">
              <option value="latest">Latest update</option>
              <option value="popular">Most followed</option>
              <option value="views">Most viewed</option>
              <option value="rating">Top rated</option>
            </select>
          </div>

          {/* Reset filters button */}
          <div className="flex items-end">
            <Link
              href="/filter"
              className="w-full flex items-center justify-center gap-2 py-2 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 font-bold rounded-lg text-xs transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              Reset filters
            </Link>
          </div>

        </div>
      </form>

      {/* Results Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {series.map((item) => (
          <Link
            key={item.id}
            href={`/series/${item.slug}`}
            className="group relative flex flex-col bg-neutral-900/40 border border-neutral-800/80 hover:border-indigo-500/50 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm"
          >
            <div className="relative aspect-[3/4.2] w-full bg-neutral-900 overflow-hidden">
              {item.cover_image_url ? (
                <img
                  src={item.cover_image_url}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">No Cover</div>
              )}
              <span className="absolute top-2 left-2 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
              </span>
            </div>
            <div className="p-2.5">
              <h3 className="text-xs font-semibold text-neutral-200 truncate group-hover:text-indigo-400 transition-colors">
                {item.title}
              </h3>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
