import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    sort?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchQuery = params?.q || '';
  const typeFilter = params?.type || 'all';
  const sort = params?.sort || 'latest';

  let query = supabase.from('series').select('id, slug, title, synopsis, cover_image_url, reading_mode, source', { count: 'exact' });

  // 1. Text Search
  if (searchQuery) {
    query = query.ilike('title', `%${searchQuery}%`);
  }

  // 2. Type Filter
  if (typeFilter === 'webtoon') {
    query = query.eq('reading_mode', 'webtoon');
  } else if (typeFilter === 'manga') {
    query = query.eq('reading_mode', 'manga');
  }

  // 3. Sorting
  if (sort === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: results, count } = await query;
  const series = results || [];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Browse Library</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{count || series.length} titles available</p>
        </div>
      </div>

      {/* MangaFire-Style Filter Box */}
      <form method="GET" action="/browse" className="bg-[#12141c] border border-neutral-800 rounded-2xl p-4 space-y-4">
        {/* Search bar row */}
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search titles..."
            className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs text-white"
          />
          <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition">
            Filter
          </button>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Type</label>
            <select name="type" defaultValue={typeFilter} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-200">
              <option value="all">All Types</option>
              <option value="manga">Manga (Japan)</option>
              <option value="webtoon">Webtoon (Manhwa/Manhua)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Sort By</label>
            <select name="sort" defaultValue={sort} className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-200">
              <option value="latest">Latest Updates</option>
              <option value="trending">Trending</option>
              <option value="popular">Most Popular</option>
              <option value="newest">Recently Added</option>
            </select>
          </div>

          <div className="flex items-end">
            <Link href="/browse" className="text-center w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-lg text-xs transition">
              Reset Filters
            </Link>
          </div>
        </div>
      </form>

      {/* Results Grid */}
      {series.length === 0 ? (
        <div className="p-16 text-center text-sm text-neutral-500 bg-neutral-900/30 rounded-2xl border border-neutral-800">
          No series found matching your filters.
        </div>
      ) : (
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
                <span className="absolute top-2 left-2 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
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
      )}
    </main>
  );
}
