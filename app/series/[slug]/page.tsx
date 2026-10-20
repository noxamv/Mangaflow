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
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  slug: string;
  cover_url?: string;
  cover_image_url?: string;
  synopsis?: string;
  status?: string;
  author?: string;
}

interface SavedProgress {
  chapterId: string;
  chapterNumber: number;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const rawSlug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [resumeProgress, setResumeProgress] = useState<SavedProgress | null>(null);

  useEffect(() => {
    async function fetchSeriesData() {
      if (!rawSlug) return;
      setLoading(true);

      try {
        const decodedSlug = decodeURIComponent(rawSlug).trim();
        const isUUID =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedSlug);

        let query = supabase.from('series').select('*');
        if (isUUID) {
          query = query.or(`slug.eq."${decodedSlug}",id.eq."${decodedSlug}"`);
        } else {
          query = query.eq('slug', decodedSlug);
        }

        const { data: seriesData, error: seriesError } = await query.maybeSingle();

        if (seriesError || !seriesData) {
          setLoading(false);
          return;
        }

        setSeries(seriesData);

        // Check local progress for guest resume
        try {
          const localHistory = JSON.parse(
            localStorage.getItem('mangaflow_reading_history') || '{}'
          );
          if (localHistory[seriesData.id]) {
            setResumeProgress({
              chapterId: localHistory[seriesData.id].chapterId,
              chapterNumber: localHistory[seriesData.id].chapterNumber,
            });
          }
        } catch {}

        // Fetch User Bookmark & Cloud Resume State
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const [followRes, historyRes] = await Promise.all([
            supabase
              .from('user_follows')
              .select('id')
              .eq('user_id', userData.user.id)
              .eq('series_id', seriesData.id)
              .maybeSingle(),
            supabase
              .from('reading_history')
              .select('chapter_id, chapter_number')
              .eq('user_id', userData.user.id)
              .eq('series_id', seriesData.id)
              .maybeSingle(),
          ]);

          if (followRes.data) setIsFollowing(true);
          if (historyRes.data) {
            setResumeProgress({
              chapterId: historyRes.data.chapter_id,
              chapterNumber: historyRes.data.chapter_number,
            });
          }
        }

        // Fetch Valid Populated Chapters
        const { data: chapterData } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, pages, created_at')
          .eq('series_id', seriesData.id)
          .order('chapter_number', { ascending: false });

        if (chapterData) {
          const valid = chapterData.filter((c) => Array.isArray(c.pages) && c.pages.length > 0);
          setChapters(valid);
        }
      } catch (err) {
        console.error('Error fetching series details:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSeriesData();
  }, [rawSlug]);

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
    return series?.cover_image_url || series?.cover_url || FALLBACK_COVER;
  };

  const formatChapterTitle = (ch: Chapter) => {
    const num = ch.chapter_number;
    if (!ch.title || ch.title.trim() === '' || ch.title.toLowerCase().includes('null')) {
      return num === 0 ? 'Prologue' : `Chapter ${num}`;
    }
    return `Chapter ${num} - ${ch.title}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07080b] text-xs text-neutral-500">
        Loading series details...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#07080b] px-4 text-center text-white space-y-3">
        <h1 className="text-2xl font-black">Series Not Found</h1>
        <p className="text-xs text-neutral-400">This title might still be indexing.</p>
        <Link
          href="/"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-500"
        >
          Return Home
        </Link>
      </div>
    );
  }

  const primaryTitle = series.english_title || series.title;
  const firstChapter = chapters[chapters.length - 1];
  const latestChapter = chapters[0];

  return (
    <main className="min-h-screen bg-[#07080b] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Banner Poster Header */}
        <div className="relative overflow-hidden rounded-3xl border border-neutral-800/80 bg-[#10121a] p-6 shadow-2xl sm:p-8">
          <div
            className="absolute inset-0 scale-125 bg-cover bg-center opacity-15 blur-3xl filter"
            style={{ backgroundImage: `url(${getCoverUrl()})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10121a] via-[#10121a]/80 to-transparent" />

          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            {/* Poster Card */}
            <div className="mx-auto aspect-[3/4.2] w-48 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl md:mx-0 md:w-56">
              <img
                src={getCoverUrl()}
                alt={primaryTitle}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  const raw = series.cover_image_url || series.cover_url;
                  if (raw && !target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(raw)}`;
                  } else {
                    target.src = FALLBACK_COVER;
                  }
                }}
              />
            </div>

            {/* Info Container */}
            <div className="flex flex-1 flex-col justify-between space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-400 border border-indigo-500/30">
                    {series.status || 'Ongoing'}
                  </span>
                  <span className="rounded-lg bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-300 border border-white/10">
                    {chapters.length} Chapters Available
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl lg:text-4xl tracking-tight">
                  {primaryTitle}
                </h1>

                {series.english_title && series.english_title !== series.title && (
                  <p className="mt-1 text-xs text-neutral-400 font-medium">
                    Native / Romaji: {series.title}
                  </p>
                )}

                <div className="mt-3 text-xs text-neutral-400">
                  Author:{' '}
                  <span className="font-semibold text-neutral-200">
                    {series.author && series.author.toLowerCase() !== 'unknown'
                      ? series.author
                      : 'Official Scan'}
                  </span>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-neutral-300 sm:text-sm line-clamp-4">
                  {series.synopsis || 'Read online for free on MangaFlow.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-4 pt-4 border-t border-neutral-800/80">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Smart Resume Button */}
                  {resumeProgress ? (
                    <Link
                      href={`/read/${resumeProgress.chapterId}`}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-lg transition hover:bg-emerald-500"
                    >
                      ▶ Continue Reading (Ch. {resumeProgress.chapterNumber})
                    </Link>
                  ) : firstChapter ? (
                    <Link
                      href={`/read/${firstChapter.id}`}
                      className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white shadow-lg transition hover:bg-indigo-500"
                    >
                      Start Reading (Ch. {firstChapter.chapter_number})
                    </Link>
                  ) : null}

                  {latestChapter && (!resumeProgress || latestChapter.id !== resumeProgress.chapterId) && (
                    <Link
                      href={`/read/${latestChapter.id}`}
                      className="rounded-xl border border-neutral-700 bg-neutral-800/90 px-4 py-2.5 text-xs font-bold text-neutral-200 transition hover:bg-neutral-700"
                    >
                      Latest (Ch. {latestChapter.chapter_number})
                    </Link>
                  )}

                  <button
                    onClick={handleFollowToggle}
                    className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                      isFollowing
                        ? 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        : 'border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                    }`}
                  >
                    {isFollowing ? '✓ Bookmarked' : '+ Bookmark'}
                  </button>
                </div>

                <ShareBar />
              </div>
            </div>
          </div>
        </div>

        {/* Chapters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-lg font-black text-white sm:text-xl">Chapters List</h2>
            <span className="text-xs text-neutral-400">{chapters.length} Total</span>
          </div>

          {chapters.length === 0 ? (
            <div className="rounded-2xl border border-neutral-800/80 bg-[#10121a] p-12 text-center space-y-2">
              <p className="text-sm font-bold text-neutral-300">Syncing chapter panels...</p>
              <p className="text-xs text-neutral-500">
                Our automated engine is caching panels for this series. Check back shortly!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 max-h-[650px] overflow-y-auto pr-1">
              {chapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/read/${ch.id}`}
                  className={`group flex items-center justify-between rounded-xl border p-3.5 transition ${
                    resumeProgress?.chapterId === ch.id
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-neutral-800/80 bg-[#10121a] hover:border-indigo-500/40 hover:bg-indigo-950/20'
                  }`}
                >
                  <span className="truncate text-xs font-semibold text-neutral-200 group-hover:text-indigo-300 transition">
                    {formatChapterTitle(ch)}
                  </span>
                  <span className="shrink-0 text-[11px] font-black text-indigo-400 transition">
                    {resumeProgress?.chapterId === ch.id ? 'Resume →' : 'Read →'}
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
