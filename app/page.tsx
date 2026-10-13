import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// Force Next.js & Vercel to always fetch fresh data from Supabase on every reload
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
  source: string | null;
}

export default async function HomePage() {
  // Fetch all series ordered by newest first
  const { data: seriesList, count } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, cover_image_url, reading_mode, source', { count: 'exact' })
    .order('created_at', { ascending: false });

  const series: SeriesItem[] = seriesList || [];
  const totalCount = count || series.length;

  return (
    <main className="min-h-screen bg-[#070709] text-neutral-100 px-4 py-8 max-w-7xl mx-auto">
      {/* Header Bar */}
      <header className="flex items-center justify-between border-b border-neutral-800/80 pb-6 mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span className="text-indigo-500">Manga</span> Flow
          </h1>
          <p className="text-xs text-neutral-400 mt-1">Automated Cloud Reader</p>
        </div>

        <div className="bg-indigo-950/40 border border-indigo-800/50 rounded-full px-4 py-1 text-xs font-semibold text-indigo-300">
          {totalCount} Series Synced
        </div>
      </header>

      {/* Section Title */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400">
          Popular & Trending
        </h2>
      </div>

      {/* Grid Display */}
      {series.length === 0 ? (
        <div className="p-16 text-center text-sm text-neutral-500 bg-neutral-900/30 rounded-2xl border border-neutral-800">
          No series found. Run the GitHub Action to sync titles into Supabase.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
          {series.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.slug}`}
              className="group relative flex flex-col bg-neutral-900/40 border border-neutral-800/80 hover:border-indigo-500/50 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1 shadow-sm hover:shadow-lg hover:shadow-indigo-950/20"
            >
              {/* Cover Container */}
              <div className="relative aspect-[3/4] w-full bg-neutral-900 overflow-hidden">
                {item.cover_image_url ? (
                  <img
                    src={item.cover_image_url}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600 bg-neutral-900">
                    No Cover
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-neutral-200 border border-white/10">
                    {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-neutral-400 border border-white/10">
                    {item.source || 'Dex'}
                  </span>
                </div>
              </div>

              {/* Title & Details */}
              <div className="p-3 flex flex-col flex-grow justify-between">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-white line-clamp-2 group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400 line-clamp-2 mt-1">
                    {item.synopsis || 'Read online on Manga Flow.'}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500 font-medium">
                  <span>Read Now</span>
                  <span className="group-hover:translate-x-0.5 transition-transform text-indigo-400">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
