'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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

  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [seriesSlug, setSeriesSlug] = useState<string>('');
  const [allChapters, setAllChapters] = useState<SiblingChapter[]>([]);
  const [prevChapter, setPrevChapter] = useState<SiblingChapter | null>(null);
  const [nextChapter, setNextChapter] = useState<SiblingChapter | null>(null);
  const [loading, setLoading] = useState(true);

  // Drawers
  const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Reader Settings State
  const [mode, setMode] = useState<'webtoon' | 'single' | 'double'>('webtoon');
  const [direction, setDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [fitMode, setFitMode] = useState<'width' | 'height' | 'contain'>('width');
  const [bgColor, setBgColor] = useState<'black' | 'dark'>('black');
  const [useProxy, setUseProxy] = useState(true);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [failedPages, setFailedPages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function fetchChapter() {
      if (!chapterId) return;
      setLoading(true);

      const { data: chData } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();

      if (chData) {
        setChapter(chData);

        const { data: seriesData } = await supabase
          .from('series')
          .select('slug, reading_mode')
          .eq('id', chData.series_id)
          .single();

        if (seriesData) {
          setSeriesSlug(seriesData.slug);
          if (seriesData.reading_mode === 'manga') {
            setMode('single');
            setDirection('rtl');
          } else {
            setMode('webtoon');
            setDirection('ltr');
          }
        }

        const { data: siblings } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', chData.series_id)
          .order('chapter_number', { ascending: true });

        if (siblings) {
          setAllChapters(siblings);
          const currentIndex = siblings.findIndex((s) => s.id === chData.id);
          setPrevChapter(currentIndex > 0 ? siblings[currentIndex - 1] : null);
          setNextChapter(
            currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null
          );
        }

        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          await supabase.from('reading_history').upsert(
            {
              user_id: authData.user.id,
              series_id: chData.series_id,
              chapter_id: chData.id,
              chapter_number: chData.chapter_number,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,series_id' }
          );
        }
      }
      setLoading(false);
    }

    fetchChapter();
  }, [chapterId]);

  // Keyboard controls accounting for RTL vs LTR
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'webtoon' || !chapter) return;
      const pagesCount = chapter.pages?.length || 0;
      const step = mode === 'double' ? 2 : 1;

      const goForward = () => setCurrentPageIndex((prev) => Math.min(pagesCount - 1, prev + step));
      const goBackward = () => setCurrentPageIndex((prev) => Math.max(0, prev - step));

      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        direction === 'rtl' ? goBackward() : goForward();
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        direction === 'rtl' ? goForward() : goBackward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, direction, chapter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center text-xs text-neutral-400">
        Loading chapter panels...
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="min-h-screen bg-[#07080a] flex flex-col items-center justify-center gap-3">
        <h2 className="text-base font-bold text-white">Chapter not found</h2>
        <Link href="/" className="text-xs text-indigo-400 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  const rawPages = Array.isArray(chapter.pages) ? chapter.pages : [];
  const pages = rawPages.map((url) =>
    useProxy ? `/api/proxy?url=${encodeURIComponent(url)}` : url
  );

  const getPageStyle = () => {
    if (fitMode === 'width') return 'w-full h-auto block';
    if (fitMode === 'height') return 'h-[85vh] w-auto object-contain';
    return 'max-w-full max-h-[85vh] object-contain';
  };

  return (
    <div
      className={`min-h-screen ${
        bgColor === 'black' ? 'bg-[#000000]' : 'bg-[#0b0c10]'
      } text-neutral-200 flex flex-col items-center select-none`}
    >
      {/* Top Floating Control Bar */}
      <nav className="sticky top-0 z-40 w-full bg-[#0b0c10]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between max-w-5xl">
        <Link
          href={`/series/${seriesSlug}`}
          className="text-xs font-semibold text-neutral-400 hover:text-white transition flex items-center gap-1.5"
        >
          ← Series
        </Link>

        {/* Quick Mode Toggles */}
        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-0.5 rounded-lg text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setMode('webtoon')}
            className={`px-2 py-1 rounded transition ${
              mode === 'webtoon' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Webtoon
          </button>
          <button
            type="button"
            onClick={() => setMode('single')}
            className={`px-2 py-1 rounded transition ${
              mode === 'single' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => setMode('double')}
            className={`px-2 py-1 rounded transition ${
              mode === 'double' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Double
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-700/80 text-neutral-300 hover:text-white transition text-xs"
            title="Reader Settings"
          >
            ⚙
          </button>

          <button
            type="button"
            onClick={() => setChapterDrawerOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs font-semibold hover:bg-neutral-800 transition"
          >
            Ch. {chapter.chapter_number} ▼
          </button>
        </div>
      </nav>

      {/* Reader Canvas */}
      <main className="w-full flex-1 flex flex-col items-center py-2">
        {pages.length === 0 ? (
          <div className="py-24 text-xs text-neutral-500">
            No image pages found for this chapter.
          </div>
        ) : mode === 'webtoon' ? (
          /* Vertical Webtoon Strip */
          <div
            className={`flex flex-col items-center ${
              fitMode === 'width' ? 'w-full max-w-2xl' : 'w-full max-w-4xl'
            }`}
          >
            {pages.map((url, i) => (
              <div key={i} className="w-full relative flex justify-center min-h-[300px]">
                {failedPages[i] ? (
                  <div className="w-full h-64 flex flex-col items-center justify-center gap-2 border border-neutral-800 bg-neutral-900/60">
                    <p className="text-xs text-neutral-400">Page {i + 1} failed to load.</p>
                    <button
                      type="button"
                      onClick={() => setFailedPages((prev) => ({ ...prev, [i]: false }))}
                      className="px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-lg"
                    >
                      Tap to reload
                    </button>
                  </div>
                ) : (
                  <img
                    src={url}
                    alt={`Page ${i + 1}`}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => setFailedPages((prev) => ({ ...prev, [i]: true }))}
                    className={getPageStyle()}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Horizontal Manga Flip Mode */
          <div className="w-full max-w-5xl flex-1 flex flex-col items-center justify-center p-2">
            <div
              className={`flex items-center justify-center gap-2 overflow-hidden ${
                direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className="relative flex items-center justify-center">
                <img
                  src={pages[currentPageIndex]}
                  alt={`Page ${currentPageIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className={getPageStyle()}
                />
              </div>

              {mode === 'double' && currentPageIndex + 1 < pages.length && (
                <div className="relative flex items-center justify-center">
                  <img
                    src={pages[currentPageIndex + 1]}
                    alt={`Page ${currentPageIndex + 2}`}
                    referrerPolicy="no-referrer"
                    className={getPageStyle()}
                  />
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  const step = mode === 'double' ? 2 : 1;
                  direction === 'rtl'
                    ? setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + step))
                    : setCurrentPageIndex((prev) => Math.max(0, prev - step));
                }}
                disabled={
                  direction === 'rtl'
                    ? currentPageIndex >= pages.length - 1
                    : currentPageIndex === 0
                }
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 disabled:opacity-30 rounded-lg hover:border-neutral-700 transition"
              >
                ← Prev
              </button>

              <span className="text-neutral-400 text-xs">
                {currentPageIndex + 1}{' '}
                {mode === 'double' && currentPageIndex + 1 < pages.length
                  ? `- ${currentPageIndex + 2}`
                  : ''}{' '}
                / {pages.length}
              </span>

              <button
                type="button"
                onClick={() => {
                  const step = mode === 'double' ? 2 : 1;
                  direction === 'rtl'
                    ? setCurrentPageIndex((prev) => Math.max(0, prev - step))
                    : setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + step));
                }}
                disabled={
                  direction === 'rtl'
                    ? currentPageIndex === 0
                    : currentPageIndex >= pages.length - 1
                }
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 disabled:opacity-30 rounded-lg hover:border-neutral-700 transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Bottom Chapter Switcher */}
        <div className="w-full max-w-md px-4 py-8 flex items-center gap-3">
          {prevChapter ? (
            <button
              type="button"
              onClick={() => router.push(`/read/${prevChapter.id}`)}
              className="flex-1 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs font-bold text-neutral-200 transition"
            >
              ← Prev Ch. {prevChapter.chapter_number}
            </button>
          ) : (
            <div className="flex-1 py-2.5 text-center text-xs text-neutral-600">First Chapter</div>
          )}

          {nextChapter ? (
            <button
              type="button"
              onClick={() => router.push(`/read/${nextChapter.id}`)}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition shadow-md shadow-indigo-600/20"
            >
              Next Ch. {nextChapter.chapter_number} →
            </button>
          ) : (
            <div className="flex-1 py-2.5 text-center text-xs text-neutral-600">Latest Chapter</div>
          )}
        </div>
      </main>

      {/* Settings Drawer */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#12141c] border border-neutral-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Reader Settings
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            {/* Reading Direction */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">
                Reading Direction
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('rtl')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    direction === 'rtl'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  Right-to-Left (Manga)
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('ltr')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    direction === 'ltr'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  Left-to-Right
                </button>
              </div>
            </div>

            {/* Canvas Scaling */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">
                Canvas Scaling
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'width', label: 'Fit Width' },
                  { id: 'height', label: 'Fit Height' },
                  { id: 'contain', label: 'Contain' },
                ].map((fit) => (
                  <button
                    key={fit.id}
                    type="button"
                    onClick={() => setFitMode(fit.id as any)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                      fitMode === fit.id
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {fit.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Tone */}
            <div>
              <label className="text-[11px] font-bold text-neutral-400 block mb-1.5">
                Canvas Background
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBgColor('black')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    bgColor === 'black'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  Pure Black (#000)
                </button>
                <button
                  type="button"
                  onClick={() => setBgColor('dark')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    bgColor === 'dark'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  }`}
                >
                  Dark Slate (#0b0c10)
                </button>
              </div>
            </div>

            {/* Proxy Caching */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-neutral-300 font-semibold">
                Use Edge Image Proxy & Cache
              </span>
              <input
                type="checkbox"
                checked={useProxy}
                onChange={(e) => setUseProxy(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-900 border-neutral-700 text-indigo-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* Chapter Selection Drawer */}
      {chapterDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm max-h-[75vh] bg-[#12141c] border border-neutral-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white">Select Chapter</h3>
              <button
                type="button"
                onClick={() => setChapterDrawerOpen(false)}
                className="text-neutral-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/60 p-2">
              {allChapters.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setChapterDrawerOpen(false);
                    router.push(`/read/${ch.id}`);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-lg transition flex items-center justify-between ${
                    ch.id === chapter.id
                      ? 'bg-indigo-600/20 text-indigo-300 font-bold'
                      : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  <span>Chapter {ch.chapter_number}</span>
                  {ch.id === chapter.id && (
                    <span className="text-[10px] text-indigo-400">Reading</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
