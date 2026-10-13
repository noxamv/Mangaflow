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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reader Customization States
  const [mode, setMode] = useState<'webtoon' | 'single' | 'double'>('webtoon');
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

  // Keyboard navigation for paged manga
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'webtoon' || !chapter) return;
      const pagesCount = chapter.pages?.length || 0;

      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        setCurrentPageIndex((prev) => Math.min(pagesCount - 1, prev + (mode === 'double' ? 2 : 1)));
      } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        setCurrentPageIndex((prev) => Math.max(0, prev - (mode === 'double' ? 2 : 1)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, chapter]);

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

  const pages = Array.isArray(chapter.pages) ? chapter.pages : [];

  const handleRetryPage = (index: number) => {
    setFailedPages((prev) => ({ ...prev, [index]: false }));
  };

  return (
    <div className="min-h-screen bg-[#07080a] text-neutral-200 flex flex-col items-center select-none">
      {/* Top Floating Control Bar */}
      <nav className="sticky top-0 z-40 w-full bg-[#0b0c10]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between max-w-4xl">
        <Link
          href={`/series/${seriesSlug}`}
          className="text-xs font-semibold text-neutral-400 hover:text-white transition flex items-center gap-1.5"
        >
          ← Series
        </Link>

        {/* Layout Mode Selector */}
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

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs font-semibold hover:bg-neutral-800 transition"
        >
          Ch. {chapter.chapter_number} ▼
        </button>
      </nav>

      {/* Reader Canvas */}
      <main className="w-full flex-1 flex flex-col items-center py-2">
        {pages.length === 0 ? (
          <div className="py-24 text-xs text-neutral-500">
            No image pages found for this chapter.
          </div>
        ) : mode === 'webtoon' ? (
          /* Vertical Long Strip Mode */
          <div className="w-full max-w-2xl flex flex-col items-center">
            {pages.map((url, i) => (
              <div key={i} className="w-full relative bg-neutral-950 flex justify-center min-h-[300px]">
                {failedPages[i] ? (
                  <div className="w-full h-64 flex flex-col items-center justify-center gap-2 border border-neutral-800 bg-neutral-900/60">
                    <p className="text-xs text-neutral-400">Page {i + 1} failed to load.</p>
                    <button
                      type="button"
                      onClick={() => handleRetryPage(i)}
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
                    className="w-full h-auto block select-none"
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Horizontal Single / Double Page Flip Mode */
          <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center p-2">
            <div className="flex items-center justify-center gap-2 max-h-[82vh] overflow-hidden">
              <div className="relative max-h-[80vh] flex items-center justify-center">
                <img
                  src={pages[currentPageIndex]}
                  alt={`Page ${currentPageIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className="max-h-[80vh] w-auto object-contain rounded shadow-2xl"
                />
              </div>
              {mode === 'double' && currentPageIndex + 1 < pages.length && (
                <div className="relative max-h-[80vh] flex items-center justify-center">
                  <img
                    src={pages[currentPageIndex + 1]}
                    alt={`Page ${currentPageIndex + 2}`}
                    referrerPolicy="no-referrer"
                    className="max-h-[80vh] w-auto object-contain rounded shadow-2xl"
                  />
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 flex items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - (mode === 'double' ? 2 : 1)))}
                disabled={currentPageIndex === 0}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 disabled:opacity-30 rounded-lg"
              >
                ← Prev Page
              </button>
              <span className="text-neutral-400 text-xs">
                {currentPageIndex + 1} {mode === 'double' && currentPageIndex + 1 < pages.length ? `- ${currentPageIndex + 2}` : ''} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + (mode === 'double' ? 2 : 1)))}
                disabled={currentPageIndex >= pages.length - 1}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 disabled:opacity-30 rounded-lg"
              >
                Next Page →
              </button>
            </div>
          </div>
        )}

        {/* Bottom Navigation End Bar */}
        <div className="w-full max-w-md px-4 py-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3 w-full">
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
        </div>
      </main>

      {/* Chapter Selection Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm max-h-[75vh] bg-[#12141c] border border-neutral-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white">Select Chapter</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
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
                    setDrawerOpen(false);
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
