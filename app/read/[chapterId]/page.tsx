'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  base_url: string | null;
  pages: string[];
}

interface SiblingChapter {
  id: string;
  chapter_number: number;
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [seriesTitle, setSeriesTitle] = useState<string>('');
  const [seriesSlug, setSeriesSlug] = useState<string>('');
  const [allChapters, setAllChapters] = useState<SiblingChapter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // UI Overlays & Controls
  const [showControls, setShowControls] = useState<boolean>(true);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Reader Settings (Persisted in localStorage)
  const [readingMode, setReadingMode] = useState<'vertical' | 'single'>('vertical');
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [pageFit, setPageFit] = useState<'width' | 'height' | 'original'>('width');
  const [currentPage, setCurrentPage] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load preferences from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('mangaflow_reading_mode') as 'vertical' | 'single' | null;
      if (savedMode) setReadingMode(savedMode);

      const savedDir = localStorage.getItem('mangaflow_reading_dir') as 'ltr' | 'rtl' | null;
      if (savedDir) setReadingDirection(savedDir);

      const savedFit = localStorage.getItem('mangaflow_page_fit') as 'width' | 'height' | 'original' | null;
      if (savedFit) setPageFit(savedFit);
    }
  }, []);

  const updateReadingMode = (mode: 'vertical' | 'single') => {
    setReadingMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('mangaflow_reading_mode', mode);
  };

  const updateReadingDir = (dir: 'ltr' | 'rtl') => {
    setReadingDirection(dir);
    if (typeof window !== 'undefined') localStorage.setItem('mangaflow_reading_dir', dir);
  };

  const updatePageFit = (fit: 'width' | 'height' | 'original') => {
    setPageFit(fit);
    if (typeof window !== 'undefined') localStorage.setItem('mangaflow_page_fit', fit);
  };

  useEffect(() => {
    async function loadReaderData() {
      if (!chapterId) return;
      setLoading(true);

      const { data: cData, error: cErr } = await supabase
        .from('chapters')
        .select('id, series_id, chapter_number, title, base_url, pages')
        .eq('id', chapterId)
        .single();

      if (cErr || !cData) {
        setLoading(false);
        return;
      }

      setChapter(cData);
      setCurrentPage(0);

      const [{ data: sData }, { data: siblings }] = await Promise.all([
        supabase
          .from('series')
          .select('title, english_title, slug')
          .eq('id', cData.series_id)
          .single(),
        supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', cData.series_id)
          .order('chapter_number', { ascending: false }),
      ]);

      if (sData) {
        setSeriesTitle(sData.english_title || sData.title);
        setSeriesSlug(sData.slug);
      }

      if (siblings) {
        const seen = new Set<number>();
        const deduped: SiblingChapter[] = [];
        for (const item of siblings) {
          if (!seen.has(item.chapter_number)) {
            seen.add(item.chapter_number);
            deduped.push(item);
          }
        }
        setAllChapters(deduped);
      }

      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    loadReaderData();
  }, [chapterId]);

  const { prevChapter, nextChapter } = useMemo(() => {
    if (!chapter || allChapters.length === 0) {
      return { prevChapter: null, nextChapter: null };
    }
    const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
    if (currentIndex === -1) {
      return { prevChapter: null, nextChapter: null };
    }

    const next = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
    const prev = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

    return { prevChapter: prev, nextChapter: next };
  }, [chapter, allChapters]);

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

      if (fullUrl.includes('readdetectiveconan.com') || fullUrl.includes('mangapill.com')) {
        return `/api/proxy-image?url=${encodeURIComponent(fullUrl)}`;
      }

      return fullUrl;
    },
    [chapter?.base_url]
  );

  const totalPages = chapter?.pages?.length || 0;

  // Single page step handlers
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

  // Global hotkeys
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' || e.key === 'f') {
        setShowControls((prev) => !prev);
      }

      if (readingMode === 'single') {
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          readingDirection === 'ltr' ? handleNextPage() : handlePrevPage();
        } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          readingDirection === 'ltr' ? handlePrevPage() : handleNextPage();
        }
      } else {
        if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && prevChapter) {
          router.push(`/read/${prevChapter.id}`);
        } else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && nextChapter) {
          router.push(`/read/${nextChapter.id}`);
        }
      }
    },
    [readingMode, readingDirection, handleNextPage, handlePrevPage, prevChapter, nextChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1015] flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-indigo-500 rounded-full animate-spin" />
        <span className="text-xs text-neutral-400 font-medium">Loading chapter panels...</span>
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#0e1015] flex flex-col items-center justify-center text-neutral-400 space-y-4 px-4 text-center">
        <p className="text-sm font-medium">Chapter panels are currently being re-indexed.</p>
        {seriesSlug ? (
          <Link
            href={`/series/${seriesSlug}`}
            className="text-xs text-indigo-400 hover:text-indigo-300 border border-neutral-800 bg-[#13151f] px-4 py-2 rounded-xl transition"
          >
            ← Return to Series Details
          </Link>
        ) : (
          <Link href="/" className="text-xs text-indigo-400 hover:text-indigo-300 transition">
            ← Return to Home
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-neutral-200 flex flex-col select-none relative overflow-x-hidden">
      {/* FLOATING TOP HEADER (TOGGLEABLE) */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#0e1015]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between transition-transform duration-300 ${
          showControls ? 'translate-y-0' : '-translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0 pointer-events-auto">
          <Link
            href={seriesSlug ? `/series/${seriesSlug}` : '/'}
            className="text-xs text-neutral-400 hover:text-white transition flex items-center gap-1 shrink-0"
          >
            ← <span className="hidden sm:inline">Overview</span>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
              {seriesTitle || 'MangaFlow'}
            </h1>
            <p className="text-[11px] text-indigo-400 font-medium truncate">
              Chapter {chapter.chapter_number}
              {chapter.title && chapter.title !== `Chapter ${chapter.chapter_number}`
                ? ` - ${chapter.title}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Settings Trigger */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 sm:px-3 sm:py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-300 rounded-xl transition flex items-center gap-1.5"
            title="Reader Settings"
          >
            <span>⚙️</span>
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Chapter Drawer Trigger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-md"
          >
            <span>📑</span>
            <span className="hidden sm:inline">Chapters</span>
          </button>
        </div>
      </header>

      {/* READING VIEWPORT CONTAINER */}
      <main
        ref={containerRef}
        onClick={(e) => {
          // If clicked on buttons or links, don't toggle
          if ((e.target as HTMLElement).closest('button, a, input, select')) return;
          setShowControls((prev) => !prev);
        }}
        className="flex-1 flex flex-col items-center justify-center w-full min-h-screen py-2 cursor-pointer"
      >
        {readingMode === 'vertical' ? (
          /* LONG STRIP / VERTICAL MODE (MANHWA/WEBTOON) */
          <div
            className={`flex flex-col items-center w-full transition-all duration-200 ${
              pageFit === 'width' ? 'max-w-3xl' : pageFit === 'height' ? 'max-w-xl' : 'max-w-full'
            }`}
          >
            {chapter.pages.map((page, idx) => {
              const resolvedSrc = resolveImageUrl(page);

              return (
                <div
                  key={idx}
                  className="w-full flex justify-center bg-[#090a0f] min-h-[300px] border-b border-neutral-900/30 relative"
                >
                  <img
                    src={resolvedSrc}
                    alt={`Page ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-full h-auto object-contain block max-w-full"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (!target.src.includes('/api/proxy-image')) {
                        target.src = `/api/proxy-image?url=${encodeURIComponent(resolvedSrc)}`;
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* SINGLE PAGE MODE (PAGED MANGA) */
          <div className="relative w-full flex-1 flex flex-col items-center justify-center p-2">
            <div className="relative max-h-[92vh] max-w-full flex items-center justify-center">
              <img
                src={resolveImageUrl(chapter.pages[currentPage])}
                alt={`Page ${currentPage + 1}`}
                decoding="async"
                referrerPolicy="no-referrer"
                className={`object-contain transition-all ${
                  pageFit === 'height' ? 'max-h-[88vh] w-auto' : 'max-w-3xl w-full h-auto'
                }`}
                onError={(e) => {
                  const target = e.currentTarget;
                  const original = resolveImageUrl(chapter.pages[currentPage]);
                  if (!target.src.includes('/api/proxy-image')) {
                    target.src = `/api/proxy-image?url=${encodeURIComponent(original)}`;
                  }
                }}
              />

              {/* Invisible Click Zones for Next / Prev */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'ltr' ? handlePrevPage() : handleNextPage();
                }}
                className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
                title="Previous Page"
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'ltr' ? handleNextPage() : handlePrevPage();
                }}
                className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize"
                title="Next Page"
              />
            </div>

            {/* Page Count Overlay */}
            <div className="mt-2 bg-[#13151f]/80 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-800 text-[11px] font-semibold text-neutral-400">
              Page {currentPage + 1} / {totalPages}
            </div>
          </div>
        )}
      </main>

      {/* FLOATING BOTTOM FOOTER BAR (TOGGLEABLE) */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#0e1015]/95 backdrop-blur-md border-t border-neutral-800/80 px-4 py-2.5 flex items-center justify-between max-w-2xl mx-auto rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          showControls ? 'translate-y-0' : 'translate-y-full pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 pointer-events-auto w-full justify-between">
          {prevChapter ? (
            <Link
              href={`/read/${prevChapter.id}`}
              className="px-3 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-semibold text-neutral-300 transition"
            >
              ← Prev Ch.
            </Link>
          ) : (
            <span className="px-3 py-1.5 bg-neutral-900 border border-neutral-800/60 text-neutral-600 rounded-xl text-xs cursor-not-allowed">
              Start
            </span>
          )}

          {readingMode === 'single' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                className="px-2 py-1 bg-[#13151f] border border-neutral-800 rounded-lg text-xs text-neutral-300"
              >
                ‹
              </button>
              <span className="text-xs font-bold text-indigo-400">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                className="px-2 py-1 bg-[#13151f] border border-neutral-800 rounded-lg text-xs text-neutral-300"
              >
                ›
              </button>
            </div>
          ) : (
            <span className="text-[11px] font-semibold text-neutral-500">
              Ch. {chapter.chapter_number} ({totalPages} panels)
            </span>
          )}

          {nextChapter ? (
            <Link
              href={`/read/${nextChapter.id}`}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition shadow-md"
            >
              Next Ch. →
            </Link>
          ) : (
            <span className="px-3 py-1.5 bg-neutral-900 border border-neutral-800/60 text-neutral-600 rounded-xl text-xs cursor-not-allowed">
              Latest
            </span>
          )}
        </div>
      </footer>

      {/* READING SETTINGS POPUP MODAL */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-[#13151f] border border-neutral-800 rounded-2xl p-5 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>⚙️</span> Reading Settings
              </h2>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-neutral-400 hover:text-white text-xs px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Reading Mode Toggle */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                Reading Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateReadingMode('vertical')}
                  className={`py-2 rounded-xl text-xs font-bold transition border ${
                    readingMode === 'vertical'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  Long Strip (Webtoon)
                </button>
                <button
                  type="button"
                  onClick={() => updateReadingMode('single')}
                  className={`py-2 rounded-xl text-xs font-bold transition border ${
                    readingMode === 'single'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  Single Page (Paged)
                </button>
              </div>
            </div>

            {/* Page Fit Setting */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                Page Fitting
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['width', 'height', 'original'] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => updatePageFit(fit)}
                    className={`py-1.5 rounded-xl text-xs font-semibold capitalize transition border ${
                      pageFit === fit
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                    }`}
                  >
                    {fit}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction Setting (Only relevant in single page mode) */}
            {readingMode === 'single' && (
              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1.5">
                  Reading Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateReadingDir('ltr')}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition border ${
                      readingDirection === 'ltr'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                    }`}
                  >
                    Left to Right (LTR)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateReadingDir('rtl')}
                    className={`py-1.5 rounded-xl text-xs font-semibold transition border ${
                      readingDirection === 'rtl'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                    }`}
                  >
                    Right to Left (RTL)
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setSettingsOpen(false)}
              className="w-full py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-white text-xs font-bold rounded-xl transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* CHAPTER DRAWER MODAL */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative ml-auto w-80 max-w-[85vw] bg-[#0e1015] border-l border-neutral-800 h-full p-4 flex flex-col z-10 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h2 className="text-sm font-bold text-white">Select Chapter</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded-md bg-neutral-900 transition"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 space-y-1.5 no-scrollbar">
              {allChapters.map((c) => {
                const isCurrent = c.id === chapter.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setDrawerOpen(false);
                      router.push(`/read/${c.id}`);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-between ${
                      isCurrent
                        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold'
                        : 'bg-[#13151f] hover:bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    <span>Chapter {c.chapter_number}</span>
                    {isCurrent && <span className="text-[10px] text-indigo-400 font-semibold">Reading</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
