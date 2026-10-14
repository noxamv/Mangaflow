'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface ChapterRecord {
  id: string;
  chapter_number: number;
  title: string | null;
  series_id: string;
  pages?: any;
  images?: any;
  page_urls?: any;
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterRecord | null>(null);
  const [pageList, setPageList] = useState<string[]>([]);
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

      // Extract image list across various possible database column names
      let rawPages = data.pages || data.images || data.page_urls || [];
      if (typeof rawPages === 'string') {
        try {
          rawPages = JSON.parse(rawPages);
        } catch {
          rawPages = [rawPages];
        }
      }

      if (Array.isArray(rawPages)) {
        // Flatten or map if items are objects like { url: '...' }
        const parsed = rawPages
          .map((item: any) => (typeof item === 'string' ? item : item?.url || item?.src || ''))
          .filter(Boolean);
        setPageList(parsed);
      } else {
        setPageList([]);
      }

      // Fetch adjacent chapters
      const { data: siblings } = await supabase
        .from('chapters')
        .select('id, chapter_number')
        .eq('series_id', data.series_id)
        .order('chapter_number', { ascending: true });

      if (siblings && siblings.length > 0) {
        const currentIndex = siblings.findIndex((c) => c.id === chapterId);
        setPrevChapterId(currentIndex > 0 ? siblings[currentIndex - 1].id : null);
        setNextChapterId(currentIndex < siblings.length - 1 ? siblings[currentIndex + 1].id : null);
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

      {/* Reader Body */}
      <main className="mx-auto flex max-w-3xl flex-col items-center px-2 py-6">
        {pageList.length > 0 ? (
          pageList.map((pageUrl, idx) => (
            <div key={idx} className="relative mb-2 w-full">
              <img
                src={getImageSrc(pageUrl)}
                alt={`Page ${idx + 1}`}
                loading="lazy"
                className="w-full rounded shadow-md"
                onError={(e) => {
                  const target = e.currentTarget;
                  // If proxy fails, try direct URL; if direct fails, try proxy
                  if (target.src.includes('/api/proxy')) {
                    target.src = pageUrl;
                  }
                }}
              />
            </div>
          ))
        ) : (
          <div className="py-20 text-center">
            <p className="text-gray-400">No images available for this chapter.</p>
            <p className="mt-2 text-xs text-gray-600">
              Run your GitHub Actions scraper workflow to sync chapter panels into Supabase.
            </p>
          </div>
        )}

        {/* Bottom Nav */}
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
