'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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

  // Reader Customization States
  const [readerMode, setReaderMode] = useState<'webtoon' | 'single'>('webtoon');
  const [singlePageIndex, setSinglePageIndex] = useState(0);
  const [maxWidth, setMaxWidth] = useState<'narrow' | 'medium' | 'full'>('medium');
  const [showControls, setShowControls] = useState(true);

  // Load Preferences from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('mangaflow_reader_mode') as 'webtoon' | 'single';
    const savedWidth = localStorage.getItem('mangaflow_reader_width') as 'narrow' | 'medium' | 'full';
    if (savedMode) setReaderMode(savedMode);
    if (savedWidth) setMaxWidth(savedWidth);
  }, []);

  const changeReaderMode = (mode: 'webtoon' | 'single') => {
    setReaderMode(mode);
    localStorage.setItem('mangaflow_reader_mode', mode);
  };

  const changeMaxWidth = (width: 'narrow' | 'medium' | 'full') => {
    setMaxWidth(width);
    localStorage.setItem('mangaflow_reader_width', width);
  };

  // Chapter Ingestion & Progress Recording
  useEffect(() => {
    async function loadChapter() {
      if (!chapterId) return;
      setLoading(true);

      try {
        const { data: chData, error: chErr } = await supabase
          .from('chapters')
          .select(`
            id,
            series_id,
            chapter_number,
            title,
            pages,
            series (id, title, english_title, slug, cover_image_url)
          `)
          .eq('id', chapterId)
          .maybeSingle();

        if (chErr || !chData) {
          setLoading(false);
          return;
        }

        const seriesObj = Array.isArray(chData.series) ? chData.series[0] : chData.series;
        const currentChapter: Chapter = {
          ...chData,
          series: seriesObj,
        };

        setChapter(currentChapter);
        setSinglePageIndex(0);

        // Fetch sibling chapters for navigation
        const { data: siblings } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', currentChapter.series_id)
          .not('pages', 'is', null)
          .order('chapter_number', { ascending: true });

        if (siblings) setAllChapters(siblings);

        // 1. LocalStorage Progress (Works offline and for non-logged-in users)
        const localHistory = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
        localHistory[currentChapter.series_id] = {
          seriesId: currentChapter.series_id,
          seriesTitle: seriesObj?.english_title || seriesObj?.title || '',
          seriesSlug: seriesObj?.slug || currentChapter.series_id,
          coverUrl: seriesObj?.cover_image_url || '',
          chapterId: currentChapter.id,
          chapterNumber: currentChapter.chapter_number,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('mangaflow_reading_history', JSON.stringify(localHistory));

        // 2. Cloud DB Sync for logged-in accounts
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user) {
          await supabase.from('reading_history').upsert(
            {
              user_id: authData.user.id,
              series_id: currentChapter.series_id,
              chapter_id: currentChapter.id,
              chapter_number: currentChapter.chapter_number,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,series_id' }
          );
        }
      } catch (err) {
        console.error('Error loading chapter:', err);
      } finally {
        setLoading(false);
      }
    }

    loadChapter();
  }, [chapterId]);

  const currentIndex = allChapters.findIndex((c) => c.id === chapter?.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  // Single Page Keyboard Navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readerMode !== 'single' || !chapter?.pages) return;
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (singlePageIndex < chapter.pages.length - 1) {
          setSinglePageIndex((prev) => prev + 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (nextChapter) {
          router.push(`/read/${nextChapter.id}`);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (singlePageIndex > 0) {
          setSinglePageIndex((prev) => prev - 1);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (prevChapter) {
          router.push(`/read/${prevChapter.id}`);
        }
      }
    },
    [readerMode, chapter, singlePageIndex, nextChapter, prevChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080b] text-neutral-400 flex flex-col items-center justify-center space-y-3">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs tracking-wider uppercase font-semibold">Opening Reader...</p>
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#07080b] text-white flex flex-col items-center justify-center px-4 space-y-4">
        <p className="text-sm font-semibold">No images found for this chapter.</p>
        <Link
          href="/"
          className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-500 transition"
        >
          Return Home
        </Link>
      </div>
    );
  }

  const widthClasses = {
    narrow: 'max-w-2xl',
    medium: 'max-w-4xl',
    full: 'max-w-full',
  }[maxWidth];

  return (
    <div className="min-h-screen bg-[#07080b] text-white flex flex-col select-none">
      {/* Sticky Reader Bar */}
      <header
        className={`sticky top-0 z-50 bg-[#0e1017]/95 backdrop-blur border-b border-neutral-800/80 px-3 py-2.5 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              href={`/series/${chapter.series?.slug || chapter.series_id}`}
              className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-semibold text-neutral-300 transition shrink-0"
            >
              ← Back
            </Link>
            <div className="truncate text-xs">
              <span className="font-bold text-white">
                {chapter.series?.english_title || chapter.series?.title}
              </span>
              <span className="text-neutral-500 ml-1.5">/ Ch. {chapter.chapter_number}</span>
            </div>
          </div>

          {/* Reader Preferences Bar */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Reading Mode Switcher */}
            <div className="hidden sm:flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
              <button
                onClick={() => changeReaderMode('webtoon')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  readerMode === 'webtoon' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Webtoon
              </button>
              <button
                onClick={() => changeReaderMode('single')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  readerMode === 'single' ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Single Page
              </button>
            </div>

            {/* Width Presets */}
            {readerMode === 'webtoon' && (
              <div className="hidden md:flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
                <button
                  onClick={() => changeMaxWidth('narrow')}
                  className={`px-2 py-1 rounded font-semibold ${
                    maxWidth === 'narrow' ? 'bg-neutral-700 text-white' : 'text-neutral-400'
                  }`}
                >
                  Narrow
                </button>
                <button
                  onClick={() => changeMaxWidth('medium')}
                  className={`px-2 py-1 rounded font-semibold ${
                    maxWidth === 'medium' ? 'bg-neutral-700 text-white' : 'text-neutral-400'
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => changeMaxWidth('full')}
                  className={`px-2 py-1 rounded font-semibold ${
                    maxWidth === 'full' ? 'bg-neutral-700 text-white' : 'text-neutral-400'
                  }`}
                >
                  Full
                </button>
              </div>
            )}

            {/* Chapter Dropdown */}
            <select
              value={chapter.id}
              onChange={(e) => router.push(`/read/${e.target.value}`)}
              className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-2.5 py-1 outline-none cursor-pointer"
            >
              {allChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Ch. {ch.chapter_number}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Reader Body */}
      <main
        onClick={() => setShowControls((prev) => !prev)}
        className="flex-1 flex flex-col items-center w-full min-h-screen py-2 cursor-pointer"
      >
        {readerMode === 'webtoon' ? (
          /* Webtoon Vertical Strip */
          <div className={`w-full ${widthClasses} flex flex-col items-center mx-auto transition-all`}>
            {chapter.pages.map((imgUrl, idx) => (
              <img
                key={idx}
                src={imgUrl}
                alt={`Panel ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading={idx < 4 ? 'eager' : 'lazy'}
                decoding="async"
                className="w-full h-auto block select-none bg-neutral-950 pointer-events-auto"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(imgUrl)}`;
                  }
                }}
              />
            ))}
          </div>
        ) : (
          /* Single Page Flip Mode */
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center flex-1 px-2 pointer-events-auto">
            <div className="relative group w-full flex items-center justify-center">
              <img
                src={chapter.pages[singlePageIndex]}
                alt={`Page ${singlePageIndex + 1}`}
                referrerPolicy="no-referrer"
                className="max-h-[88vh] w-auto object-contain rounded-lg shadow-2xl"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(chapter.pages![singlePageIndex])}`;
                  }
                }}
              />

              {/* Page Tap Areas */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (singlePageIndex > 0) setSinglePageIndex((prev) => prev - 1);
                }}
                className="absolute left-0 top-0 w-1/3 h-full cursor-w-resize"
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (singlePageIndex < chapter.pages!.length - 1) {
                    setSinglePageIndex((prev) => prev + 1);
                  }
                }}
                className="absolute right-0 top-0 w-1/3 h-full cursor-e-resize"
              />
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-neutral-400">
              <button
                disabled={singlePageIndex === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setSinglePageIndex((prev) => prev - 1);
                }}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg disabled:opacity-30 hover:bg-neutral-800"
              >
                ← Prev Page
              </button>
              <span>
                Page {singlePageIndex + 1} / {chapter.pages.length}
              </span>
              <button
                disabled={singlePageIndex === chapter.pages.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setSinglePageIndex((prev) => prev + 1);
                }}
                className="px-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg disabled:opacity-30 hover:bg-neutral-800"
              >
                Next Page →
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Reader Footer Navigation */}
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
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-xs font-black tracking-wide rounded-xl shadow-lg transition"
          >
            Next Chapter ({nextChapter.chapter_number}) →
          </Link>
        ) : (
          <span className="px-5 py-2.5 bg-neutral-900/50 text-neutral-600 text-xs font-bold rounded-xl cursor-not-allowed">
            Latest Chapter Reached
          </span>
        )}
      </footer>
    </div>
  );
}
