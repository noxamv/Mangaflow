'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';
import ShareBar from '../../../components/ShareBar';

interface Chapter {
  id: string;
  chapter_number: number;
  title: string | null;
  pages?: string[] | null;
  created_at?: string;
}

interface Series {
  id: string;
  title: string;
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  slug: string;
  cover_image_url?: string;
  cover_url?: string;
  synopsis?: string;
  status?: string;
  author?: string;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const rawSlug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeNum, setResumeNum] = useState<number | null>(null);

  useEffect(() => {
    async function fetchSeriesData() {
      if (!rawSlug) return;
      setLoading(true);

      try {
        const decoded = decodeURIComponent(rawSlug).trim();
        const { data: seriesData } = await supabase
          .from('series')
          .select('*')
          .or(`slug.eq."${decoded}",id.eq."${decoded}"`)
          .maybeSingle();

        if (!seriesData) {
          setLoading(false);
          return;
        }

        setSeries(seriesData);

        // 1. Local reading history for instant resume
        try {
          const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
          if (local[seriesData.id]) {
            setResumeId(local[seriesData.id].chapterId);
            setResumeNum(local[seriesData.id].chapterNumber);
          }
        } catch {}

        // 2. User Follow/Bookmark State
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { data: followRecord } = await supabase
            .from('user_follows')
            .select('id')
            .eq('user_id', userData.user.id)
            .eq('series_id', seriesData.id)
            .maybeSingle();

          if (followRecord) setIsFollowing(true);

          const { data: cloudHistory } = await supabase
            .from('reading_history')
            .select('chapter_id, chapter_number')
            .eq('user_id', userData.user.id)
            .eq('series_id', seriesData.id)
            .maybeSingle();

          if (cloudHistory) {
            setResumeId(cloudHistory.chapter_id);
            setResumeNum(cloudHistory.chapter_number);
          }
        }

        // 3. Fetch Chapters
        const { data: chapterData } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, pages')
          .eq('series_id', seriesData.id)
          .order('chapter_number', { ascending: false });

        if (chapterData) {
          setChapters(chapterData);
        }
      } catch (err) {
        console.error('Series fetch error:', err);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080b] flex items-center justify-center text-xs text-neutral-500">
        Loading series...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-white space-y-3">
        <h1 className="text-xl font-bold">Series Not Found</h1>
        <Link href="/" className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold">
          Return Home
        </Link>
      </div>
    );
  }

  const primaryTitle = series.english_title || series.title;
  const playableChapters = chapters.filter((c) => Array.isArray(c.pages) && (c.pages?.length ?? 0) > 0);
  const firstChapter = playableChapters[playableChapters.length - 1] || chapters[chapters.length - 1];
  const latestChapter = playableChapters[0] || chapters[0];

  let synList: string[] = [];
  if (Array.isArray(series.synonyms)) {
    synList = series.synonyms;
  } else if (typeof series.synonyms === 'string') {
    try {
      synList = JSON.parse(series.synonyms);
    } catch {
      synList = [series.synonyms];
    }
  }

  const rawCover = series.cover_image_url || series.cover_url || '';

  return (
    <div className="min-h-screen bg-[#07080b] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Banner Poster Card */}
        <div className="relative overflow-hidden rounded-3xl border border-neutral-800/80 bg-[#10121a] p-6 shadow-2xl">
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <div className="mx-auto aspect-[3/4.2] w-48 shrink-0 overflow-hidden rounded-2xl bg-neutral-900 border border-white/10 shadow-xl">
              <img
                src={rawCover}
                alt={primaryTitle}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (rawCover && !target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(rawCover)}`;
                  }
                }}
              />
            </div>

            <div className="flex flex-1 flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-400 border border-indigo-500/30">
                    {series.status || 'Ongoing'}
                  </span>
                  <span className="rounded-lg bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-neutral-300 border border-white/10">
                    {chapters.length} Chapters Indexed
                  </span>
                </div>

                <h1 className="mt-3 text-2xl font-black text-white sm:text-3xl tracking-tight">
                  {primaryTitle}
                </h1>

                {/* Alternative Titles */}
                <div className="mt-2 space-y-1 text-xs text-neutral-400">
                  {series.title !== primaryTitle && (
                    <p>
                      <span className="text-neutral-500 font-semibold">Original:</span> {series.title}
                    </p>
                  )}
                  {series.native_title && (
                    <p>
                      <span className="text-neutral-500 font-semibold">Native:</span> {series.native_title}
                    </p>
                  )}
                  {synList.length > 0 && (
                    <p className="line-clamp-2">
                      <span className="text-neutral-500 font-semibold">Also Known As:</span>{' '}
                      {synList.slice(0, 4).join(', ')}
                    </p>
                  )}
                </div>

                <p className="mt-4 text-xs text-neutral-300 sm:text-sm line-clamp-4 leading-relaxed">
                  {series.synopsis || 'Read online for free in high definition on MangaFlow.'}
                </p>
              </div>

              {/* Action Buttons: Read & Follow */}
              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-neutral-800">
                {resumeId ? (
                  <Link
                    href={`/read/${resumeId}`}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black shadow-lg transition"
                  >
                    ▶ Continue Reading (Ch. {resumeNum})
                  </Link>
                ) : firstChapter ? (
                  <Link
                    href={`/read/${firstChapter.id}`}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-black shadow-lg transition"
                  >
                    Start Reading (Ch. {firstChapter.chapter_number})
                  </Link>
                ) : null}

                {latestChapter && (!resumeId || latestChapter.id !== resumeId) && (
                  <Link
                    href={`/read/${latestChapter.id}`}
                    className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold text-neutral-200 transition"
                  >
                    Latest (Ch. {latestChapter.chapter_number})
                  </Link>
                )}

                {/* Follow Button */}
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    isFollowing
                      ? 'border border-neutral-700 bg-neutral-800 text-emerald-400 hover:bg-neutral-700'
                      : 'border border-indigo-500/40 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                  }`}
                >
                  <span>{isFollowing ? '✓' : '+'}</span>
                  <span>{isFollowing ? 'Following' : 'Follow Series'}</span>
                </button>

                <ShareBar />
              </div>
            </div>
          </div>
        </div>

        {/* Chapters Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-base font-black text-white sm:text-lg">Chapters List</h2>
            <span className="text-xs text-neutral-500">{chapters.length} Total</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[600px] overflow-y-auto">
            {chapters.map((ch) => {
              const hasPages = Array.isArray(ch.pages) && (ch.pages?.length ?? 0) > 0;
              return (
                <Link
                  key={ch.id}
                  href={`/read/${ch.id}`}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition ${
                    resumeId === ch.id
                      ? 'border-emerald-500/50 bg-emerald-950/20'
                      : hasPages
                      ? 'border-neutral-800/80 bg-[#10121a] hover:border-indigo-500/40'
                      : 'border-neutral-800/40 bg-[#0d0e14] opacity-60'
                  }`}
                >
                  <span className="truncate text-xs font-semibold text-neutral-200">
                    Chapter {ch.chapter_number} {ch.title ? `- ${ch.title}` : ''}
                  </span>
                  <span
                    className={`text-xs font-bold shrink-0 ml-2 ${
                      hasPages ? 'text-indigo-400' : 'text-neutral-500 text-[11px]'
                    }`}
                  >
                    {hasPages ? 'Read →' : 'Syncing...'}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
