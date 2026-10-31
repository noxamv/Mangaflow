// app/read/[chapterId]/page.tsx
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { saveLocalProgress } from '../../../lib/useReadingHistory';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface ChapterData {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  base_url: string | null;
  pages: string[];
}

interface SeriesData {
  id: string;
  slug: string;
  title: string;
  reading_mode: string | null;
}

interface AdjacentChapter {
  id: string;
  chapter_number: number;
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [series, setSeries] = useState<SeriesData | null>(null);
  const [prevChapter, setPrevChapter] = useState<AdjacentChapter | null>(null);
  const [nextChapter, setNextChapter] = useState<AdjacentChapter | null>(null);
  const [allChapters, setAllChapters] = useState<AdjacentChapter[]>([]);

  const [loading, setLoading] = useState(true);
  const [readingMode, setReadingMode] = useState<'webtoon' | 'paged'>('webtoon');
  const [readingDirection, setReadingDirection] = useState<'rtl' | 'ltr'>('ltr');
  const [pageFit, setPageFit] = useState<'width' | 'height'>('width');
  const [currentPage, setCurrentPage] = useState(0);

  const [headerVisible, setHeaderVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const lastScrollY = useRef(0);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('mangaflow_reader_mode') as 'webtoon' | 'paged';
      const savedDir = localStorage.getItem('mangaflow_reader_dir') as 'rtl' | 'ltr';
      const savedFit = localStorage.getItem('mangaflow_reader_fit') as 'width' | 'height';
      if (savedMode) setReadingMode(savedMode);
      if (savedDir) setReadingDirection(savedDir);
      if (savedFit) setPageFit(savedFit);
    }
  }, []);

  // Scroll visibility for headers in webtoon mode
  useEffect(() => {
    if (readingMode !== 'webtoon') return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 120) {
        setHeaderVisible(false);
        setSettingsOpen(false);
        setChapterListOpen(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readingMode]);

  // Load Chapter Data & Update Local Storage History
  useEffect(() => {
    async function loadReader() {
      if (!chapterId) return;
      setLoading(true);

      try {
        const res = await fetch(`/api/chapter/${chapterId}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = await res.json();
        setChapter(data);

        const seriesObj = Array.isArray(data.series) ? data.series[0] : data.series;
        if (seriesObj) {
          setSeries(seriesObj);
          const localSavedMode = localStorage.getItem('mangaflow_reader_mode');
          if (!localSavedMode) {
            setReadingMode(seriesObj.reading_mode === 'manga' ? 'paged' : 'webtoon');
          }
        }

        if (data.allChapters) setAllChapters(data.allChapters);
        setPrevChapter(data.prevChapter);
        setNextChapter(data.nextChapter);

        // 1. Instant Client-Side Local Storage Save (Always works, even for guests)
        if (data.series_id) {
          saveLocalProgress({
            seriesId: data.series_id,
            seriesSlug: seriesObj?.slug || '',
            seriesTitle: seriesObj?.title || 'Current Series',
            chapterId: data.id,
            chapterNumber: data.chapter_number,
            pageIndex: 0,
            progressPercent: 100,
            updatedAt: Date.now(),
          });
        }

        // 2. Sync to Supabase if authenticated
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session?.user?.id && data.series_id) {
          await supabase.from('reading_history').upsert(
            {
              user_id: authData.session.user.id,
              series_id: data.series_id,
              chapter_id: data.id,
              chapter_number: data.chapter_number,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,series_id' }
          );
        }
      } catch (err) {
        console.error('Reader load error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadReader();
    setCurrentPage(0);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [chapterId]);

  const totalPages = chapter?.pages?.length || 0;

  const handleNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (nextChapter) {
      router.push(`/read/${nextChapter.id}`);
    }
  }, [currentPage, totalPages, nextChapter, router]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else if (prevChapter) {
      router.push(`/read/${prevChapter.id}`);
    }
  }, [currentPage, prevChapter, router]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        readingDirection === 'rtl' ? handlePrevPage() : handleNextPage();
      } else if (e.key === 'ArrowLeft') {
        readingDirection === 'rtl' ? handleNextPage() : handlePrevPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage, readingDirection]);

  const handleReportBroken = async (reason: string) => {
    if (!chapter) return;
    setReportSubmitting(true);
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: chapter.id,
          seriesId: chapter.series_id,
          seriesTitle: series?.title,
          chapterNumber: chapter.chapter_number,
          reason,
        }),
      });
      setReportSuccess(true);
      setTimeout(() => {
        setReportSuccess(false);
        setReportModalOpen(false);
      }, 2000);
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b0e] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!chapter || !chapter.pages?.length) {
    return (
      <div className="min-h-screen bg-[#0a0b0e] flex flex-col items-center justify-center text-center p-6 text-white space-y-4">
        <h1 className="text-xl font-bold">Chapter Content Unavailable</h1>
        <p className="text-neutral-400 text-sm max-w-md">
          This chapter is currently being fetched or re-indexed from upstream mirrors.
        </p>
        <div className="flex gap-3">
          {series && (
            <Link
              href={`/series/${series.slug}`}
              className="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold"
            >
              Back to Series
            </Link>
          )}
          <button
            onClick={() => handleReportBroken('Empty or Broken Chapter')}
            className="px-4 py-2 bg-neutral-800 rounded-xl text-xs font-semibold text-neutral-300"
          >
            Report Chapter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0b0e] text-white flex flex-col relative select-none">
      {/* Top Header */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#0d0e15]/95 backdrop-blur-md border-b border-neutral-800 transition-transform duration-300 ${
          headerVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 truncate">
            {series && (
              <Link
                href={`/series/${series.slug}`}
                className="text-neutral-400 hover:text-white text-sm font-semibold shrink-0"
              >
                ← {series.title}
              </Link>
            )}
            <span className="text-xs text-neutral-500 font-mono">/</span>
            <span className="text-xs font-bold text-indigo-400 shrink-0">
              Ch. {chapter.chapter_number}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setChapterListOpen(!chapterListOpen)}
              className="px-2.5 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-medium text-neutral-300"
            >
              Chapters ▾
            </button>
            <button
              onClick={() => setReportModalOpen(true)}
              className="p-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs text-red-400"
              title="Report broken images"
            >
              🚩
            </button>
          </div>
        </div>
      </header>

      {/* Chapter Dropdown Drawer */}
      {chapterListOpen && (
        <div className="fixed top-14 inset-x-0 z-40 bg-[#0d0e15]/98 border-b border-neutral-800 p-4 max-h-72 overflow-y-auto">
          <div className="max-w-4xl mx-auto grid grid-cols-3 sm:grid-cols-6 gap-2">
            {allChapters.map((c) => (
              <Link
                key={c.id}
                href={`/read/${c.id}`}
                onClick={() => setChapterListOpen(false)}
                className={`p-2 rounded-lg text-center text-xs font-medium transition ${
                  c.id === chapter.id
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'bg-[#13151f] text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                Ch. {c.chapter_number}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Reading Canvas (Tap toggles header visibility) */}
      <main
        className="flex-1 pt-14 pb-16 flex flex-col items-center justify-center cursor-pointer"
        onClick={() => setHeaderVisible((prev) => !prev)}
      >
        {readingMode === 'webtoon' ? (
          <div className="w-full max-w-3xl flex flex-col items-center">
            {chapter.pages.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Page ${idx + 1}`}
                loading={idx < 3 ? 'eager' : 'lazy'}
                className="w-full h-auto block select-none pointer-events-none"
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-4xl flex items-center justify-center min-h-[80vh]">
            <img
              src={chapter.pages[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-h-[85vh] w-auto object-contain select-none shadow-2xl"
            />
          </div>
        )}
      </main>

      {/* Bottom Floating Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#0d0e15]/95 backdrop-blur-md border-t border-neutral-800 transition-transform duration-300 ${
          headerVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between text-xs">
          <button
            onClick={handlePrevPage}
            disabled={!prevChapter && currentPage === 0}
            className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-lg"
          >
            ← Previous
          </button>

          <span className="text-neutral-400 font-mono">
            {readingMode === 'paged'
              ? `${currentPage + 1} / ${totalPages}`
              : `${totalPages} Pages`}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!nextChapter && currentPage >= totalPages - 1}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-lg font-bold"
          >
            Next →
          </button>
        </div>
      </footer>

      {/* Report Broken Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-white font-bold text-sm">Report Broken Chapter</h3>
            {reportSuccess ? (
              <p className="text-emerald-400 text-xs py-4 text-center">
                Report submitted! Our scrapers will re-sync this chapter.
              </p>
            ) : (
              <div className="space-y-2">
                <button
                  disabled={reportSubmitting}
                  onClick={() => handleReportBroken('Missing images / broken links')}
                  className="w-full text-left p-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-neutral-200"
                >
                  Images not loading / Broken
                </button>
                <button
                  disabled={reportSubmitting}
                  onClick={() => handleReportBroken('Wrong chapter or out of order')}
                  className="w-full text-left p-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs text-neutral-200"
                >
                  Wrong chapter content
                </button>
                <button
                  onClick={() => setReportModalOpen(false)}
                  className="w-full p-2 text-center text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
