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

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  synopsis?: string | null;
  cover_image_url?: string | null;
  cover_url?: string | null;
  reading_mode?: string | null;
  source?: string | null;
}

export default async function BrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchQuery = params?.q?.trim() || '';
  const typeFilter = params?.type || 'all';
  const sort = params?.sort || 'latest';

  let series: SeriesItem[] = [];
  let totalCount = 0;

  if (searchQuery) {
    // 1. Multi-Field Search (checks primary title, English title, native title, and alternate synonyms)
    const { data: rpcData, error: rpcError } = await supabase.rpc('search_all_titles', {
      search_query: searchQuery,
    });

    if (!rpcError && rpcData) {
      series = rpcData;
    } else {
      // Direct multi-column fallback query
      const { data: fallbackData } = await supabase
        .from('series')
        .select('id, slug, title, english_title, native_title, synonyms, synopsis, cover_image_url, reading_mode, source')
        .or(
          `title.ilike.%${searchQuery}%,english_title.ilike.%${searchQuery}%,native_title.ilike.%${searchQuery}%,synonyms.cs.{"${searchQuery}"}`
        )
        .limit(40);
      series = fallbackData || [];
    }

    // Apply type filter in-memory if user filtered by type while searching
    if (typeFilter === 'webtoon') {
      series = series.filter((s) => s.reading_mode === 'webtoon');
    } else if (typeFilter === 'manga') {
      series = series.filter((s) => s.reading_mode !== 'webtoon');
    }

    totalCount = series.length;
  } else {
    // 2. Default Browse Flow (Paginated & Filtered)
    let query = supabase
      .from('series')
      .select('id, slug, title, english_title, native_title, synopsis, cover_image_url, reading_mode, source', {
        count: 'exact',
      });

    if (typeFilter === 'webtoon') {
      query = query.eq('reading_mode', 'webtoon');
    } else if (typeFilter === 'manga') {
      query = query.neq('reading_mode', 'webtoon');
    }

    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('updated_at', { ascending: false, nullsFirst: false });
    }

    const { data: results, count } = await query.limit(48);
    series = results || [];
    totalCount = count || series.length;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Browse Library</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            {totalCount} {totalCount === 1 ? 'title' : 'titles'} available
          </p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <form
        method="GET"
        action="/browse"
        className="bg-[#12141c] border border-neutral-800 rounded-2xl p-4 space-y-4"
      >
        <div className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search by English, Romaji, Pinyin, or Alternate Titles..."
            className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-indigo-500 rounded-xl px-4 py-2 text-xs text-white placeholder-neutral-500 outline-none"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition"
          >
            Search
          </button>
        </div>

        {/* Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
              Type
            </label>
            <select
              name="type"
              defaultValue={typeFilter}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none"
            >
              <option value="all">All Types</option>
              <option value="manga">Manga (Japan)</option>
              <option value="webtoon">Webtoon (Manhwa/Manhua)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
              Sort By
            </label>
            <select
              name="sort"
              defaultValue={sort}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-neutral-200 outline-none"
            >
              <option value="latest">Latest Updates</option>
              <option value="newest">Recently Added</option>
            </select>
          </div>

          <div className="flex items-end">
            <Link
              href="/browse"
              className="text-center w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold rounded-lg text-xs transition"
            >
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
          {series.map((item) => {
            const displayTitle = item.english_title || item.title;
            const cover = item.cover_image_url || item.cover_url;

            return (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="group relative flex flex-col bg-neutral-900/40 border border-neutral-800/80 hover:border-indigo-500/50 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm"
              >
                <div className="relative aspect-[3/4.2] w-full bg-neutral-900 overflow-hidden">
                  {cover ? (
                    <img
                      src={cover}
                      alt={displayTitle}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                      No Cover
                    </div>
                  )}
                  <span className="absolute top-2 left-2 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                    {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                  </span>
                </div>
                <div className="p-2.5 space-y-0.5">
                  <h3
                    className="text-xs font-semibold text-neutral-200 truncate group-hover:text-indigo-400 transition-colors"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </h3>
                  {item.english_title && item.english_title !== item.title && (
                    <p className="text-[10px] text-neutral-500 truncate" title={item.title}>
                      {item.title}
                    </p>
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
