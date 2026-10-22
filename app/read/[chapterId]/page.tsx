'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    async function loadReaderData() {
      if (!chapterId) return;
      setLoading(true);

      // 1. Fetch current chapter
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

      // 2. Fetch series metadata and sibling chapters for quick navigation
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
        // Deduplicate sibling chapter numbers in memory
        const seen = new Set<number>();
        const deduped: SiblingChapter[] = [];
        for (const sib of siblings) {
          if (!seen.has(sib.chapter_number)) {
            seen.add(sib.chapter_number);
            deduped.push(sib);
          }
        }
        setAllChapters(deduped);
      }

      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    loadReaderData();
  }, [chapterId]);

  // Compute Previous and Next chapter IDs
  const { prevChapter, nextChapter } = useMemo(() => {
    if (!chapter || allChapters.length === 0) {
      return { prevChapter: null, nextChapter: null };
    }
    // allChapters is sorted DESC (e.g. Ch 97, 96, 95)
    const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
    if (currentIndex === -1) {
      return { prevChapter: null, nextChapter: null };
    }

    const next = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
    const prev = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

    return { prevChapter: prev, nextChapter: next };
  }, [chapter, allChapters]);

  // Keyboard navigation support: ArrowLeft (Prev), ArrowRight (Next)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && prevChapter) {
        router.push(`/read/${prevChapter.id}`);
      } else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && nextChapter) {
        router.push(`/read/${nextChapter.id}`);
      }
    },
    [prevChapter, nextChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Image URL Resolver: guarantees valid absolute URL
  const resolveImageUrl = useCallback(
    (page: string): string => {
      if (!page) return '';
      if (page.startsWith('http://') || page.startsWith('https://')) {
        return page;
      }
      if (chapter?.base_url) {
        const cleanBase = chapter.base_url.replace(/\/+$/, '');
        const cleanPage = page.replace(/^\/+/, '');
        return `${cleanBase}/${cleanPage}`;
      }
      return page.startsWith('/') ? page : `/${page}`;
    },
    [chapter?.base_url]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090a0d] flex items-center justify-center text-neutral-500">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-amber-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#090a0d] flex flex-col items-center justify-center text-neutral-400 space-y-4">
        <p className="text-sm">Chapter panels are currently being re-indexed.</p>
        {seriesSlug ? (
          <Link
            href={`/series/${seriesSlug}`}
            className="text-xs text-amber-400 hover:underline border border-neutral-800 bg-neutral-900 px-4 py-2 rounded-lg"
          >
            ← Return to Overview
          </Link>
        ) : (
          <Link href="/" className="text-xs text-amber-400 hover:underline">
            ← Return to Library
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060709] text-neutral-200 flex flex-col select-none">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-[#090a0d]/90 backdrop-blur-md border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={seriesSlug ? `/series/${seriesSlug}` : '/'}
            className="text-xs text-neutral-400 hover:text-white transition flex items-center gap-1 shrink-0"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate">
              {seriesTitle || 'MangaFlow'}
            </h1>
            <p className="text-[11px] text-amber-400 font-medium truncate">
              Chapter {chapter.chapter_number}
              {chapter.title && chapter.title !== `Chapter ${chapter.chapter_number}`
                ? ` - ${chapter.title}`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-200 rounded-lg transition flex items-center gap-1.5"
          >
            <span>📑</span>
            <span className="hidden sm:inline">Chapters</span>
          </button>
        </div>
      </header>

      {/* Main Comic Viewer Panel Container */}
      <main className="flex-1 flex flex-col items-center w-full max-w-4xl mx-auto py-2">
        {chapter.pages.map((page, idx) => {
          const resolvedSrc = resolveImageUrl(page);

          return (
            <div
              key={idx}
              className="w-full flex justify-center bg-[#090a0d] min-h-[300px] border-b border-neutral-900/40 relative group"
            >
              <img
                src={resolvedSrc}
                alt={`Page ${idx + 1}`}
                loading="lazy"
                decoding="async"
                // Crucial hotlink protection bypass
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="w-full h-auto object-contain block max-w-full"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.onerror = null;
                  // Retry without base URL if direct link was attempted
                  if (!page.startsWith('http') && !target.src.includes('comick.pictures')) {
                    target.src = `https://meo3.comick.pictures/${page.replace(/^\/+/, '')}`;
                  }
                }}
              />
            </div>
          );
        })}
      </main>

      {/* Bottom Floating Navigation Toolbar */}
      <footer className="sticky bottom-0 z-40 bg-[#090a0d]/95 backdrop-blur-md border-t border-neutral-800 px-4 py-3 flex items-center justify-between max-w-3xl mx-auto w-full rounded-t-xl shadow-2xl">
        {prevChapter ? (
          <Link
            href={`/read/${prevChapter.id}`}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition"
          >
            ← Ch. {prevChapter.chapter_number}
          </Link>
        ) : (
          <span className="px-3.5 py-1.5 bg-neutral-950 border border-neutral-900 text-neutral-600 rounded-lg text-xs cursor-not-allowed">
            First Chapter
          </span>
        )}

        <span className="text-[11px] font-medium text-neutral-500">
          Ch. {chapter.chapter_number} ({chapter.pages.length} panels)
        </span>

        {nextChapter ? (
          <Link
            href={`/read/${nextChapter.id}`}
            className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-semibold text-amber-400 transition"
          >
            Ch. {nextChapter.chapter_number} →
          </Link>
        ) : (
          <span className="px-3.5 py-1.5 bg-neutral-950 border border-neutral-900 text-neutral-600 rounded-lg text-xs cursor-not-allowed">
            Latest Chapter
          </span>
        )}
      </footer>

      {/* Chapter Selection Slide-out Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative ml-auto w-80 max-w-full bg-[#0d0e14] border-l border-neutral-800 h-full p-4 flex flex-col z-10 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h2 className="text-sm font-bold text-white">Select Chapter</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded-md bg-neutral-900"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-800">
              {allChapters.map((c) => {
                const isCurrent = c.id === chapter.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setDrawerOpen(false);
                      router.push(`/read/${c.id}`);
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                      isCurrent
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold'
                        : 'bg-neutral-900/60 hover:bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    <span>Chapter {c.chapter_number}</span>
                    {isCurrent && <span className="text-[10px] text-amber-400">Reading</span>}
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
