import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface PageProps {
  params: Promise<{ slug: string; chapter: string }>;
}

async function fetchLivePanels(chapterId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`, {
      cache: 'no-store'
    });
    if (!res.ok) return [];

    const data = await res.json();
    const baseUrl = data.baseUrl;
    const hash = data.chapter.hash;
    // dataSaver uses WebP/compressed formats that load smoothly on mobile without rate-limit drops
    const files = data.chapter.dataSaver || data.chapter.data || [];
    const folder = data.chapter.dataSaver ? 'data-saver' : 'data';

    return files.map((file: string) => `${baseUrl}/${folder}/${hash}/${file}`);
  } catch {
    return [];
  }
}

export default async function ChapterReaderPage({ params }: PageProps) {
  const { slug, chapter } = await params;
  const chapterNum = parseFloat(chapter);

  if (isNaN(chapterNum)) notFound();

  // 1. Fetch Series info
  const { data: series } = await supabase
    .from('series')
    .select('id, title, slug')
    .eq('slug', slug)
    .single();

  if (!series) notFound();

  // 2. Fetch Chapter metadata
  const { data: currentChapter } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, source, panel_urls')
    .eq('series_id', series.id)
    .eq('chapter_number', chapterNum)
    .single();

  if (!currentChapter) notFound();

  // 3. Navigation controls
  const { data: allChapters } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('series_id', series.id)
    .order('chapter_number', { ascending: true });

  const chapters = allChapters || [];
  const currentIndex = chapters.findIndex((c) => c.chapter_number === chapterNum);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1].chapter_number : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].chapter_number : null;

  // 4. Resolve panels
  let panels: string[] = currentChapter.panel_urls || [];
  if (panels.length === 0 && currentChapter.source) {
    panels = await fetchLivePanels(currentChapter.source);
  }

  return (
    <main className="min-h-screen bg-[#070709] text-neutral-100 flex flex-col items-center">
      {/* Floating Reader Header Bar */}
      <header className="sticky top-0 z-50 w-full bg-[#0a0a0c]/90 backdrop-blur-md border-b border-neutral-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/series/${series.slug}`}
            className="text-xs font-semibold text-neutral-400 hover:text-white transition flex items-center gap-1"
          >
            ← {series.title}
          </Link>
          <span className="text-neutral-600 text-xs">•</span>
          <span className="text-xs font-bold text-indigo-400">
            Ch. {chapterNum}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {prevChapter !== null ? (
            <Link
              href={`/series/${series.slug}/read/${prevChapter}`}
              className="px-3 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            >
              Prev
            </Link>
          ) : (
            <span className="px-3 py-1 text-xs rounded-lg bg-neutral-900 text-neutral-600 cursor-not-allowed">
              Prev
            </span>
          )}

          {nextChapter !== null ? (
            <Link
              href={`/series/${series.slug}/read/${nextChapter}`}
              className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            >
              Next
            </Link>
          ) : (
            <span className="px-3 py-1 text-xs rounded-lg bg-neutral-900 text-neutral-600 cursor-not-allowed">
              Next
            </span>
          )}
        </div>
      </header>

      {/* Reader Container (Vertical Webtoon Scroll) */}
      <section className="w-full max-w-2xl flex flex-col items-center py-2 px-0 bg-black">
        {panels.length === 0 ? (
          <div className="p-16 text-center text-sm text-neutral-400 bg-neutral-900/40 rounded-xl mt-8 border border-neutral-800">
            <p>Panels are resolving from the source network.</p>
            <p className="text-xs text-neutral-500 mt-2">Please refresh in a moment.</p>
          </div>
        ) : (
          panels.map((url, idx) => (
            <div key={idx} className="w-full bg-black flex justify-center min-h-[200px]">
              <img
                src={url}
                alt={`Panel ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading="lazy"
                decoding="async"
                className="w-full h-auto block select-none pointer-events-none"
              />
            </div>
          ))
        )}
      </section>

      {/* Bottom Controls */}
      <footer className="w-full max-w-2xl py-10 px-4 flex items-center justify-between border-t border-neutral-800/80 my-8">
        <div>
          <Link
            href={`/series/${series.slug}`}
            className="text-xs text-neutral-400 hover:text-white transition"
          >
            ← Back to Series Details
          </Link>
        </div>
        <div className="flex gap-2">
          {prevChapter !== null && (
            <Link
              href={`/series/${series.slug}/read/${prevChapter}`}
              className="px-4 py-2 text-xs rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            >
              Previous Chapter
            </Link>
          )}
          {nextChapter !== null && (
            <Link
              href={`/series/${series.slug}/read/${nextChapter}`}
              className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            >
              Next Chapter →
            </Link>
          )}
        </div>
      </footer>
    </main>
  );
}
