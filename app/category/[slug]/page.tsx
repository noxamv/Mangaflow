import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const CATEGORY_MAP: Record<string, { title: string; subtitle: string; orderCol: string }> = {
  trending: { title: 'Trending Series', subtitle: 'The most popular manga and manhwa readers are enjoying today.', orderCol: 'created_at' },
  popular: { title: 'Popular Series', subtitle: 'All-time favorites with highest community followings.', orderCol: 'created_at' },
  views: { title: 'Most Viewed', subtitle: 'Top records by total chapter reads.', orderCol: 'created_at' },
  latest: { title: 'Latest Releases', subtitle: 'Freshly indexed chapters and newly serialized stories.', orderCol: 'created_at' },
  random: { title: 'Random Series', subtitle: 'Discover unexpected titles across every genre.', orderCol: 'created_at' },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const config = CATEGORY_MAP[slug];

  if (!config) notFound();

  const { data: seriesList } = await supabase
    .from('series')
    .select('id, slug, title, cover_image_url, reading_mode')
    .order(config.orderCol, { ascending: false })
    .limit(60);

  const series = seriesList || [];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Category Heading Banner */}
      <div className="border-b border-neutral-800 pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-white">{config.title}</h1>
        <p className="text-xs text-neutral-400 mt-1">{config.subtitle}</p>
      </div>

      {/* Grid Display */}
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
