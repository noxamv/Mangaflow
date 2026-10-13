import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';
import SpotlightSlider from '../components/SpotlightSlider';

// Revalidate in the background every 60 seconds (prevents slow cold starts)
export const revalidate = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface SeriesRow {
  id: string;
  title: string;
  slug: string;
  cover_url?: string;
  cover_image_url?: string;
  description?: string;
  synopsis?: string;
  reading_mode?: string;
}

async function getFeaturedSeries(): Promise<SeriesRow[]> {
  try {
    const { data, error } = await supabase
      .from('series')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error || !data) return [];
    return data as SeriesRow[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const seriesList = await getFeaturedSeries();

  // Map to the shape expected by SpotlightSlider
  const spotlightItems = seriesList.slice(0, 5).map((item) => ({
    ...item,
    cover_image_url: item.cover_image_url || item.cover_url || '',
    synopsis: item.synopsis || item.description || '',
    reading_mode: item.reading_mode || 'webtoon',
  }));

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      {/* Featured Spotlight */}
      {spotlightItems.length > 0 && (
        <section className="w-full mb-8">
          <SpotlightSlider items={spotlightItems as any} />
        </section>
      )}

      {/* Main Catalog Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Latest Releases
          </h1>
          <Link
            href="/browse"
            className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View All →
          </Link>
        </div>

        {seriesList.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            No series available yet. Check back soon!
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {seriesList.map((item) => {
              const cover = item.cover_image_url || item.cover_url;
              const desc = item.synopsis || item.description;

              return (
                <Link
                  key={item.id}
                  href={`/series/${item.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10"
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-slate-800 relative">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs px-2 text-center">
                        No Cover
                      </div>
                    )}
                  </div>

                  <div className="p-3 flex flex-col flex-grow">
                    <h2 className="text-sm font-semibold text-slate-200 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                      {item.title}
                    </h2>
                    {desc && (
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                        {desc}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
