'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  pages: string[] | null;
  series?: {
    id: string;
    title: string;
    english_title?: string | null;
    slug: string;
    cover_image_url?: string | null;
  };
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<{ id: string; chapter_number: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<'webtoon' | 'single'>('webtoon');
  const [pageIdx, setPageIdx] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Report Modal States
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Broken / Missing Images');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem('mangaflow_reader_mode') as 'webtoon' | 'single';
    if (savedMode) setMode(savedMode);
  }, []);

  const changeMode = (newMode: 'webtoon' | 'single') => {
    setMode(newMode);
    localStorage.setItem('mangaflow_reader_mode', newMode);
  };

  useEffect(() => {
    async function load() {
      if (!chapterId) return;
      setLoading(true);

      try {
        // Try on-demand endpoint first for instant self-healing
        let chData: any = null;
        try {
          const res = await fetch(`/api/chapter/${chapterId}`);
          if (res.ok) chData = await res.json();
        } catch {}

        if (!chData || !chData.pages || chData.pages.length === 0) {
          const { data } = await supabase
            .from('chapters')
            .select(`id, series_id, chapter_number, title, pages, series (id, title, english_title, slug, cover_image_url)`)
            .eq('id', chapterId)
            .maybeSingle();
          chData = data;
        }

        if (!chData) {
          setLoading(false);
          return;
        }

        const sObj = Array.isArray(chData.series) ? chData.series[0] : chData.series;
        const cur: Chapter = { ...chData, series: sObj };
        setChapter(cur);
        setPageIdx(0);

        const { data: sibs } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', cur.series_id)
          .order('chapter_number', { ascending: true });

        if (sibs) setAllChapters(sibs);

        // Save progress to localStorage
        const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
        local[cur.series_id] = {
          seriesId: cur.series_id,
          seriesTitle: sObj?.english_title || sObj?.title || '',
          seriesSlug: sObj?.slug || cur.series_id,
          coverUrl: sObj?.cover_image_url || '',
          chapterId: cur.id,
          chapterNumber: cur.chapter_number,
        };
        localStorage.setItem('mangaflow_reading_history', JSON.stringify(local));

        // Sync with user account if logged in
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          await supabase.from('reading_history').upsert({
            user_id: auth.user.id,
            series_id: cur.series_id,
            chapter_id: cur.id,
            chapter_number: cur.chapter_number,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,series_id' });
        }
      } catch (err) {
        console.error('Reader error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [chapterId]);

  const currentIndex = allChapters.findIndex((c) => c.id === chapter?.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  // Single-page keyboard navigation
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (mode !== 'single' || !chapter?.pages) return;
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (pageIdx < chapter.pages.length - 1) setPageIdx((p) => p + 1);
        else if (nextChapter) router.push(`/read/${nextChapter.id}`);
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (pageIdx > 0) setPageIdx((p) => p - 1);
        else if (prevChapter) router.push(`/read/${prevChapter.id}`);
      }
    },
    [mode, chapter, pageIdx, nextChapter, prevChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Submit Chapter Report
  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapter) return;
    setReportSubmitting(true);

    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: chapter.id,
          reason: reportReason,
        }),
      });
      setReportSent(true);
    } catch {
      setReportSent(true);
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-xs text-neutral-400 space-y-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="font-semibold tracking-wider uppercase">Loading panels...</p>
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-white space-y-4 px-4 text-center">
        <p className="text-sm font-semibold">This chapter is currently synchronizing.</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-500 transition"
          >
            Retry Now
          </button>
          <Link href="/" className="px-4 py-2 bg-neutral-800 rounded-lg text-xs font-bold">
            Home
          </Link>
        </div>
      </div>
    );
  }

  const primaryTitle = chapter.series?.english_title || chapter.series?.title;

  return (
    <div ref={readerContainerRef} className="min-h-screen bg-[#07080b] text-white flex flex-col select-none">
      {/* Sticky Top Reader Controls */}
      <header
        className={`sticky top-0 z-50 bg-[#0e1017]/95 backdrop-blur border-b border-neutral-800/80 px-3 py-2.5 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 truncate min-w-0">
            <Link
              href={`/series/${chapter.series?.slug || chapter.series_id}`}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold text-neutral-300 transition shrink-0"
            >
              ← Back
            </Link>
            <div className="truncate text-xs">
              <span className="font-bold text-white truncate">{primaryTitle}</span>
              <span className="text-neutral-500 ml-1.5 shrink-0">/ Ch. {chapter.chapter_number}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mode Switcher */}
            <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
              <button
                onClick={() => changeMode('webtoon')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  mode === 'webtoon' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Webtoon
              </button>
              <button
                onClick={() => changeMode('single')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  mode === 'single' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Single
              </button>
            </div>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs text-neutral-300 transition hidden sm:block"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? 'Exit Full' : 'Full'}
            </button>

            {/* Report Button */}
            <button
              onClick={() => {
                setReportSent(false);
                setShowReportModal(true);
              }}
              className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-semibold transition"
              title="Report broken panels"
            >
              Report
            </button>

            {/* Quick Chapter Selector */}
            <select
              value={chapter.id}
              onChange={(e) => router.push(`/read/${e.target.value}`)}
              className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              {allChapters.map((c) => (
                <option key={c.id} value={c.id}>
                  Ch. {c.chapter_number}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Reader Panel Canvas */}
      <main
        onClick={() => setShowControls((prev) => !prev)}
        className="flex-1 flex flex-col items-center w-full py-2 cursor-pointer"
      >
        {mode === 'webtoon' ? (
          <div className="w-full max-w-3xl flex flex-col items-center mx-auto pointer-events-auto">
            {chapter.pages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                referrerPolicy="no-referrer"
                loading={i < 4 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-auto block select-none bg-neutral-950"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(url)}`;
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center flex-1 px-2 pointer-events-auto">
            <div className="relative group w-full flex items-center justify-center">
              <img
                src={chapter.pages[pageIdx]}
                alt=""
                referrerPolicy="no-referrer"
                className="max-h-[86vh] w-auto object-contain rounded shadow-2xl"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(chapter.pages![pageIdx])}`;
                  }
                }}
              />

              {/* Tap Left / Right page turner */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (pageIdx > 0) setPageIdx((p) => p - 1);
                }}
                className="absolute left-0 top-0 w-1/3 h-full cursor-w-resize"
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (pageIdx < chapter.pages!.length - 1) setPageIdx((p) => p + 1);
                }}
                className="absolute right-0 top-0 w-1/3 h-full cursor-e-resize"
              />
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-neutral-400">
              <button
                disabled={pageIdx === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setPageIdx((p) => p - 1);
                }}
                className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-lg disabled:opacity-30 hover:bg-neutral-800"
              >
                ← Prev Page
              </button>
              <span>
                Page {pageIdx + 1} / {chapter.pages.length}
              </span>
              <button
                disabled={pageIdx === chapter.pages.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setPageIdx((p) => p + 1);
                }}
                className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded-lg disabled:opacity-30 hover:bg-neutral-800"
              >
                Next Page →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Reader Bottom Navigation Bar */}
      <footer className="bg-[#0e1017] border-t border-neutral-800/80 p-4 flex items-center justify-center gap-4">
        {prevChapter ? (
          <Link
            href={`/read/${prevChapter.id}`}
            className="px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded-xl transition"
          >
            ← Previous Chapter ({prevChapter.chapter_number})
          </Link>
        ) : (
          <span className="px-5 py-2.5 bg-neutral-900/50 text-neutral-600 text-xs font-bold rounded-xl cursor-not-allowed">
            First Chapter
          </span>
        )}

        {nextChapter ? (
          <Link
            href={`/read/${nextChapter.id}`}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-black rounded-xl shadow-lg transition"
          >
            Next Chapter ({nextChapter.chapter_number}) →
          </Link>
        ) : (
          <span className="px-5 py-2.5 bg-neutral-900/50 text-neutral-600 text-xs font-bold rounded-xl cursor-not-allowed">
            Latest Chapter
          </span>
        )}
      </footer>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative w-full max-w-sm bg-[#141722] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <h3 className="text-sm font-bold text-white">Report Broken Chapter</h3>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-neutral-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {reportSent ? (
              <div className="text-center py-4 space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  ✓
                </div>
                <p className="text-xs font-semibold text-white">Report Logged!</p>
                <p className="text-[11px] text-neutral-400">
                  Our bot will re-scrape and rebuild this chapter within minutes.
                </p>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="mt-3 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <p className="text-xs text-neutral-400">
                  Reporting Chapter {chapter.chapter_number} of {primaryTitle}. Select the issue:
                </p>

                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 text-xs text-white rounded-lg px-3 py-2 outline-none"
                >
                  <option value="Broken / Missing Images">Broken / Missing Images</option>
                  <option value="Images out of order">Images out of order</option>
                  <option value="Wrong series or chapter">Wrong series or chapter</option>
                  <option value="Duplicate pages">Duplicate pages</option>
                </select>

                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 font-bold text-xs text-white rounded-xl transition"
                >
                  {reportSubmitting ? 'Reporting...' : 'Submit Report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
