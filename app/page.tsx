'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  panel_urls: string[];
}

interface Series {
  id: string;
  title: string;
  reading_mode: 'webtoon' | 'manga';
  chapters: Chapter[];
}

export default function HomePage() {
  const [series, setSeries] = useState<Series | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [readingMode, setReadingMode] = useState<'webtoon' | 'manga'>('webtoon');
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMangaData() {
      try {
        const { data, error } = await supabase
          .from('series')
          .select('id, title, reading_mode, chapters(id, chapter_number, title, panel_urls)')
          .order('chapter_number', { foreignTable: 'chapters', ascending: true })
          .limit(1)
          .single();

        if (error) {
          console.error('Database query:', error.message);
        } else if (data) {
          setSeries(data as unknown as Series);
          if (data.reading_mode) {
            setReadingMode(data.reading_mode);
          }
        }
      } catch (err) {
        console.error('Fetch failed:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchMangaData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs">Loading Manga Flow...</p>
        </div>
      </div>
    );
  }

  if (!series || !series.chapters || series.chapters.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-center px-4">
        <h1 className="text-xl font-bold text-neutral-100 mb-2">Welcome to Manga Flow</h1>
        <p className="text-sm text-neutral-400 max-w-sm mb-6">
          Your database is connected, but no chapters are uploaded yet.
        </p>
      </div>
    );
  }

  const currentChapter = series.chapters[activeChapterIndex];

  return (
    <div className="min-h-screen flex flex-col items-center bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-50 w-full max-w-xl bg-neutral-900/90 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-base text-indigo-400">{series.title}</h1>
          <p className="text-xs text-neutral-400">
            Chapter {currentChapter.chapter_number} {currentChapter.title ? `• ${currentChapter.title}` : ''}
          </p>
        </div>

        <div className="flex bg-neutral-800 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setReadingMode('webtoon')}
            className={`px-3 py-1 rounded-md transition ${
              readingMode === 'webtoon' ? 'bg-indigo-600 text-white font-medium' : 'text-neutral-400'
            }`}
          >
            Webtoon
          </button>
          <button
            onClick={() => setReadingMode('manga')}
            className={`px-3 py-1 rounded-md transition ${
              readingMode === 'manga' ? 'bg-indigo-600 text-white font-medium' : 'text-neutral-400'
            }`}
          >
            Manga (RTL)
          </button>
        </div>
      </header>

      <main className="w-full max-w-xl flex flex-col items-center pb-12">
        {readingMode === 'webtoon' ? (
          <div className="w-full flex flex-col shadow-2xl">
            {currentChapter.panel_urls.map((url, i) => (
              <div key={i} className="relative w-full bg-neutral-900">
                <img
                  src={url}
                  alt={`Panel ${i + 1}`}
                  loading="lazy"
                  className="w-full h-auto block select-none"
                />
                <span className="absolute bottom-2 right-2 bg-black/70 text-[10px] px-2 py-0.5 rounded text-neutral-300">
                  {i + 1} / {currentChapter.panel_urls.length}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full px-4 py-8 flex flex-col items-center">
            <img
              src={currentChapter.panel_urls[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-h-[75vh] w-auto rounded shadow-lg object-contain cursor-pointer"
              onClick={() => setCurrentPage((p) => Math.min(currentChapter.panel_urls.length - 1, p + 1))}
            />
            <div className="flex items-center gap-4 mt-6">
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded text-sm"
              >
                Prev
              </button>
              <span className="text-xs text-neutral-400">
                {currentPage + 1} of {currentChapter.panel_urls.length}
              </span>
              <button
                disabled={currentPage === currentChapter.panel_urls.length - 1}
                onClick={() => setCurrentPage((p) => Math.min(currentChapter.panel_urls.length - 1, p + 1))}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded text-sm text-white font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="w-full flex justify-between items-center px-4 py-6 mt-4 border-t border-neutral-800">
          <button
            disabled={activeChapterIndex === 0}
            onClick={() => {
              setActiveChapterIndex((idx) => Math.max(0, idx - 1));
              setCurrentPage(0);
            }}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded text-xs"
          >
            ← Previous Chapter
          </button>
          <span className="text-xs text-neutral-500">
            {activeChapterIndex + 1} / {series.chapters.length}
          </span>
          <button
            disabled={activeChapterIndex === series.chapters.length - 1}
            onClick={() => {
              setActiveChapterIndex((idx) => Math.min(series.chapters.length - 1, idx + 1));
              setCurrentPage(0);
            }}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded text-xs"
          >
            Next Chapter →
          </button>
        </div>
      </main>
    </div>
  );
}
