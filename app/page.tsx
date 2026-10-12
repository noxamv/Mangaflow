'use client';

import { useState } from 'react';

// Demo sample manhwa chapters with real visual strips
const SAMPLE_CHAPTERS = [
  {
    id: 1,
    title: 'The Great Awakening',
    panels: [
      'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1563089145-599997674d42?w=1000&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=80',
    ],
  },
];

export default function HomePage() {
  const [readingMode, setReadingMode] = useState<'webtoon' | 'manga'>('webtoon');
  const [currentPage, setCurrentPage] = useState(0);
  const activeChapter = SAMPLE_CHAPTERS[0];

  return (
    <div className="min-h-screen flex flex-col items-center bg-neutral-950 text-neutral-100">
      {/* Sticky Reader Bar */}
      <header className="sticky top-0 z-50 w-full max-w-xl bg-neutral-900/90 backdrop-blur border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-base text-indigo-400">Manga Flow</h1>
          <p className="text-xs text-neutral-400">Solo Monarch • Ch. 1</p>
        </div>

        {/* Mode Selector */}
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

      {/* Reader Viewport */}
      <main className="w-full max-w-xl flex flex-col items-center pb-12">
        {readingMode === 'webtoon' ? (
          /* Continuous Scroll Strip */
          <div className="w-full flex flex-col shadow-2xl">
            {activeChapter.panels.map((url, i) => (
              <div key={i} className="relative w-full bg-neutral-900">
                <img
                  src={url}
                  alt={`Panel ${i + 1}`}
                  loading="lazy"
                  className="w-full h-auto block select-none"
                />
                <span className="absolute bottom-2 right-2 bg-black/70 text-[10px] px-2 py-0.5 rounded text-neutral-300">
                  {i + 1} / {activeChapter.panels.length}
                </span>
              </div>
            ))}
          </div>
        ) : (
          /* Paged Flip Mode */
          <div className="w-full px-4 py-8 flex flex-col items-center">
            <img
              src={activeChapter.panels[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-h-[75vh] w-auto rounded shadow-lg object-contain cursor-pointer"
              onClick={() => setCurrentPage((p) => Math.min(activeChapter.panels.length - 1, p + 1))}
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
                {currentPage + 1} of {activeChapter.panels.length}
              </span>
              <button
                disabled={currentPage === activeChapter.panels.length - 1}
                onClick={() => setCurrentPage((p) => Math.min(activeChapter.panels.length - 1, p + 1))}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded text-sm text-white font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
