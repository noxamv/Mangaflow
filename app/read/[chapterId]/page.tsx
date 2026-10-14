'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string | null;
  series_id: string;
  pages: string[];
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [useProxy, setUseProxy] = useState(true);
  const [nextChapterId, setNextChapterId] = useState<string | null>(null);
  const [prevChapterId, setPrevChapterId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchChapter() {
      if (!chapterId) return;
      setLoading(true);

      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', chapterId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setChapter(data);

      // Fetch adjacent chapters for navigation
      const { data: siblings } = await supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', data.series_id)
        .order('chapter_number', { ascending: true });

      if (siblings && siblings.length > 0) {
        const currentIndex = siblings.findIndex((c) => c.id === chapterId);
        if (currentIndex > 0) {
          setPrevChapterId(siblings[currentIndex - 1].id);
        } else {
          setPrevChapterId(null);
        }

        if (currentIndex < siblings.length - 1) {
          setNextChapterId(siblings[currentIndex + 1].id);
        } else {
          setNextChapterId(null);
        }
      }

      // Record reading history if user is logged in
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        await supabase.from('reading_history').upsert({
          user_id: userData.user.id,
          series_id: data.series_id,
          last_chapter_id: data.id,
          updated_at: new Date().toISOString(),
        });
      }

      setLoading(false);
    }

    fetchChapter();
  }, [chapterId]);

  const getImageSrc = (url: string) => {
    if (!useProxy) return url;
    return `/api/proxy?url=${encodeURIComponent(url)}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d12] text-white">
        Loading chapter...
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d12] text-white">
        <h1 className="text-2xl font-bold">Chapter Not Found</h1>
        <Link href="/" className="mt-4 text-purple-400 hover:underline">
          Return Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white">
      {/* Top Floating Control Bar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-gray-800 bg-[#16161f]/90 px-4 py-3 backdrop-blur-md">
        <Link href="/" className="text-sm font-semibold text-gray-300 hover:text-white">
          ← Back
        </Link>
        <span className="text-sm font-medium">Chapter {chapter.chapter_number}</span>
        <button
          onClick={() => setUseProxy((prev) => !prev)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition ${
            useProxy ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'
          }`}
        >
          {useProxy ? 'Proxy ON' : 'Proxy OFF'}
        </button>
      </header>

      {/* Chapter Reader Pages */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-2 py-6">
        {chapter.pages && chapter.pages.length > 0 ? (
          chapter.pages.map((pageUrl, idx) => (
            <div key={idx} className="relative mb-2 w-full">
              <img
                src={getImageSrc(pageUrl)}
                alt={`Page ${idx + 1}`}
                loading="lazy"
                className="w-full rounded shadow-md"
                onError={(e) => {
                  // Fallback to direct URL if proxy fails or vice versa
                  const target = e.currentTarget;
                  if (target.src.includes('/api/proxy')) {
                    target.src = pageUrl;
                  }
                }}
              />
            </div>
          ))
        ) : (
          <p className="py-20 text-gray-500">No images available for this chapter.</p>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="mt-8 flex w-full justify-between gap-4 border-t border-gray-800 pt-6">
          {prevChapterId ? (
            <button
              onClick={() => router.push(`/read/${prevChapterId}`)}
              className="flex-1 rounded-lg bg-gray-800 px-4 py-3 text-center text-sm font-semibold hover:bg-gray-700"
            >
              ← Previous Chapter
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {nextChapterId ? (
            <button
              onClick={() => router.push(`/read/${nextChapterId}`)}
              className="flex-1 rounded-lg bg-purple-600 px-4 py-3 text-center text-sm font-semibold hover:bg-purple-500"
            >
              Next Chapter →
            </button>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </main>
    </div>
  );
}
