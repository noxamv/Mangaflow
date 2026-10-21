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
    rating?: string;
    status?: string;
    genre?: string;
    sort?: string;
  }>;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params?.q?.trim() || '';
  const type = params?.type || 'all';
  const rating = params?.rating || 'all';
  const status = params?.status || 'all';
  const sort = params?.sort || 'latest';

  let query = supabase
    .from('series')
    .select('id, slug, title, english_title, cover_image_url, reading_mode, type, status, rating', {
      count: 'exact',
    });

  if (q) {
    query = query.or(`title.ilike.%${q}%,english_title.ilike.%${q}%`);
  }

  if (type !== 'all') {
    query = query.eq('type', type);
  }

  if (status !== 'all') {
    query = query.ilike('status', `%${status}%`);
  }

  if (sort === 'popular') {
    query = query.order('followed_count', { ascending: false, nullsFirst: false });
  } else if (sort === 'rating') {
    query = query.order('rating', { ascending: false, nullsFirst: false });
  } else if (sort === 'title') {
    query = query.order('title', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data: series, count } = await query.limit(60);
  const totalCount = count || 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white">Browse Library</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{totalCount} titles available</p>
        </div>
      </div>

      {/* MangaFire-Style Filter Accordion Panel */}
      <form method="GET" action="/browse" className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search titles..."
            className="flex-1 bg-neutral-900 border border-neutral-700/80 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-indigo-600/30"
          >
            Filters
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Content Rating</label>
            <select
              name="rating"
              defaultValue={rating}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">Any</option>
              <option value="safe">Safe</option>
              <option value="suggestive">Suggestive</option>
              <option value="erotica">Erotica</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Type</label>
            <select
              name="type"
              defaultValue={type}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">Any</option>
              <option value="manga">Manga</option>
              <option value="manhwa">Manhwa</option>
              <option value="manhua">Manhua</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Status</label>
            <select
              name="status"
              defaultValue={status}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">Any</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1">Sort</label>
            <select
              name="sort"
              defaultValue={sort}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="latest">Latest update</option>
              <option value="popular">Most views / follows</option>
              <option value="rating">Rating</option>
              <option value="title">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
          <Link
            href="/browse"
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg bg-neutral-800 transition"
          >
            Reset filters
          </Link>
          <button
            type="submit"
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300"
          >
            Apply Filters →
          </button>
        </div>
      </form>

      {/* Grid */}
      {(!series || series.length === 0) ? (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl p-12 text-center text-neutral-400 text-xs">
          No series matched your filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {series.map((item: any) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="group flex flex-col bg-[#11131a] border border-neutral-800/80 hover:border-indigo-500/40 rounded-2xl overflow-hidden transition shadow-lg"
            >
              <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-neutral-900">
                <img
                  src={item.cover_image_url}
                  alt={item.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200">
                  {item.type || (item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga')}
                </span>
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
    </main>
  );
}
