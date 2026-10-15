'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';
import ShareBar from '../../../components/ShareBar';

const FALLBACK_COVER =
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400&q=80';

interface Chapter {
  id: string;
  chapter_number: number;
  title: string | null;
  pages?: string[] | null;
  created_at: string;
}

interface Series {
  id: string;
  title: string;
  slug: string;
  cover_url?: string;
  cover_image_url?: string;
  cover_image?: string;
  image?: string;
  description?: string;
  synopsis?: string;
  status?: string;
  author?: string;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    async function fetchSeriesData() {
      if (!slug) return;
      setLoading(true);

      try {
        const { data: seriesData, error: seriesError } = await supabase
          .from('series')
          .select('*')
          .or(`slug.eq.${slug},id.eq.${slug}`)
          .maybeSingle();

        if (seriesError || !seriesData) {
          setLoading(false);
          return;
        }

        setSeries(seriesData);

        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: followRecord } = await supabase
            .from('user_follows')
            .select('id')
            .eq('user_id', userData.user.id)
            .eq('series_id', seriesData.id)
            .maybeSingle();

          if (followRecord) setIsFollowing(true);
        }

        const { data: chapterData, error: chError } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, pages, created_at')
          .eq('series_id', seriesData.id)
          .order('chapter_number', { ascending: false });

        if (chapterData && !chError) {
          const validChapters = chapterData.filter(
            (c) => Array.isArray(c.pages) && c.pages.length > 0
          );
          setChapters(validChapters);
        }
      } catch (err) {
        console.error('Error fetching series details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSeriesData();
  }, [slug]);

  const handleFollowToggle = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setShowAuthModal(true);
      return;
    }

    if (!series) return;

    if (isFollowing) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('series_id', series.id);
      setIsFollowing(false);
    } else {
      await supabase.from('user_follows').insert({
        user_id: userData.user.id,
        series_id: series.id,
      });
      setIsFollowing(true);
    }
  };

  const getCoverUrl = () => {
    const raw =
      series?.cover_image_url ||
      series?.cover_url ||
      series?.cover_image ||
      series?.image ||
      '';
    if (!raw || raw.trim() === '' || raw.includes('placeholder')) {
      return FALLBACK_COVER;
    }
    return raw;
  };

  const formatChapterTitle = (ch: Chapter) => {
    const num = ch.chapter_number;
    if (!ch.title || ch.title.toLowerCase().includes('null') || ch.title.trim() === '') {
      return num === 0 ? 'Prologue' : `Chapter ${num}`;
    }
    if (ch.title.toLowerCase().trim() === `chapter ${num}`.toLowerCase()) {
      return `Chapter ${num}`;
    }
    return `Chapter ${num} - ${ch.title}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d12] text-xs text-neutral-500">
        Loading series details...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d12] px-4 text-center text-white">
        <h1 className="text-2xl font-bold">Series Not Found</h1>
        <p className="mt-2 text-sm text-neutral-400">
          This series may have been renamed or is still being indexed.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-500"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const latestChapter = chapters[0];
  const firstChapter = chapters[chapters.length - 1];
  const synopsisText =
    series.synopsis || series.description || 'Read online for free on MangaFlow.';

  return (
    <main className="min-h-screen bg-[#0d0d12] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="relative overflow-hidden rounded-2xl border border-neutral-800/80 bg-[#12141c] p-6 shadow-2xl sm:p-8">
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-10 blur-2xl filter"
            style={{ backgroundImage: `url(${getCoverUrl()})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141c] via-[#12141c]/80 to-transparent" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <div className="mx-auto aspect-[3/4.2] w-48 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-2xl md:mx-0 md:w-56">
              <img
                src={getCoverUrl()}
                alt={series.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  const raw =
                    series?.cover_image_url ||
                    series?.cover_url ||
                    series?.cover_image ||
                    series?.image;
                  if (raw && !target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(raw)}`;
                  } else {
                    target.src = FALLBACK_COVER;
                  }
                }}
              />
            </div>

            <div className="flex flex-1 flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-400 border border-purple-500/20">
                    {series.status || 'Ongoing'}
                  </span>
                  <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 border border-white/5">
                    {chapters.length} Chapters Available
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl lg:text-4xl">
                  {series.title}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-400">
                  <p>
                    Author:{' '}
                    <span className="font-medium text-neutral-200">
                      {series.author && series.author.toLowerCase() !== 'unknown'
                        ? series.author
                        : 'Official Production'}
                    </span>
                  </p>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-neutral-300 sm:text-sm line-clamp-4">
                  {synopsisText}
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t border-neutral-800/80">
                <div className="flex flex-wrap items-center gap-3">
                  {firstChapter && (
                    <Link
                      href={`/read/${firstChapter.id}`}
                      className="rounded-lg bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-purple-500"
                    >
                      Start Reading (Ch. {firstChapter.chapter_number})
                    </Link>
                  )}

                  {latestChapter && latestChapter.id !== firstChapter?.id && (
                    <Link
                      href={`/read/${latestChapter.id}`}
                      className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-xs font-semibold text-neutral-200 transition hover:bg-neutral-700"
                    >
                      Latest (Ch. {latestChapter.chapter_number})
                    </Link>
                  )}

                  <button
                    onClick={handleFollowToggle}
                    className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                      isFollowing
                        ? 'border border-neutral-700 bg-neutral-800/90 text-neutral-300 hover:bg-neutral-700'
                        : 'border border-purple-500/40 bg-purple-950/40 text-purple-300 hover:bg-purple-900/50'
                    }`}
                  >
                    {isFollowing ? '✓ Bookmarked' : '+ Bookmark Series'}
                  </button>
                </div>

                <ShareBar />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-lg font-bold text-white sm:text-xl">Available Chapters</h2>
            <span className="text-xs text-neutral-400">{chapters.length} Indexed</span>
          </div>

          {chapters.length === 0 ? (
            <div className="rounded-xl border border-neutral-800/80 bg-[#12141c] p-10 text-center">
              <p className="text-sm font-semibold text-neutral-300">
                Chapter panels are syncing in the background
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Our scraper is actively fetching pages for this series. Check back in a few minutes!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 max-h-[650px] overflow-y-auto pr-1">
              {chapters.map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/read/${chapter.id}`}
                  className="group flex items-center justify-between rounded-xl border border-neutral-800/80 bg-[#12141c] p-3.5 transition hover:border-purple-500/40 hover:bg-purple-950/15"
                >
                  <span className="truncate text-xs font-medium text-neutral-200 group-hover:text-purple-300 transition">
                    {formatChapterTitle(chapter)}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-purple-400 opacity-80 group-hover:opacity-100 transition">
                    Read →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </main>
  );
}
