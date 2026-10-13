import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const CATEGORY_MAP: Record<string, { title: string; subtitle: string; sortField: string }> = {
  trending: { title: 'Trending Series', subtitle: 'The highest-rated trending stories across manga and manhwa.', sortField: 'rating' },
  popular: { title: 'Popular Series', subtitle: 'All-time fan favorites with the highest followings.', sortField: 'followed_count' },
  views: { title: 'Most Viewed', subtitle: 'Leading records sorted by total community chapter views.', sortField: 'views_count' },
  latest: { title: 'Latest Releases', subtitle: 'Freshly indexed series and chapters.', sortField: 'created_at' },
  random: { title: 'Random Series', subtitle: 'Discover unexpected picks across all genres.', sortField: 'created_at' },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const config = CATEGORY_MAP[slug];

  if (!config) notFound();

  let query = supabase.from('series').select('id, slug, title, cover_image_url, reading_mode');

  if (slug === 'random') {
    const { data: all } = await query.limit(80);
    var series = (all || []).sort(() => 0.5 - Math.random()).slice(0, 40);
  } else {
    const { data: sorted } = await query.order(config.sortField, { ascending: false, nullsFirst: false }).limit(40);
    var series = sorted || [];
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="border-b border-neutral-800 pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-white">{config.title}</h1>
        <p className="text-xs text-neutral-400 mt-1">{config.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
        {series.map((item) => (
          <Link
            key={item.id}
            href={`/series/${item.slug}`}
            className="group relative flex flex-col bg-neutral-900/40 border border-neutral-800/80 hover:border-indigo-500/50 rounded-xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
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
              <span className="absolute top-2 left-2 text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/80 text-neutral-200 border border-white/10">
                {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
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
    </main>
  );
}
