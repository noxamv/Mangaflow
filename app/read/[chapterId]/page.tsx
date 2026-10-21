'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const [allChapters, setAllChapters] = useState<{ id: string; chapter_number: number; title: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  // MangaFire View Modes: 'long_strip' (webtoon), 'single', 'double'
  const [layoutMode, setLayoutMode] = useState<'long_strip' | 'single' | 'double'>('long_strip');
  const [pageMargin, setPageMargin] = useState<number>(0);
  const [pageIdx, setPageIdx] = useState(0);

  // UI Visibility & Overlays
  const [showUi, setShowUi] = useState(true);
  const [showChaptersDrawer, setShowChaptersDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerSort, setDrawerSort] = useState<'desc' | 'asc'>('desc');

  // Load Chapter & Sibling Data
  useEffect(() => {
    async function load() {
      if (!chapterId) return;
      setLoading(true);

      try {
        let chData: any = null;
        const res = await fetch(`/api/chapter/${chapterId}`);
        if (res.ok) chData = await res.json();

        if (!chData) {
          const { data } = await supabase
            .from('chapters')
            .select('*, series:series_id(id, title, english_title, slug, cover_image_url)')
            .eq('id', chapterId)
            .single();
          chData = data;
        }

        if (!chData) return;
        setChapter(chData);
        setPageIdx(0);

        // Fetch sibling chapters for navigation
        const { data: sibs } = await supabase
          .from('chapters')
          .select('id, chapter_number, title')
          .eq('series_id', chData.series_id)
          .order('chapter_number', { ascending: true });

        if (sibs) setAllChapters(sibs);

        // Update local reading history
        const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
        const sObj = chData.series;
        local[chData.series_id] = {
          seriesId: chData.series_id,
          seriesTitle: sObj?.english_title || sObj?.title || '',
          seriesSlug: sObj?.slug || chData.series_id,
          coverUrl: sObj?.cover_image_url || '',
          chapterId: chData.id,
          chapterNumber: chData.chapter_number,
          readAt: new Date().toISOString(),
        };
        localStorage.setItem('mangaflow_reading_history', JSON.stringify(local));

        // Sync to Supabase reading_history
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          await supabase.from('reading_history').upsert({
            user_id: auth.user.id,
            series_id: chData.series_id,
            chapter_id: chData.id,
            chapter_number: chData.chapter_number,
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

  // Prev / Next Chapter calculations
  const currentIndex = allChapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  const pages = useMemo(() => {
    return Array.isArray(chapter?.pages) ? chapter!.pages : [];
  }, [chapter]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showChaptersDrawer || showSettingsModal) return;

      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (layoutMode === 'single') setPageIdx((p) => Math.min(pages.length - 1, p + 1));
        else if (layoutMode === 'double') setPageIdx((p) => Math.min(pages.length - 1, p + 2));
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (layoutMode === 'single') setPageIdx((p) => Math.max(0, p - 1));
        else if (layoutMode === 'double') setPageIdx((p) => Math.max(0, p - 2));
      } else if (e.key === ']' && nextChapter) {
        router.push(`/read/${nextChapter.id}`);
      } else if (e.key === '[' && prevChapter) {
        router.push(`/read/${prevChapter.id}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, pages.length, nextChapter, prevChapter, router, showChaptersDrawer, showSettingsModal]);

  // Filtered chapters inside the Quick-Jump drawer
  const filteredChapters = useMemo(() => {
    return allChapters
      .filter((c) => {
        if (!drawerSearch.trim()) return true;
        const q = drawerSearch.toLowerCase();
        return (
          c.chapter_number.toString().includes(q) ||
          (c.title && c.title.toLowerCase().includes(q))
        );
      })
      .sort((a, b) =>
        drawerSort === 'desc'
          ? b.chapter_number - a.chapter_number
          : a.chapter_number - b.chapter_number
      );
  }, [allChapters, drawerSearch, drawerSort]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex flex-col items-center justify-center text-gray-400 gap-4">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium tracking-wide">Loading panels...</p>
      </div>
    );
  }

  if (!chapter || pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex flex-col items-center justify-center text-gray-300 p-6 text-center">
        <h2 className="text-xl font-bold mb-2">No Pages Found</h2>
        <p className="text-sm text-gray-500 max-w-md mb-6">
          This chapter is currently in the sync queue. Our background workers are processing it.
        </p>
        <Link
          href={`/series/${chapter?.series?.slug || ''}`}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-sm transition"
        >
          Back to Series
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090a0d] text-white flex flex-col relative select-none">
      {/* Top Floating MangaFire Navigation Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#121319]/95 backdrop-blur border-b border-gray-800/80 px-4 py-3 flex items-center justify-between transition-transform duration-300 ${
          showUi ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/series/${chapter.series?.slug || ''}`}
            className="text-gray-400 hover:text-white transition text-sm flex items-center gap-1 shrink-0"
          >
            ← <span className="hidden sm:inline">Back</span>
          </Link>
          <span className="text-gray-600">/</span>
          <div className="truncate">
            <h1 className="text-sm font-bold truncate text-gray-100">
              {chapter.series?.english_title || chapter.series?.title}
            </h1>
            <p className="text-xs text-amber-500">Chapter {chapter.chapter_number}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Chapter Quick Jump Drawer Toggle */}
          <button
            onClick={() => setShowChaptersDrawer(true)}
            className="px-3 py-1.5 bg-[#1b1d24] hover:bg-[#252833] border border-gray-700/60 rounded-md text-xs font-medium flex items-center gap-1.5 text-gray-200 transition"
          >
            📑 Chapters
          </button>

          {/* Reader View Mode Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 bg-[#1b1d24] hover:bg-[#252833] border border-gray-700/60 rounded-md text-gray-300 transition"
            title="Reader Mode"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Reader Viewport */}
      <main
        className="flex-1 flex flex-col items-center justify-center py-16 px-0 w-full"
        onClick={() => setShowUi((prev) => !prev)}
      >
        {/* Mode 1: Long Strip / Webtoon Mode */}
        {layoutMode === 'long_strip' && (
          <div
            className="flex flex-col items-center w-full max-w-3xl"
            style={{ gap: `${pageMargin}px` }}
          >
            {pages.map((url, i) => (
              <img
                key={i}
                src={`/api/proxy?url=${encodeURIComponent(url)}`}
                alt={`Page ${i + 1}`}
                loading={i < 3 ? 'eager' : 'lazy'}
                className="w-full h-auto block select-none pointer-events-none"
              />
            ))}
          </div>
        )}

        {/* Mode 2: Single Page Mode */}
        {layoutMode === 'single' && (
          <div className="flex flex-col items-center justify-center min-h-[75vh] max-w-4xl px-2">
            <img
              src={`/api/proxy?url=${encodeURIComponent(pages[pageIdx])}`}
              alt={`Page ${pageIdx + 1}`}
              className="max-h-[85vh] w-auto object-contain select-none"
            />
            <div className="mt-4 text-xs text-gray-400">
              Page {pageIdx + 1} of {pages.length}
            </div>
          </div>
        )}

        {/* Mode 3: Double Page Manga Spread */}
        {layoutMode === 'double' && (
          <div className="flex items-center justify-center min-h-[75vh] max-w-6xl px-2 gap-1">
            {pageIdx + 1 < pages.length && (
              <img
                src={`/api/proxy?url=${encodeURIComponent(pages[pageIdx + 1])}`}
                alt={`Page ${pageIdx + 2}`}
                className="max-h-[85vh] w-1/2 object-contain select-none"
              />
            )}
            <img
              src={`/api/proxy?url=${encodeURIComponent(pages[pageIdx])}`}
              alt={`Page ${pageIdx + 1}`}
              className="max-h-[85vh] w-1/2 object-contain select-none"
            />
          </div>
        )}
      </main>

      {/* Bottom Floating MangaFire Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#121319]/95 backdrop-blur border-t border-gray-800/80 px-4 py-2.5 flex items-center justify-between transition-transform duration-300 ${
          showUi ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <button
          disabled={!prevChapter}
          onClick={() => prevChapter && router.push(`/read/${prevChapter.id}`)}
          className="px-3.5 py-1.5 bg-[#1a1c23] hover:bg-[#262833] disabled:opacity-30 disabled:hover:bg-[#1a1c23] border border-gray-700/50 rounded-md text-xs font-semibold transition"
        >
          ← Prev Chapter
        </button>

        <span className="text-xs text-gray-400 font-medium">
          Ch. {chapter.chapter_number}
        </span>

        <button
          disabled={!nextChapter}
          onClick={() => nextChapter && router.push(`/read/${nextChapter.id}`)}
          className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-black disabled:opacity-30 disabled:hover:bg-amber-500 rounded-md text-xs font-bold transition"
        >
          Next Chapter →
        </button>
      </footer>

      {/* Chapter Quick-Jump Drawer */}
      {showChaptersDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowChaptersDrawer(false)}
          />
          <div className="relative ml-auto w-full max-w-sm bg-[#121319] border-l border-gray-800 h-full flex flex-col p-4 shadow-2xl z-10">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800">
              <h3 className="font-bold text-sm text-gray-100">Chapter List</h3>
              <button
                onClick={() => setShowChaptersDrawer(false)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="my-3 flex items-center gap-2">
              <input
                type="text"
                placeholder="Search chapter number..."
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                className="flex-1 bg-[#1a1c24] border border-gray-700/60 rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={() => setDrawerSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
                className="px-2.5 py-1.5 bg-[#1a1c24] border border-gray-700/60 rounded text-xs text-gray-300 font-medium"
              >
                {drawerSort === 'desc' ? '▼ Newest' : '▲ Oldest'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {filteredChapters.map((c) => {
                const isActive = c.id === chapterId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setShowChaptersDrawer(false);
                      router.push(`/read/${c.id}`);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-xs flex items-center justify-between transition ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40'
                        : 'text-gray-300 hover:bg-[#1a1c24]'
                    }`}
                  >
                    <span>Chapter {c.chapter_number}</span>
                    {c.title && (
                      <span className="text-[11px] text-gray-500 truncate max-w-[140px]">
                        {c.title}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Reader Mode Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowSettingsModal(false)}
          />
          <div className="relative bg-[#151720] border border-gray-800 rounded-xl p-5 w-full max-w-sm shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-gray-800">
              <h3 className="font-bold text-sm text-gray-200">Reading Options</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs text-gray-400 font-medium block mb-2">
                Reading Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'long_strip', label: 'Webtoon' },
                  { id: 'single', label: 'Single' },
                  { id: 'double', label: 'Spread' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setLayoutMode(mode.id as any)}
                    className={`py-2 rounded text-xs font-semibold transition ${
                      layoutMode === mode.id
                        ? 'bg-amber-500 text-black'
                        : 'bg-[#1e202b] text-gray-300 hover:bg-[#272a39]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {layoutMode === 'long_strip' && (
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-2">
                  Panel Gap: {pageMargin}px
                </label>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="5"
                  value={pageMargin}
                  onChange={(e) => setPageMargin(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-500"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
