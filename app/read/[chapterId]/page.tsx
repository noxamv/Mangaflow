// app/read/[chapterId]/page.tsx
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Broken / Missing Images');
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const lastScrollY = useRef(0);
  const touchStartX = useRef<number | null>(null);

  // Restore saved reader preferences from localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('mangaflow_reader_mode') as 'webtoon' | 'paged';
      const savedDir = localStorage.getItem('mangaflow_reader_dir') as 'rtl' | 'ltr';
      const savedFit = localStorage.getItem('mangaflow_reader_fit') as 'width' | 'height';
      if (savedMode) setReadingMode(savedMode);
      if (savedDir) setReadingDirection(savedDir);
      if (savedFit) setPageFit(savedFit);
    } catch {}
  }, []);

  // Header Auto-Hide on Scroll (Webtoon Mode)
  useEffect(() => {
    if (readingMode !== 'webtoon') {
      setHeaderVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 150) {
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

  // Load Chapter Data
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

        if (data.series) {
          setSeries(data.series);
          const localSavedMode = localStorage.getItem('mangaflow_reader_mode');
          if (!localSavedMode) {
            setReadingMode(data.series.reading_mode === 'webtoon' ? 'webtoon' : 'paged');
          }
        }

        if (data.allChapters) setAllChapters(data.allChapters);
        setPrevChapter(data.prevChapter);
        setNextChapter(data.nextChapter);

        // Record Reading History
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

  const resolveImageUrl = useCallback(
    (page: string): string => {
      if (!page) return '';
      let fullUrl = page;

      if (!page.startsWith('http://') && !page.startsWith('https://')) {
        if (chapter?.base_url) {
          const cleanBase = chapter.base_url.replace(/\/+$/, '');
          const cleanPage = page.replace(/^\/+/, '');
          fullUrl = `${cleanBase}/${cleanPage}`;
        } else {
          fullUrl = page.startsWith('/') ? page : `/${page}`;
        }
      }

      if (
        fullUrl.includes('readdetectiveconan.com') ||
        fullUrl.includes('mangapill.com') ||
        fullUrl.includes('mpcdn.top') ||
        fullUrl.includes('hivetoons.org') ||
        fullUrl.includes('asuracomic.net')
      ) {
        return `/api/proxy-image?url=${encodeURIComponent(fullUrl)}`;
      }

      return fullUrl;
    },
    [chapter?.base_url]
  );

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

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (readingMode === 'paged') {
          readingDirection === 'rtl' ? handlePrevPage() : handleNextPage();
        } else if (nextChapter) {
          router.push(`/read/${nextChapter.id}`);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (readingMode === 'paged') {
          readingDirection === 'rtl' ? handleNextPage() : handlePrevPage();
        } else if (prevChapter) {
          router.push(`/read/${prevChapter.id}`);
        }
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readingMode, readingDirection, handleNextPage, handlePrevPage, nextChapter, prevChapter, router]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleReportSubmit = async () => {
    if (!chapterId) return;
    setReportStatus('sending');
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId, reason: reportReason }),
      });
      setReportStatus('sent');
      setTimeout(() => {
        setReportOpen(false);
        setReportStatus('idle');
      }, 2000);
    } catch {
      setReportStatus('idle');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!chapter || !chapter.pages?.length) {
    return (
      <div className="min-h-screen bg-[#07070a] flex flex-col items-center justify-center p-4 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Chapter Sync In Progress</h1>
        <p className="text-xs text-neutral-400 mb-6">This chapter is currently resolving across mirrors.</p>
        {series?.slug && (
          <Link href={`/series/${series.slug}`} className="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white">
            Return to Series
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07070a] text-neutral-100 flex flex-col select-none relative">
      {/* Top Floating Bar */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 bg-[#0c0d14]/95 backdrop-blur-md border-b border-neutral-800/80 px-3 sm:px-6 py-2.5 transition-transform duration-300 flex items-center justify-between ${
          headerVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={series ? `/series/${series.slug}` : '/'}
            className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-white truncate max-w-[160px] sm:max-w-xs">{series?.title}</h2>
            <p className="text-[10px] text-neutral-400 truncate">
              {chapter.title || `Chapter ${chapter.chapter_number}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* In-Reader Report Button */}
          <button
            onClick={() => setReportOpen(true)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-neutral-400 hover:text-red-400 transition"
            title="Report broken images"
            aria-label="Report Chapter"
          >
            🚩
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition hidden sm:inline-flex"
            title="Toggle Fullscreen"
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? '⤦' : '⛶'}
          </button>

          {/* Chapter Selector Drawer */}
          <button
            onClick={() => {
              setChapterListOpen(!chapterListOpen);
              setSettingsOpen(false);
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition"
            aria-label="Chapter List"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>

          {/* Settings */}
          <button
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setChapterListOpen(false);
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed top-14 right-4 z-50 w-72 bg-[#13151f] border border-neutral-800 rounded-2xl p-4 shadow-2xl space-y-4 text-xs">
          <div>
            <label className="text-neutral-400 font-bold block mb-1.5">Reading Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setReadingMode('webtoon');
                  localStorage.setItem('mangaflow_reader_mode', 'webtoon');
                }}
                className={`py-1.5 rounded-xl font-bold transition ${
                  readingMode === 'webtoon' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Webtoon
              </button>
              <button
                onClick={() => {
                  setReadingMode('paged');
                  localStorage.setItem('mangaflow_reader_mode', 'paged');
                }}
                className={`py-1.5 rounded-xl font-bold transition ${
                  readingMode === 'paged' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Paged
              </button>
            </div>
          </div>

          {readingMode === 'paged' && (
            <div>
              <label className="text-neutral-400 font-bold block mb-1.5">Reading Direction</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setReadingDirection('ltr');
                    localStorage.setItem('mangaflow_reader_dir', 'ltr');
                  }}
                  className={`py-1.5 rounded-xl font-bold transition ${
                    readingDirection === 'ltr' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  Left to Right
                </button>
                <button
                  onClick={() => {
                    setReadingDirection('rtl');
                    localStorage.setItem('mangaflow_reader_dir', 'rtl');
                  }}
                  className={`py-1.5 rounded-xl font-bold transition ${
                    readingDirection === 'rtl' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  Right to Left
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-neutral-400 font-bold block mb-1.5">Page Fit</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setPageFit('width');
                  localStorage.setItem('mangaflow_reader_fit', 'width');
                }}
                className={`py-1.5 rounded-xl font-bold transition ${
                  pageFit === 'width' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Fit Width
              </button>
              <button
                onClick={() => {
                  setPageFit('height');
                  localStorage.setItem('mangaflow_reader_fit', 'height');
                }}
                className={`py-1.5 rounded-xl font-bold transition ${
                  pageFit === 'height' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Fit Height
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chapter List Dropdown */}
      {chapterListOpen && (
        <div className="fixed top-14 right-4 z-50 w-72 max-h-96 bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-xs">
          <div className="p-3 border-b border-neutral-800 font-bold text-white flex justify-between">
            <span>All Chapters</span>
            <span className="text-neutral-400">{allChapters.length}</span>
          </div>
          <div className="overflow-y-auto divide-y divide-neutral-800/60 p-1">
            {allChapters.map((c) => (
              <Link
                key={c.id}
                href={`/read/${c.id}`}
                onClick={() => setChapterListOpen(false)}
                className={`block px-3 py-2 rounded-xl transition ${
                  c.id === chapter.id
                    ? 'bg-indigo-600 text-white font-bold'
                    : 'text-neutral-300 hover:bg-neutral-800/60'
                }`}
              >
                Chapter {c.chapter_number}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#13151f] border border-neutral-800 rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-bold text-white">Report Chapter Issue</h3>
            <p className="text-xs text-neutral-400">
              Reporting: Chapter {chapter.chapter_number}
            </p>
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            >
              <option value="Broken / Missing Images">Broken / Missing Images</option>
              <option value="Wrong Chapter Order">Wrong Chapter Order</option>
              <option value="Scrambled Pages">Scrambled Pages</option>
              <option value="Duplicate Chapter">Duplicate Chapter</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReportOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-neutral-800 text-neutral-300 text-xs hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={handleReportSubmit}
                disabled={reportStatus !== 'idle'}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-50"
              >
                {reportStatus === 'sending' ? 'Sending...' : reportStatus === 'sent' ? 'Sent!' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reader Body Content */}
      <main className="flex-1 flex flex-col items-center justify-center pt-14 pb-20 w-full">
        {readingMode === 'webtoon' ? (
          <div className={`w-full flex flex-col items-center ${pageFit === 'height' ? 'max-w-2xl' : 'max-w-4xl'}`}>
            {chapter.pages.map((page, idx) => (
              <img
                key={idx}
                src={resolveImageUrl(page)}
                alt={`Page ${idx + 1}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-auto block select-none"
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-3xl flex flex-col items-center px-4">
            <div className="relative w-full flex items-center justify-center min-h-[70vh]">
              <img
                src={resolveImageUrl(chapter.pages[currentPage])}
                alt={`Page ${currentPage + 1}`}
                className="max-h-[85vh] w-auto object-contain select-none shadow-2xl rounded-lg"
              />
            </div>
            <div className="flex items-center justify-between w-full mt-4 text-xs font-bold text-neutral-400">
              <button onClick={handlePrevPage} className="px-3 py-1.5 bg-neutral-800 rounded-xl hover:text-white">
                ← Prev
              </button>
              <span>
                {currentPage + 1} / {totalPages}
              </span>
              <button onClick={handleNextPage} className="px-3 py-1.5 bg-neutral-800 rounded-xl hover:text-white">
                Next →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Navigation Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0c0d14]/90 backdrop-blur-md border-t border-neutral-800/80 px-4 py-3 flex items-center justify-between text-xs font-bold">
        {prevChapter ? (
          <Link
            href={`/read/${prevChapter.id}`}
            className="px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition"
          >
            ← Ch. {prevChapter.chapter_number}
          </Link>
        ) : (
          <span className="opacity-0 px-3.5 py-1.5">←</span>
        )}

        <span className="text-neutral-500 text-[11px]">
          Ch. {chapter.chapter_number}
        </span>

        {nextChapter ? (
          <Link
            href={`/read/${nextChapter.id}`}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition"
          >
            Ch. {nextChapter.chapter_number} →
          </Link>
        ) : (
          <Link
            href={series ? `/series/${series.slug}` : '/'}
            className="px-3.5 py-1.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            Completed
          </Link>
        )}
      </footer>
    </div>
  );
}
