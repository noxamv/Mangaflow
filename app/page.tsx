'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80';

interface SeriesItem {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
  total_chapters?: number;
}

interface ContinueItem {
  series_id: string;
  chapter_id: string;
  chapter_number: number;
  series: SeriesItem;
}

interface RecentComment {
  id: string;
  username: string;
  content: string;
  created_at: string;
  series: {
    title: string;
    slug: string;
  };
}

// Helper to reliably resolve cover image regardless of column naming
function getCoverUrl(item: any): string {
  const url = item?.cover_image_url || item?.cover_url;
  if (!url || typeof url !== 'string' || url.trim() === '' || url.includes('placeholder')) {
    return FALLBACK_COVER;
  }
  return url;
}

function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];
  const coverUrl = getCoverUrl(current);

  return (
    <div className="relative w-full aspect-[16/9] max-h-[280px] sm:max-h-[340px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      <div
        className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-25 transition-all duration-700"
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/85 to-black/30 z-10" />

      <div className="relative z-20 w-full h-full p-4 sm:p-6 flex items-center justify-between gap-4">
        <div className="max-w-[65%] sm:max-w-md space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-black/60 text-neutral-300 border border-white/10">
              {current.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
          </div>

          <h2 className="text-sm sm:text-lg font-black text-white line-clamp-1">
            {current.title}
          </h2>

          <p className="text-[10px] sm:text-xs text-neutral-400 line-clamp-2">
            {current.synopsis || 'Read online for free on MangaFlow.'}
          </p>

          <div className="pt-1">
            <Link
              href={`/series/${current.slug}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition"
            >
              Read Now →
            </Link>
          </div>
        </div>

        <div className="shrink-0 w-24 sm:w-32 aspect-[3/4.2] rounded-xl overflow-hidden border border-white/15 shadow-2xl bg-neutral-900">
          <img
            src={coverUrl}
            alt={current.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_COVER;
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ShareBar() {
  const [copied, setCopied] = useState(false);
  const siteUrl = 'https://mangaflow-psi.vercel.app';
  const shareText = 'Read free manga and manhwa on MangaFlow!';

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(siteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between bg-[#13151f] border border-neutral-800/80 px-4 py-2.5 rounded-xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">Share MangaFlow:</span>
      <div className="flex items-center gap-2">
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] rounded-lg transition"
          title="Share to Facebook"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>

        <a
          href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
          title="Share to X"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>

        <a
          href={`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + siteUrl)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg transition"
          title="Share to WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
          </svg>
        </a>

        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-lg transition"
          title="Share to Telegram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.197 1.006.128.832.941z" />
          </svg>
        </a>

        <a
          href={`https://reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent('MangaFlow Free Reader')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#FF4500]/20 hover:bg-[#FF4500]/30 text-[#FF4500] rounded-lg transition"
          title="Share to Reddit"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .616-.319 1.157-.802 1.467.037.234.056.474.056.719 0 3.654-4.244 6.617-9.477 6.617-5.233 0-9.477-2.963-9.477-6.617 0-.245.019-.485.056-.719a1.745 1.745 0 0 1-.802-1.467c0-.968.786-1.754 1.754-1.754.477 0 .899.182 1.207.491 1.194-.856 2.85-1.418 4.674-1.488l.964-4.516a.375.375 0 0 1 .444-.289l3.18.669a1.248 1.248 0 0 1 1.066-.607z" />
          </svg>
        </a>

        <button
          onClick={copyUrl}
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition"
          title="Copy Link"
        >
          {copied ? '✓' : '🔗'}
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [continueList, setContinueList] = useState<ContinueItem[]>([]);
  const [trendingList, setTrendingList] = useState<SeriesItem[]>([]);
  const [popularList, setPopularList] = useState<SeriesItem[]>([]);
  const [latestList, setLatestList] = useState<SeriesItem[]>([]);
  const [randomList, setRandomList] = useState<SeriesItem[]>([]);
  const [recentComments, setRecentComments] = useState<RecentComment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Query series with an inner join on chapters to strictly hide empty shell series
      const baseSelect = `
        id, 
        slug, 
        title, 
        synopsis, 
        cover_image_url, 
        reading_mode,
        chapters!inner (id)
      `;

      try {
        const [trendingRes, popRes, latestRes, randomRes, commRes] = await Promise.all([
          supabase
            .from('series')
            .select(baseSelect)
            .order('rating', { ascending: false, nullsFirst: false })
            .limit(12),
          supabase
            .from('series')
            .select(baseSelect)
            .order('followed_count', { ascending: false, nullsFirst: false })
            .limit(12),
          supabase
            .from('series')
            .select(baseSelect)
            .order('created_at', { ascending: false })
            .limit(12),
          supabase
            .from('series')
            .select(baseSelect)
            .limit(30),
          supabase
            .from('series_comments')
            .select('id, username, content, created_at, series (title, slug)')
            .order('created_at', { ascending: false })
            .limit(6),
        ]);

        const sanitize = (list: any[]): SeriesItem[] =>
          (list || []).map((s) => ({
            id: s.id,
            slug: s.slug || s.id,
            title: s.title,
            synopsis: s.synopsis,
            cover_image_url: s.cover_image_url,
            reading_mode: s.reading_mode,
            total_chapters: Array.isArray(s.chapters) ? s.chapters.length : 0,
          }));

        setTrendingList(sanitize(trendingRes.data || []));
        setPopularList(sanitize(popRes.data || []));
        setLatestList(sanitize(latestRes.data || []));
        setRandomList(sanitize(randomRes.data || []).sort(() => 0.5 - Math.random()).slice(0, 12));
        setRecentComments((commRes.data as any) || []);

        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          const { data: historyData } = await supabase
            .from('reading_history')
            .select('series_id, chapter_id, chapter_number, series (id, slug, title, cover_image_url, reading_mode)')
            .eq('user_id', authData.user.id)
            .order('updated_at', { ascending: false })
            .limit(12);

          if (historyData) {
            setContinueList(historyData as any);
          }
        }
      } catch (err) {
        console.error('Error fetching home feeds:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const HorizontalRow = ({
    title,
    viewAllHref,
    items,
    badgeColor,
  }: {
    title: string;
    viewAllHref: string;
    items: SeriesItem[];
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

        <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0 scroll-smooth">
          {items.map((item) => {
            const cover = getCoverUrl(item);

            return (
              <Link
                key={item.id}
                href={`/series/${item.slug}`}
                className="shrink-0 w-28 sm:w-36 flex flex-col group"
              >
                <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition">
                  <img
                    src={cover}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = FALLBACK_COVER;
                    }}
                  />
                  <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-neutral-200 border border-white/10">
                    {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
                  {item.title}
                </h3>
              </Link>
            );
          })}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-xs text-neutral-500">
        Loading library...
      </div>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-0 sm:px-6 lg:px-8 py-4 space-y-6 sm:space-y-8">
      <div className="px-3 sm:px-0">
        <SpotlightSlider items={trendingList.slice(0, 7)} />
      </div>

      <div className="px-3 sm:px-0">
        <ShareBar />
      </div>

      {continueList.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-3 sm:px-0">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-4 bg-emerald-500 rounded-sm"></span>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Continue Reading
              </h2>
            </div>
          </div>

          <div className="flex gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar pb-2 px-3 sm:px-0">
            {continueList.map((entry) => {
              const cover = getCoverUrl(entry.series);

              return (
                <Link
                  key={entry.series_id}
                  href={`/read/${entry.chapter_id}`}
                  className="shrink-0 w-28 sm:w-36 flex flex-col group"
                >
                  <div className="relative aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 border border-neutral-800/80 group-hover:border-indigo-500/50 transition">
                    <img
                      src={cover}
                      alt={entry.series?.title || 'Series'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_COVER;
                      }}
                    />
                    <span className="absolute bottom-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-black/90 text-emerald-400 border border-emerald-500/30">
                      Ch. {entry.chapter_number}
                    </span>
                  </div>
                  <h3 className="text-xs font-semibold text-neutral-200 truncate mt-1.5 group-hover:text-indigo-400 transition">
                    {entry.series?.title}
                  </h3>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <HorizontalRow
        title="Trending Series"
        viewAllHref="/category/trending"
        items={trendingList}
        badgeColor="bg-amber-500"
      />
      <HorizontalRow
        title="Popular Series"
        viewAllHref="/category/popular"
        items={popularList}
        badgeColor="bg-indigo-500"
      />
      <HorizontalRow
        title="Random Picks"
        viewAllHref="/category/random"
        items={randomList}
        badgeColor="bg-emerald-500"
      />
      <HorizontalRow
        title="Latest Releases"
        viewAllHref="/category/latest"
        items={latestList}
        badgeColor="bg-cyan-500"
      />

      {/* Community Discussion Board */}
      <section className="space-y-3 px-3 sm:px-0 pt-6 border-t border-neutral-800/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded-sm"></span>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>Community Board</span>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                ● Live Discussions
              </span>
            </h2>
          </div>
        </div>

        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/50 shadow-xl">
          {recentComments.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500">
              No discussions yet. Visit any series detail page to start a conversation!
            </div>
          ) : (
            recentComments.map((comm) => (
              <Link
                key={comm.id}
                href={`/series/${comm.series?.slug}`}
                className="p-3.5 sm:p-4 hover:bg-neutral-800/30 transition flex items-start gap-3 group"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white text-xs shrink-0 mt-0.5">
                  {comm.username[0]?.toUpperCase() || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 transition truncate">
                      {comm.username}
                      <span className="text-[10px] font-normal text-neutral-500 ml-2">
                        on {comm.series?.title}
                      </span>
                    </span>
                    <span className="text-[10px] text-neutral-500 shrink-0">
                      {new Date(comm.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                    &ldquo;{comm.content}&rdquo;
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
