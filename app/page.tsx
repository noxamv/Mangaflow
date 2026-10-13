import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import SpotlightSliderClient from './SpotlightSliderClient';
import ShareBarClient from './ShareBarClient';

// Cache page at edge and refresh in background every 60s (Instant loads, 0s delay)
export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
}

async function getHomeData() {
  try {
    // Run all 5 queries simultaneously instead of one by one
    const [trendingRes, popRes, viewsRes, latestRes, randomRes] = await Promise.all([
      supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
        .order('rating', { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
        .order('followed_count', { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
        .order('views_count', { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('series')
        .select('id, slug, title, synopsis, cover_image_url, reading_mode')
        .limit(50),
    ]);

    const randomPool = randomRes.data || [];
    const randomized = [...randomPool].sort(() => 0.5 - Math.random()).slice(0, 12);

    return {
      trendingList: trendingRes.data || [],
      popularList: popRes.data || [],
      viewedList: viewsRes.data || [],
      latestList: latestRes.data || [],
      randomList: randomized,
    };
  } catch {
    return {
      trendingList: [],
      popularList: [],
      viewedList: [],
      latestList: [],
      randomList: [],
    };
  }
}

function HorizontalRow({
  title,
  viewAllHref,
  items,
  badgeColor,
}: {
  title: string;
  viewAllHref: string;
  items: SeriesItem[];
  badgeColor: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-3 sm:px-0">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-4 ${badgeColor} rounded-sm`}></span>
          <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">{title}</h2>
        </div>
        <Link href={viewAllHref} className="text-[11px] font-semibold text-neutral-400 hover:text-indigo-400 transition">
          View all →
        </Link>
      </div>

      <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0 scroll-smooth">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/series/${item.slug}`}
            className="shrink-0 w-28 sm:w-36 flex flex-col group"
          >
            <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition">
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
              <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
              </span>
            </div>
            <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
              {item.title}
            </h3>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const { trendingList, popularList, viewedList, latestList, randomList } = await getHomeData();
  const spotlightItems = trendingList.slice(0, 7);

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8">
      <div className="px-3 sm:px-0">
        <SpotlightSliderClient items={spotlightItems} />
      </div>

      <div className="px-3 sm:px-0">
        <ShareBarClient />
      </div>

      <HorizontalRow title="Trending Series" viewAllHref="/category/trending" items={trendingList} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" viewAllHref="/category/popular" items={popularList} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" viewAllHref="/category/views" items={viewedList} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" viewAllHref="/category/random" items={randomList} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" viewAllHref="/category/latest" items={latestList} badgeColor="bg-cyan-500" />
    </main>
  );
}
