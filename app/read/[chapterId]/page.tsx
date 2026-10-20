'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const [mode, setMode] = useState<'webtoon' | 'single'>('webtoon');
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    async function load() {
      if (!chapterId) return;
      setLoading(true);

      try {
        const { data: chData } = await supabase
          .from('chapters')
          .select(`id, series_id, chapter_number, title, pages, series (id, title, english_title, slug, cover_image_url)`)
          .eq('id', chapterId)
          .maybeSingle();

        if (!chData) {
          setLoading(false);
          return;
        }

        const sObj = Array.isArray(chData.series) ? chData.series[0] : chData.series;
        const cur: Chapter = { ...chData, series: sObj };
        setChapter(cur);
        setPageIdx(0);

        const { data: sibs } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', cur.series_id)
          .not('pages', 'is', null)
          .order('chapter_number', { ascending: true });

        if (sibs) setAllChapters(sibs);

        // Local storage saving
        const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
        local[cur.series_id] = {
          seriesId: cur.series_id,
          seriesTitle: sObj?.english_title || sObj?.title || '',
          seriesSlug: sObj?.slug || cur.series_id,
          coverUrl: sObj?.cover_image_url || '',
          chapterId: cur.id,
          chapterNumber: cur.chapter_number,
        };
        localStorage.setItem('mangaflow_reading_history', JSON.stringify(local));
      } catch (err) {
        console.error('Reader error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [chapterId]);

  const currentIndex = allChapters.findIndex((c) => c.id === chapter?.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (mode !== 'single' || !chapter?.pages) return;
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (pageIdx < chapter.pages.length - 1) setPageIdx((p) => p + 1);
        else if (nextChapter) router.push(`/read/${nextChapter.id}`);
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (pageIdx > 0) setPageIdx((p) => p - 1);
        else if (prevChapter) router.push(`/read/${prevChapter.id}`);
      }
    },
    [mode, chapter, pageIdx, nextChapter, prevChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (loading) {
    return <div className="min-h-screen bg-[#07080b] flex items-center justify-center text-xs text-neutral-400">Loading chapter...</div>;
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-white space-y-3">
        <p className="text-sm">No images cached yet.</p>
        <Link href="/" className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold">Back Home</Link>
      </div>
    );
  }

  const primaryTitle = chapter.series?.english_title || chapter.series?.title;

  return (
    <div className="min-h-screen bg-[#07080b] text-white flex flex-col select-none">
      <header className="sticky top-0 z-50 bg-[#0e1017]/95 backdrop-blur border-b border-neutral-800 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 truncate">
          <Link href={`/series/${chapter.series?.slug || chapter.series_id}`} className="px-2 py-1 bg-neutral-800 rounded text-xs">
            ←
          </Link>
          <span className="font-bold text-xs truncate">{primaryTitle}</span>
          <span className="text-xs text-neutral-500 shrink-0">Ch. {chapter.chapter_number}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-[11px]">
            <button
              onClick={() => setMode('webtoon')}
              className={`px-2 py-0.5 rounded font-semibold ${mode === 'webtoon' ? 'bg-indigo-600 text-white' : 'text-neutral-400'}`}
            >
              Webtoon
            </button>
            <button
              onClick={() => setMode('single')}
              className={`px-2 py-0.5 rounded font-semibold ${mode === 'single' ? 'bg-indigo-600 text-white' : 'text-neutral-400'}`}
            >
              Single
            </button>
          </div>

          <select
            value={chapter.id}
            onChange={(e) => router.push(`/read/${e.target.value}`)}
            className="bg-neutral-900 border border-neutral-700 text-xs rounded px-2 py-1 outline-none"
          >
            {allChapters.map((c) => (
              <option key={c.id} value={c.id}>Ch. {c.chapter_number}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center w-full py-2">
        {mode === 'webtoon' ? (
          <div className="w-full max-w-3xl flex flex-col items-center mx-auto">
            {chapter.pages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                referrerPolicy="no-referrer"
                loading={i < 4 ? 'eager' : 'lazy'}
                className="w-full h-auto block select-none bg-neutral-950"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.src.includes('/api/proxy')) {
                    target.src = `/api/proxy?url=${encodeURIComponent(url)}`;
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center flex-1 px-2">
            <img
              src={chapter.pages[pageIdx]}
              alt=""
              referrerPolicy="no-referrer"
              className="max-h-[85vh] w-auto object-contain rounded shadow-2xl"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes('/api/proxy')) {
                  target.src = `/api/proxy?url=${encodeURIComponent(chapter.pages![pageIdx])}`;
                }
              }}
            />
            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-neutral-400">
              <button disabled={pageIdx === 0} onClick={() => setPageIdx((p) => p - 1)} className="px-3 py-1 bg-neutral-900 rounded disabled:opacity-30">
                ← Prev
              </button>
              <span>Page {pageIdx + 1} / {chapter.pages.length}</span>
              <button disabled={pageIdx === chapter.pages.length - 1} onClick={() => setPageIdx((p) => p + 1)} className="px-3 py-1 bg-neutral-900 rounded disabled:opacity-30">
                Next →
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-[#0e1017] border-t border-neutral-800 p-4 flex items-center justify-center gap-4">
        {prevChapter && (
          <Link href={`/read/${prevChapter.id}`} className="px-4 py-2 bg-neutral-800 rounded-lg text-xs font-bold">
            ← Prev Chapter ({prevChapter.chapter_number})
          </Link>
        )}
        {nextChapter && (
          <Link href={`/read/${nextChapter.id}`} className="px-5 py-2 bg-indigo-600 rounded-lg text-xs font-black">
            Next Chapter ({nextChapter.chapter_number}) →
          </Link>
        )}
      </footer>
    </div>
  );
}
