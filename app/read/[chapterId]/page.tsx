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

  const lastScrollY = useRef(0);

  useEffect(() => {
    if (readingMode !== 'webtoon') {
      setHeaderVisible(true);
      return;
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 150) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readingMode]);

  useEffect(() => {
    async function loadReader() {
      if (!chapterId) return;
      setLoading(true);

      try {
        const { data: chapData, error: chapErr } = await supabase
          .from('chapters')
          .select('id, series_id, chapter_number, title, base_url, pages')
          .eq('id', chapterId)
          .single();

        if (chapErr || !chapData) {
          setLoading(false);
          return;
        }

        setChapter(chapData);

        const { data: sData } = await supabase
          .from('series')
          .select('id, slug, title, reading_mode')
          .eq('id', chapData.series_id)
          .single();

        if (sData) {
          setSeries(sData);
          setReadingMode(sData.reading_mode === 'webtoon' ? 'webtoon' : 'paged');
        }

        const { data: chaps } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', chapData.series_id)
          .order('chapter_number', { ascending: true });

        if (chaps?.length) {
          setAllChapters(chaps);
          const currentIndex = chaps.findIndex((c) => c.id === chapData.id);
          setPrevChapter(currentIndex > 0 ? chaps[currentIndex - 1] : null);
          setNextChapter(currentIndex < chaps.length - 1 ? chaps[currentIndex + 1] : null);
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase.from('reading_history').upsert(
            {
              user_id: session.user.id,
              series_id: chapData.series_id,
              chapter_id: chapData.id,
              chapter_number: chapData.chapter_number,
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

      if (fullUrl.includes('readdetectiveconan.com') || fullUrl.includes('mangapill.com')) {
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

  useEffect(() => {
    if (readingMode !== 'paged') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        readingDirection === 'rtl' ? handlePrevPage() : handleNextPage();
      } else if (e.key === 'ArrowLeft') {
        readingDirection === 'rtl' ? handleNextPage() : handlePrevPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readingMode, readingDirection, handleNextPage, handlePrevPage]);

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
        <h1 className="text-xl font-bold text-white mb-2">Chapter Not Found or Empty</h1>
        <p className="text-xs text-neutral-400 mb-6">This chapter is currently being ingested from upstream mirrors.</p>
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
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>

          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[200px] sm:max-w-md">
              {series?.title || 'MangaFlow Reader'}
            </span>
            <span className="text-[11px] text-neutral-400">
              Chapter {chapter.chapter_number} {chapter.title ? `— ${chapter.title}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

          <button
            onClick={() => {
              setSettingsOpen(!settingsOpen);
              setChapterListOpen(false);
            }}
            className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="fixed top-12 right-4 z-50 w-72 bg-[#13151f] border border-neutral-800 rounded-2xl p-4 shadow-2xl text-xs space-y-4">
          <div>
            <span className="font-bold text-neutral-300 block mb-2">Reading Flow</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setReadingMode('webtoon')}
                className={`py-1.5 rounded-xl font-bold transition ${
                  readingMode === 'webtoon' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Webtoon (Scroll)
              </button>
              <button
                onClick={() => setReadingMode('paged')}
                className={`py-1.5 rounded-xl font-bold transition ${
                  readingMode === 'paged' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                Paged (Manga)
              </button>
            </div>
          </div>

          {readingMode === 'paged' && (
            <>
              <div>
                <span className="font-bold text-neutral-300 block mb-2">Reading Direction</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setReadingDirection('ltr')}
                    className={`py-1.5 rounded-xl font-bold transition ${
                      readingDirection === 'ltr' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    Left → Right
                  </button>
                  <button
                    onClick={() => setReadingDirection('rtl')}
                    className={`py-1.5 rounded-xl font-bold transition ${
                      readingDirection === 'rtl' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    Right → Left
                  </button>
                </div>
              </div>

              <div>
                <span className="font-bold text-neutral-300 block mb-2">Scale / Fit</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPageFit('width')}
                    className={`py-1.5 rounded-xl font-bold transition ${
                      pageFit === 'width' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    Fit Width
                  </button>
                  <button
                    onClick={() => setPageFit('height')}
                    className={`py-1.5 rounded-xl font-bold transition ${
                      pageFit === 'height' ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    Fit Height
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {chapterListOpen && (
        <div className="fixed top-12 right-4 z-50 w-72 max-h-[70vh] bg-[#13151f] border border-neutral-800 rounded-2xl p-3 shadow-2xl overflow-y-auto no-scrollbar text-xs">
          <span className="font-bold text-neutral-300 block mb-2 px-2">Jump to Chapter</span>
          <div className="space-y-1">
            {allChapters.map((c) => (
              <Link
                key={c.id}
                href={`/read/${c.id}`}
                onClick={() => setChapterListOpen(false)}
                className={`block px-3 py-2 rounded-xl transition font-medium ${
                  c.id === chapter.id ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-neutral-800/80 text-neutral-300'
                }`}
              >
                Chapter {c.chapter_number}
              </Link>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 w-full flex flex-col items-center justify-center pt-14 pb-16">
        {readingMode === 'webtoon' ? (
          <div className="w-full max-w-3xl flex flex-col items-center">
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

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'ltr' ? handlePrevPage() : handleNextPage();
                }}
                className="absolute left-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
                aria-label="Previous Page Region"
              />
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  readingDirection === 'ltr' ? handleNextPage() : handlePrevPage();
                }}
                className="absolute right-0 top-0 bottom-0 w-1/3 cursor-pointer z-10"
                aria-label="Next Page Region"
              />
            </div>

            <div className="mt-4 flex items-center gap-3 text-xs text-neutral-400">
              <span>
                Page {currentPage + 1} of {totalPages}
              </span>
            </div>
          </div>
        )}
      </main>

      <footer
        className={`fixed bottom-0 left-0 right-0 z-40 bg-[#0c0d14]/95 backdrop-blur-md border-t border-neutral-800/80 px-4 py-2.5 transition-transform duration-300 flex items-center justify-between ${
          headerVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div>
          {prevChapter ? (
            <Link
              href={`/read/${prevChapter.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold transition"
            >
              ← Prev Ch. {prevChapter.chapter_number}
            </Link>
          ) : (
            <span className="text-xs text-neutral-600 px-3.5 py-1.5">First Chapter</span>
          )}
        </div>

        <div className="text-[11px] text-neutral-400 font-medium">
          {readingMode === 'webtoon' ? `${totalPages} Panels` : `Page ${currentPage + 1} / ${totalPages}`}
        </div>

        <div>
          {nextChapter ? (
            <Link
              href={`/read/${nextChapter.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-indigo-600/30"
            >
              Next Ch. {nextChapter.chapter_number} →
            </Link>
          ) : (
            <span className="text-xs text-neutral-500 px-3.5 py-1.5 font-medium">Latest Release</span>
          )}
        </div>
      </footer>
    </div>
  );
}
