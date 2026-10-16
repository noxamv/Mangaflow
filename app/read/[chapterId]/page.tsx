'use client';

import { useEffect, useState } from 'react';
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
    slug: string;
  };
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<{ id: string; chapter_number: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadChapter() {
      if (!chapterId) return;
      setLoading(true);

      try {
        // 1. Fetch current chapter and associated series info
        const { data: chData, error: chErr } = await supabase
          .from('chapters')
          .select(`
            id,
            series_id,
            chapter_number,
            title,
            pages,
            series (id, title, slug)
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

        // 2. Fetch list of sister chapters for navigation
        const { data: siblings } = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('series_id', currentChapter.series_id)
          .not('pages', 'is', null)
          .order('chapter_number', { ascending: true });

        if (siblings) setAllChapters(siblings);

        // 3. Record to Reading History for "Continue Reading"
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
        console.error('Error loading reader:', err);
      } finally {
        setLoading(false);
      }
    }

    loadChapter();
  }, [chapterId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-neutral-400 flex items-center justify-center text-xs">
        Loading chapter...
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col items-center justify-center px-4 space-y-4">
        <p className="text-sm font-semibold">No images available for this chapter yet.</p>
        <Link
          href="/"
          className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-500 transition"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      {/* Sticky Reader Header */}
      <header className="sticky top-0 z-50 bg-[#0e1017]/95 backdrop-blur border-b border-neutral-800 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/"
            className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 rounded-md text-xs font-semibold text-neutral-300 transition shrink-0"
          >
            ← Home
          </Link>
          {chapter.series && (
            <Link
              href={`/series/${chapter.series.slug || chapter.series.id}`}
              className="text-xs font-bold text-neutral-200 truncate hover:text-indigo-400 transition"
            >
              {chapter.series.title}
            </Link>
          )}
          <span className="text-xs text-neutral-500 shrink-0">
            / Ch. {chapter.chapter_number}
          </span>
        </div>

        {/* Quick Chapter Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          {prevChapter ? (
            <Link
              href={`/read/${prevChapter.id}`}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-xs rounded transition"
            >
              Prev
            </Link>
          ) : (
            <span className="px-2 py-1 bg-neutral-900 text-neutral-600 text-xs rounded cursor-not-allowed">
              Prev
            </span>
          )}

          <select
            value={chapter.id}
            onChange={(e) => router.push(`/read/${e.target.value}`)}
            className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 outline-none"
          >
            {allChapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                Ch. {ch.chapter_number}
              </option>
            ))}
          </select>

          {nextChapter ? (
            <Link
              href={`/read/${nextChapter.id}`}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs rounded transition"
            >
              Next
            </Link>
          ) : (
            <span className="px-2 py-1 bg-neutral-900 text-neutral-600 text-xs rounded cursor-not-allowed">
              Next
            </span>
          )}
        </div>
      </header>

      {/* Comic Panels Container */}
      <main className="flex-1 flex flex-col items-center w-full max-w-3xl mx-auto py-2">
        {chapter.pages.map((imgUrl, idx) => (
          <img
            key={idx}
            src={imgUrl}
            alt={`Page ${idx + 1}`}
            referrerPolicy="no-referrer"
            loading={idx < 3 ? 'eager' : 'lazy'}
            decoding="async"
            className="w-full h-auto block select-none bg-neutral-950"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.src.includes('/api/proxy')) {
                target.src = `/api/proxy?url=${encodeURIComponent(imgUrl)}`;
              }
            }}
          />
        ))}
      </main>

      {/* Reader Bottom Navigation */}
      <footer className="bg-[#0e1017] border-t border-neutral-800 p-4 flex items-center justify-center gap-4">
        {prevChapter && (
          <Link
            href={`/read/${prevChapter.id}`}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold rounded-lg transition"
          >
            ← Previous Chapter
          </Link>
        )}
        {nextChapter && (
          <Link
            href={`/read/${nextChapter.id}`}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg transition"
          >
            Next Chapter →
          </Link>
        )}
      </footer>
    </div>
  );
}
