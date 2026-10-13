import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function HomePage() {
  // 1. Fetch series list
  const { data: seriesList, count } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, cover_image_url, reading_mode, source', { count: 'exact' })
    .order('created_at', { ascending: false });

  // 2. Fetch latest released chapters for the "Latest Updates" feed
  const { data: latestChapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, created_at, series_id, series:series_id(title, slug, cover_image_url, reading_mode)')
    .order('created_at', { ascending: false })
    .limit(16);

  const series = seriesList || [];
  const trending = series.slice(0, 6);
  const updates = latestChapters || [];

  return (
    <main className="min-h-screen bg-[#08080a] text-neutral-100 pb-16">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#0c0d12]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-500/20">
              M
            </span>
            <span className="text-xl font-black tracking-tight text-white">
              Manga<span className="text-indigo-400">Flow</span>
            </span>
          </Link>
        </div>

        {/* Global Catalog Count */}
        <div className="flex items-center gap-3">
          <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold px-3 py-1 rounded-full">
            {count || series.length} Titles Online
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 pt-6 space-y-10">

        {/* SECTION 1: Trending Row (Cards with Badges) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 bg-indigo-500 rounded-sm"></span>
              <h2 className="text-base font-bold tracking-tight text-white">Trending Now</h2>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {trending.map((item) => (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="group relative flex flex-col bg-neutral-900/60 border border-neutral-800/70 hover:border-indigo-500/50 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm"
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
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                      No Cover
                    </div>
                  )}

                  <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-indigo-300 border border-indigo-500/30">
                    {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>

                <div className="p-2.5 flex flex-col flex-grow justify-between">
                  <h3 className="text-xs font-semibold text-neutral-100 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[10px] text-neutral-500 font-medium mt-1">Read Now →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* SECTION 2: Latest Updates (MangaFire Style List with Chapter Chips) */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 bg-violet-500 rounded-sm"></span>
              <h2 className="text-base font-bold tracking-tight text-white">Latest Updates</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {updates.map((ch: any) => {
              const item = ch.series;
              if (!item) return null;

              return (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 p-2 rounded-xl bg-neutral-900/40 border border-neutral-800/80 hover:border-neutral-700 transition"
                >
                  <Link href={`/series/${item.slug}`} className="shrink-0 w-14 h-18 rounded-lg overflow-hidden bg-neutral-800">
                    <img
                      src={item.cover_image_url}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </Link>

                  <div className="flex flex-col min-w-0 flex-grow">
                    <Link
                      href={`/series/${item.slug}`}
                      className="text-xs font-bold text-neutral-200 hover:text-indigo-400 truncate"
                    >
                      {item.title}
                    </Link>

                    <div className="mt-2 flex items-center justify-between">
                      <Link
                        href={`/series/${item.slug}/read/${ch.chapter_number}`}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 px-2 py-0.5 rounded-md"
                      >
                        Ch. {ch.chapter_number}
                      </Link>
                      <span className="text-[10px] text-neutral-500">Updated</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SECTION 3: All Catalog Grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-5 bg-sky-500 rounded-sm"></span>
              <h2 className="text-base font-bold tracking-tight text-white">Full Library</h2>
            </div>
          </div>

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
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                      No Cover
                    </div>
                  )}

                  <span className="absolute top-2 left-2 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                    {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>

                <div className="p-2.5 flex flex-col flex-grow justify-between">
                  <h3 className="text-xs font-semibold text-neutral-200 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[10px] text-neutral-500 font-medium mt-1">Read Now →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}
