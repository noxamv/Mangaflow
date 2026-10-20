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
    status?: string;
    sort?: string;
  }>;
}

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  synopsis?: string | null;
  cover_image_url?: string | null;
  reading_mode?: string | null;
  status?: string | null;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchQuery = params?.q?.trim() || '';
  const typeFilter = params?.type || 'all';
  const statusFilter = params?.status || 'all';
  const sort = params?.sort || 'latest';

  let series: SeriesItem[] = [];
  let totalCount = 0;

  if (searchQuery) {
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_all_titles', {
      search_query: searchQuery,
    });

    if (!rpcError && rpcData) {
      series = rpcData;
    } else {
      const { data: fallbackData } = await supabase
        .from('series')
        .select('id, slug, title, english_title, native_title, synopsis, cover_image_url, reading_mode, status')
        .or(`title.ilike.%${searchQuery}%,english_title.ilike.%${searchQuery}%,native_title.ilike.%${searchQuery}%`)
        .limit(60);
      series = fallbackData || [];
    }

    if (typeFilter === 'webtoon') {
      series = series.filter((s) => s.reading_mode === 'webtoon');
    } else if (typeFilter === 'manga') {
      series = series.filter((s) => s.reading_mode !== 'webtoon');
    }

    if (statusFilter !== 'all') {
      series = series.filter((s) => s.status?.toLowerCase() === statusFilter.toLowerCase());
    }

    totalCount = series.length;
  } else {
    let query = supabase
      .from('series')
      .select('id, slug, title, english_title, native_title, synopsis, cover_image_url, reading_mode, status', {
        count: 'exact',
      });

    if (typeFilter === 'webtoon') {
      query = query.eq('reading_mode', 'webtoon');
    } else if (typeFilter === 'manga') {
      query = query.neq('reading_mode', 'webtoon');
    }

    if (statusFilter !== 'all') {
      query = query.ilike('status', `%${statusFilter}%`);
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

    const { data, count } = await query.limit(60);
    series = data || [];
    totalCount = count || 0;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight sm:text-3xl">Browse Library</h1>
        <p className="text-xs sm:text-sm text-neutral-400 mt-1">{totalCount} titles available</p>
      </div>

      {/* Advanced Filter & Search Panel */}
      <form method="GET" action="/browse" className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by English, Romaji, Pinyin, or Alternate Titles..."
            className="flex-1 bg-neutral-900 border border-neutral-700/80 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-indigo-600/30"
          >
            Search
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">Format</label>
            <select
              name="type"
              defaultValue={typeFilter}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Formats</option>
              <option value="webtoon">Manhwa / Webtoon</option>
              <option value="manga">Manga</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">Publication Status</label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="all">All Statuses</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">Sort Order</label>
            <select
              name="sort"
              defaultValue={sort}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl px-3 py-2 text-xs text-neutral-200 outline-none focus:border-indigo-500"
            >
              <option value="latest">Latest Updates</option>
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="title">Alphabetical (A - Z)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
          <Link
            href="/browse"
            className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 transition"
          >
            Reset Filters
          </Link>
          <button
            type="submit"
            className="text-xs font-bold text-indigo-400 hover:text-indigo-300"
          >
            Apply Filters →
          </button>
        </div>
      </form>

      {/* Series Grid */}
      {series.length === 0 ? (
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl p-12 text-center text-neutral-400 text-xs">
          No series matched your filters. Try clearing some selections.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {series.map((item) => {
            const cover = item.cover_image_url || '';
            const displayTitle = item.english_title || item.title;

            return (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="group flex flex-col bg-[#11131a] border border-neutral-800/80 hover:border-indigo-500/40 rounded-2xl overflow-hidden transition shadow-lg"
              >
                <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-neutral-900">
                  <img
                    src={cover}
                    alt={displayTitle}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-neutral-200">
                    {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                  </span>
                  {item.status && (
                    <span className="absolute bottom-1.5 right-1.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/80 text-indigo-300">
                      {item.status}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <h3 className="text-xs font-bold text-white group-hover:text-indigo-400 truncate transition">
                    {displayTitle}
                  </h3>
                  {item.title !== displayTitle && (
                    <p className="text-[10px] text-neutral-500 truncate mt-0.5">{item.title}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
