import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface PageProps {
  searchParams: Promise<{ format?: string; type?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const formatFilter = params?.format;

  // Base query with optional format filter
  let query = supabase.from('series').select('id, slug, title, synopsis, cover_image_url, reading_mode, source');
  if (formatFilter === 'manhwa' || formatFilter === 'manhua') {
    query = query.eq('reading_mode', 'webtoon');
  } else if (formatFilter === 'manga') {
    query = query.eq('reading_mode', 'manga');
  }

  const { data: allSeries } = await query.order('created_at', { ascending: false });
  const series = allSeries || [];

  // Spotlight Title
  const spotlight = series[0] || null;

  // Horizontal Feed Partitions
  const trending = series.slice(0, 10);
  const popular = series.slice(10, 20);
  const mostViewed = series.slice(20, 30);
  const randomSeries = [...series].sort(() => 0.5 - Math.random()).slice(0, 10);
  const latestReleases = series.slice(30, 40);

  const HorizontalRow = ({ title, items, badgeColor }: { title: string; items: any[]; badgeColor: string }) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between px-4 sm:px-0">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-4 ${badgeColor} rounded-sm`}></span>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">{title}</h2>
          </div>
          <span className="text-[11px] text-neutral-400 hover:text-white cursor-pointer">View All →</span>
        </div>

        {/* Smooth Horizontal Scroll Shelf */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-4 sm:px-0 scroll-smooth">
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
                  {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                </span>
              </div>
              <h3 className="text-xs font-semibold text-neutral-200 truncate mt-2 group-hover:text-indigo-400 transition">
                {item.title}
              </h3>
            </Link>
          ))}
        </div>
      </section>
    );
  };

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-5 space-y-8">
      
      {/* 1. Spotlight / Highlight Hero */}
      {spotlight && (
        <div className="mx-4 sm:mx-0 relative rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-950 p-4 sm:p-6 flex flex-col sm:flex-row gap-5 items-center">
          <div className="w-32 sm:w-44 shrink-0 aspect-[3/4] rounded-xl overflow-hidden shadow-lg border border-neutral-800">
            <img 
              src={spotlight.cover_image_url} 
              alt={spotlight.title} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="flex flex-col items-center sm:items-start text-center sm:text-left space-y-2.5">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              Spotlight Recommendation
            </span>
            <h1 className="text-lg sm:text-2xl font-black text-white">{spotlight.title}</h1>
            <p className="text-xs text-neutral-400 line-clamp-3 max-w-xl">{spotlight.synopsis}</p>
            <div className="pt-2">
              <Link 
                href={`/series/${spotlight.slug}`}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition inline-block"
              >
                Read Now
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. MangaFire-style Share Links Bar */}
      <div className="mx-4 sm:mx-0 flex flex-wrap items-center justify-between gap-3 bg-neutral-900/40 border border-neutral-800/80 px-4 py-3 rounded-xl text-xs text-neutral-400">
        <span className="font-semibold text-neutral-300">Share MangaFlow with friends:</span>
        <div className="flex gap-2 text-white">
          <button className="px-2.5 py-1 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] rounded-md font-semibold text-[11px] transition">Facebook</button>
          <button className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-md font-semibold text-[11px] transition">X (Twitter)</button>
          <button className="px-2.5 py-1 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-md font-semibold text-[11px] transition">WhatsApp</button>
          <button className="px-2.5 py-1 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-md font-semibold text-[11px] transition">Telegram</button>
        </div>
      </div>

      {/* 3. Horizontal Rows */}
      <HorizontalRow title="Trending Series" items={trending} badgeColor="bg-amber-500" />
      <HorizontalRow title="Popular Series" items={popular} badgeColor="bg-indigo-500" />
      <HorizontalRow title="Most Viewed Series" items={mostViewed} badgeColor="bg-rose-500" />
      <HorizontalRow title="Random Picks" items={randomSeries} badgeColor="bg-emerald-500" />
      <HorizontalRow title="Latest Releases" items={latestReleases} badgeColor="bg-cyan-500" />

    </main>
  );
}
