'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  panel_urls: string[];
}

interface Series {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  cover_image_url: string;
  reading_mode: 'webtoon' | 'manga';
  chapters: Chapter[];
}

export default function HomePage() {
  const [library, setLibrary] = useState<Series[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [readingMode, setReadingMode] = useState<'webtoon' | 'manga'>('webtoon');
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLibrary() {
      try {
        const { data, error } = await supabase
          .from('series')
          .select('id, slug, title, synopsis, cover_image_url, reading_mode, chapters(id, chapter_number, title, panel_urls)')
          .order('created_at', { ascending: false });

        if (error) console.error(error.message);
        if (data) {
          // Sort chapters inside each series numerically
          const sorted = (data as unknown as Series[]).map(s => ({
            ...s,
            chapters: (s.chapters || []).sort((a, b) => a.chapter_number - b.chapter_number)
          }));
          setLibrary(sorted);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadLibrary();
  }, []);

  const openReader = (series: Series, chapterIdx = 0) => {
    setSelectedSeries(series);
    setActiveChapterIndex(chapterIdx);
    setCurrentPage(0);
    setReadingMode(series.reading_mode || 'webtoon');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-400 gap-3">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs tracking-wider uppercase font-semibold">Loading Manga Flow...</p>
      </div>
    );
  }

  // READER VIEW
  if (selectedSeries && selectedSeries.chapters?.length > 0) {
    const currentChapter = selectedSeries.chapters[activeChapterIndex];

    return (
      <div className="min-h-screen flex flex-col items-center bg-neutral-950 text-neutral-100">
        <header className="sticky top-0 z-50 w-full max-w-xl bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-4 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSelectedSeries(null)}
              className="p-1 px-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-lg text-xs shrink-0"
            >
              ← Back
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-xs sm:text-sm text-indigo-400 truncate">{selectedSeries.title}</h1>
              {/* CHAPTER SELECT DROPDOWN */}
              <select
                value={activeChapterIndex}
                onChange={(e) => {
                  setActiveChapterIndex(Number(e.target.value));
                  setCurrentPage(0);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="bg-neutral-800 text-[11px] text-neutral-200 rounded px-1.5 py-0.5 border border-neutral-700 outline-none"
              >
                {selectedSeries.chapters.map((ch, idx) => (
                  <option key={ch.id} value={idx}>
                    Ch. {ch.chapter_number} {ch.title ? `- ${ch.title}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex bg-neutral-800 p-0.5 rounded-lg text-xs shrink-0">
            <button
              onClick={() => setReadingMode('webtoon')}
              className={`px-2 py-1 rounded-md transition ${
                readingMode === 'webtoon' ? 'bg-indigo-600 text-white font-medium' : 'text-neutral-400'
              }`}
            >
              Webtoon
            </button>
            <button
              onClick={() => setReadingMode('manga')}
              className={`px-2 py-1 rounded-md transition ${
                readingMode === 'manga' ? 'bg-indigo-600 text-white font-medium' : 'text-neutral-400'
              }`}
            >
              Manga
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
                    alt={`Page ${i + 1}`}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-auto block select-none"
                  />
                  <span className="absolute bottom-2 right-2 bg-black/75 text-[10px] px-2 py-0.5 rounded text-neutral-300">
                    {i + 1} / {currentChapter.panel_urls.length}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full px-4 py-6 flex flex-col items-center">
              <img
                src={currentChapter.panel_urls[currentPage]}
                alt={`Page ${currentPage + 1}`}
                referrerPolicy="no-referrer"
                className="max-h-[75vh] w-auto rounded shadow-lg object-contain cursor-pointer"
                onClick={() => setCurrentPage((p) => Math.min(currentChapter.panel_urls.length - 1, p + 1))}
              />
              <div className="flex items-center gap-4 mt-6">
                <button
                  disabled={currentPage === 0}
                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                  className="px-4 py-2 bg-neutral-800 disabled:opacity-30 rounded text-sm"
                >
                  Prev
                </button>
                <span className="text-xs text-neutral-400">
                  {currentPage + 1} of {currentChapter.panel_urls.length}
                </span>
                <button
                  disabled={currentPage === currentChapter.panel_urls.length - 1}
                  onClick={() => setCurrentPage((p) => Math.min(currentChapter.panel_urls.length - 1, p + 1))}
                  className="px-4 py-2 bg-indigo-600 disabled:opacity-30 rounded text-sm font-medium"
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
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded text-xs"
            >
              ← Previous Ch.
            </button>
            <span className="text-xs text-neutral-500">
              {activeChapterIndex + 1} / {selectedSeries.chapters.length}
            </span>
            <button
              disabled={activeChapterIndex === selectedSeries.chapters.length - 1}
              onClick={() => {
                setActiveChapterIndex((idx) => Math.min(selectedSeries.chapters.length - 1, idx + 1));
                setCurrentPage(0);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded text-xs"
            >
              Next Ch. →
            </button>
          </div>
        </main>
      </div>
    );
  }

  // MAIN HOMEPAGE CATALOG
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-6 max-w-4xl mx-auto">
      <header className="flex items-center justify-between pb-6 border-b border-neutral-800 mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
            <span className="text-indigo-500">Manga</span>Flow
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Automated Cloud Reader</p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded-full text-indigo-400">
          {library.length} Series Synced
        </span>
      </header>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400 mb-4">Popular & Trending</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {library.map((item) => (
            <div
              key={item.id}
              onClick={() => openReader(item, 0)}
              className="group cursor-pointer bg-neutral-900 border border-neutral-800 hover:border-indigo-500/50 rounded-xl overflow-hidden transition flex flex-col"
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-neutral-800 relative">
                <img
                  src={item.cover_image_url}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute bottom-2 left-2 bg-black/80 backdrop-blur text-[10px] uppercase font-bold text-indigo-300 px-2 py-0.5 rounded">
                  {item.reading_mode}
                </span>
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-indigo-400 transition">
                    {item.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                    {item.synopsis}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>{item.chapters?.length || 0} Ch.</span>
                  <span className="text-indigo-400 font-medium group-hover:underline">Read →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
