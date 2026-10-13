import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import SpotlightSlider from '@/components/SpotlightSlider';
import ShareBar from '@/components/ShareBar';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function HomePage() {
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, cover_image_url, reading_mode, source')
    .order('created_at', { ascending: false });

  const series = allSeries || [];

  // Top 7 for the 1.7s 16:9 spotlight slider
  const spotlightItems = series.slice(0, 7);

  // Horizontal categories
  const trending = series.slice(0, 10);
  const popular = series.slice(10, 20);
  const mostViewed = series.slice(20, 30);
  const randomPicks = [...series].sort(() => 0.5 - Math.random()).slice(0, 10);
  const latestReleases = series.slice(30, 40);

  const HorizontalRow = ({
    title,
    viewAllHref,
    items,
    badgeColor,
  }: {
    title: string;
    viewAllHref: string;
    items: any[];
    badgeColor: string;
  }) => {
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

        {/* Horizontal Carousel Shelf */}
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
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">No Cover</div>
                )}
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                  {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
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
  };

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8">
      {/* 1. 16:9 Auto-Slider Spotlight */}
      <div className="px-3 sm:px-0">
        <SpotlightSlider items={spotlightItems} />
      </div>

      {/* 2. MangaFire-Style Share Bar */}
      <div className="px-3 sm:px-0">
        <ShareBar />
      </div>

      {/* 3. Horizontal Rows */}
      <HorizontalRow title="Trending Series" viewAllHref="/browse?sort=trending" items={trending} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" viewAllHref="/browse?sort=popular" items={popular} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" viewAllHref="/browse?sort=views" items={mostViewed} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" viewAllHref="/browse?sort=random" items={randomPicks} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" viewAllHref="/browse?sort=latest" items={latestReleases} badgeColor="bg-cyan-500" />
    </main>
  );
}
