import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// Revalidate page data every 60 seconds
export const revalidate = 60;

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
  const { data: seriesList, error } = await supabase
    .from('series')
    .select('id, slug, title, synopsis, cover_image_url, reading_mode, source')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching series:', error.message);
  }

  const items: SeriesItem[] = seriesList || [];

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-neutral-100 font-sans selection:bg-indigo-500 selection:text-white pb-20">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-neutral-800/80 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="text-indigo-500">Manga</span>
              <span>Flow</span>
            </h1>
            <p className="text-xs text-neutral-400">Automated Cloud Reader</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {items.length} {items.length === 1 ? 'Series' : 'Series'} Synced
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold tracking-wider text-neutral-400 uppercase">
            Popular & Trending
          </h2>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-12 text-center">
            <p className="text-neutral-400 text-sm">No series found in the database yet.</p>
            <p className="text-neutral-500 text-xs mt-1">Run the GitHub Actions scraper to sync titles.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((series) => (
              <Link
                key={series.id}
                href={`/series/${series.slug}`}
                className="group relative flex flex-col overflow-hidden rounded-xl bg-neutral-900/60 border border-neutral-800/80 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
              >
                {/* Cover Image Container */}
                <div className="aspect-[3/4] w-full relative bg-neutral-950 overflow-hidden">
                  {series.cover_image_url ? (
                    <img
                      src={series.cover_image_url}
                      alt={series.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center p-4 text-center text-xs text-neutral-500">
                      No Cover
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />

                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-indigo-300 border border-white/10">
                      {series.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                    </span>
                  </div>

                  {series.source && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-900/80 text-neutral-300 border border-neutral-700/60">
                        {series.source}
                      </span>
                    </div>
                  )}
                </div>

                {/* Series Details */}
                <div className="p-3 flex flex-col flex-1 justify-between">
                  <div>
                    <h3 className="font-semibold text-sm line-clamp-2 text-neutral-100 group-hover:text-indigo-400 transition-colors">
                      {series.title}
                    </h3>
                    {series.synopsis && (
                      <p className="text-neutral-400 text-xs line-clamp-2 mt-1.5 leading-relaxed">
                        {series.synopsis}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-xs text-neutral-500">
                    <span>Read Now</span>
                    <span className="text-indigo-400 group-hover:translate-x-1 transition-transform">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
