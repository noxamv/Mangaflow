'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  base_url?: string | null;
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
  const [allChapters, setAllChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showUi, setShowUi] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [showChaptersDrawer, setShowChaptersDrawer] = useState(false);

  useEffect(() => {
    async function load() {
      if (!chapterId) return;
      setLoading(true);

      try {
        let chData: any = null;
        try {
          const res = await fetch(`/api/chapter/${chapterId}`);
          if (res.ok) chData = await res.json();
        } catch {}

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

        const { data: sibs } = await supabase
          .from('chapters')
          .select('id, chapter_number, title')
          .eq('series_id', chData.series_id)
          .order('chapter_number', { ascending: true });

        if (sibs) setAllChapters(sibs);

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
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [chapterId]);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        setShowUi(false);
      } else {
        setShowUi(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const pages = useMemo(() => {
    if (!chapter || !Array.isArray(chapter.pages)) return [];
    const base = chapter.base_url || '';
    return chapter.pages.map((p) => (p.startsWith('http') ? p : `${base}${p}`));
  }, [chapter]);

  const currentIndex = allChapters.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex flex-col items-center justify-center text-neutral-400 gap-3">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        <p className="text-xs">Loading panels...</p>
      </div>
    );
  }

  if (!chapter || pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#07080a] flex flex-col items-center justify-center text-neutral-300 p-6 text-center">
        <h2 className="text-sm font-semibold mb-2">No pages available for this chapter</h2>
        <Link
          href={`/series/${chapter?.series?.slug || ''}`}
          className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg text-xs transition"
        >
          Back to Series
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07080a] text-white flex flex-col relative select-none">
      {/* Top Floating Control Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#0d0e14]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 py-3 flex items-center justify-between transition-transform duration-300 ${
          showUi ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/series/${chapter.series?.slug || ''}`}
            className="text-neutral-400 hover:text-white transition text-xs font-semibold shrink-0"
          >
            ← Back
          </Link>
          <span className="text-neutral-700">/</span>
          <div className="truncate">
            <h1 className="text-xs font-semibold truncate text-neutral-200">
              {chapter.series?.english_title || chapter.series?.title}
            </h1>
            <p className="text-[10px] text-amber-400">Chapter {chapter.chapter_number}</p>
          </div>
        </div>

        <button
          onClick={() => setShowChaptersDrawer(true)}
          className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg text-xs font-medium text-neutral-200 transition"
        >
          📑 Chapters
        </button>
      </header>

      {/* Reading Canvas: -mt-[1px] eliminates browser sub-pixel gap lines */}
      <main
        className="flex-1 flex flex-col items-center w-full max-w-3xl mx-auto py-12"
        onClick={() => setShowUi((prev) => !prev)}
      >
        {pages.map((url, i) => (
          <img
            key={i}
            src={`/api/proxy?url=${encodeURIComponent(url)}`}
            alt={`Page ${i + 1}`}
            loading={i < 3 ? 'eager' : 'lazy'}
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src.includes('/api/proxy')) {
                target.src = url;
              }
            }}
            className="w-full h-auto block select-none pointer-events-none -mt-[1px]"
          />
        ))}

        <div className="w-full max-w-xl px-4 py-12 flex flex-col items-center gap-4 text-center">
          <p className="text-xs text-neutral-500">End of Chapter {chapter.chapter_number}</p>
          <div className="flex items-center gap-3 w-full justify-center">
            <button
              disabled={!prevChapter}
              onClick={() => prevChapter && router.push(`/read/${prevChapter.id}`)}
              className="flex-1 max-w-[150px] py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 border border-neutral-800 rounded-lg text-xs font-medium transition"
            >
              ← Previous
            </button>
            <button
              disabled={!nextChapter}
              onClick={() => nextChapter && router.push(`/read/${nextChapter.id}`)}
              className="flex-1 max-w-[150px] py-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-30 rounded-lg text-xs transition"
            >
              Next Chapter →
            </button>
          </div>
        </div>
      </main>

      {/* Bottom Floating Status Bar */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#0d0e14]/95 backdrop-blur-md border-t border-neutral-800/80 px-4 py-2.5 flex items-center justify-between transition-transform duration-300 ${
          showUi ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <button
          disabled={!prevChapter}
          onClick={() => prevChapter && router.push(`/read/${prevChapter.id}`)}
          className="text-xs text-neutral-400 hover:text-white disabled:opacity-30"
        >
          ← Ch. {prevChapter?.chapter_number || ''}
        </button>

        <span className="text-[11px] font-medium text-neutral-300 bg-neutral-800 px-3 py-1 rounded-full">
          Ch. {chapter.chapter_number} ({pages.length} panels)
        </span>

        <button
          disabled={!nextChapter}
          onClick={() => nextChapter && router.push(`/read/${nextChapter.id}`)}
          className="text-xs text-amber-400 hover:text-amber-300 disabled:opacity-30"
        >
          Ch. {nextChapter?.chapter_number || ''} →
        </button>
      </footer>

      {/* Chapters Drawer */}
      {showChaptersDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowChaptersDrawer(false)} />
          <div className="relative ml-auto w-full max-w-xs bg-[#121319] border-l border-neutral-800 h-full flex flex-col p-4 shadow-2xl z-10">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="font-semibold text-xs text-white">All Chapters</h3>
              <button onClick={() => setShowChaptersDrawer(false)} className="text-neutral-400 hover:text-white text-sm">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 py-3 pr-1">
              {allChapters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setShowChaptersDrawer(false);
                    router.push(`/read/${c.id}`);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                    c.id === chapterId ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'text-neutral-300 hover:bg-neutral-800/60'
                  }`}
                >
                  Chapter {c.chapter_number}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
