'use client';

import { useState, useEffect } from 'react';
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
          .select('slug')
          .eq('id', chData.series_id)
          .single();

        if (seriesData) setSeriesSlug(seriesData.slug);

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

        // Automatic progress tracking for authenticated users
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

  const pagesList = Array.isArray(chapter.pages) ? chapter.pages : [];

  return (
    <div className="min-h-screen bg-[#07080a] text-neutral-200 flex flex-col items-center select-none">
      {/* Top Floating Reader Bar */}
      <nav className="sticky top-0 z-40 w-full bg-[#0b0c10]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 py-2.5 flex items-center justify-between max-w-3xl">
        <Link
          href={`/series/${seriesSlug}`}
          className="text-xs font-semibold text-neutral-400 hover:text-white transition flex items-center gap-1.5"
        >
          ← Series Overview
        </Link>
        <span className="text-xs font-bold text-white">
          Chapter {chapter.chapter_number}
        </span>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700/80 text-xs font-semibold hover:bg-neutral-800 transition"
        >
          All Chapters
        </button>
      </nav>

      {/* Reader Strip Surface */}
      <main className="w-full max-w-2xl flex flex-col items-center py-2 min-h-screen">
        {pagesList.length === 0 ? (
          <div className="py-24 text-xs text-neutral-500">
            No image pages found for this chapter.
          </div>
        ) : (
          pagesList.map((url, i) => (
            <div key={i} className="w-full relative bg-neutral-950 flex justify-center">
              <img
                src={url}
                alt={`Page ${i + 1}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full h-auto block select-none"
              />
            </div>
          ))
        )}

        {/* End of Chapter Navigation */}
        <div className="w-full max-w-md px-4 py-12 flex flex-col items-center gap-3">
          <p className="text-xs text-neutral-400 font-semibold">
            End of Chapter {chapter.chapter_number}
          </p>
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
              <div className="flex-1 py-2.5 text-center text-xs text-neutral-600 border border-transparent">
                First Chapter
              </div>
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
              <div className="flex-1 py-2.5 text-center text-xs text-neutral-600 border border-transparent">
                Latest Chapter
              </div>
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
