import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface PageProps {
  params: Promise<{ slug: string; chapter: string }>;
}

export default async function ChapterReaderPage({ params }: PageProps) {
  const { slug, chapter } = await params;
  const chapterNum = parseFloat(chapter);

  // 1. Fetch Series info
  const { data: series, error: sErr } = await supabase
    .from('series')
    .select('id, title, slug, reading_mode')
    .eq('slug', slug)
    .single();

  if (sErr || !series) notFound();

  // 2. Fetch the target Chapter
  const { data: currentChapter, error: cErr } = await supabase
    .from('chapters')
    .select('*')
    .eq('series_id', series.id)
    .eq('chapter_number', chapterNum)
    .single();

  if (cErr || !currentChapter) notFound();

  // 3. Fetch list of all chapters for prev/next navigation
  const { data: allChapters } = await supabase
    .from('chapters')
    .select('chapter_number')
    .eq('series_id', series.id)
    .order('chapter_number', { ascending: true });

  const chapters = allChapters || [];
  const currentIndex = chapters.findIndex((c) => c.chapter_number === chapterNum);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1].chapter_number : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].chapter_number : null;

  const panels: string[] = currentChapter.panel_urls || [];

  return (
    <main className="min-h-screen bg-[#070709] text-neutral-100 flex flex-col items-center">
      {/* Top Floating Reader Bar */}
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

        {/* Prev / Next controls */}
        <div className="flex items-center gap-2">
          {prevChapter !== null ? (
            <Link
              href={`/series/${series.slug}/read/${prevChapter}`}
              className="px-2.5 py-1 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition"
            >
              Prev
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-xs rounded-lg bg-neutral-900 text-neutral-600 cursor-not-allowed">
              Prev
            </span>
          )}

          {nextChapter !== null ? (
            <Link
              href={`/series/${series.slug}/read/${nextChapter}`}
              className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition"
            >
              Next
            </Link>
          ) : (
            <span className="px-2.5 py-1 text-xs rounded-lg bg-neutral-900 text-neutral-600 cursor-not-allowed">
              Next
            </span>
          )}
        </div>
      </header>

      {/* Reader Container (Vertical Webtoon Scroll) */}
      <section className="w-full max-w-3xl flex flex-col items-center py-4 px-0 sm:px-2">
        {panels.length === 0 ? (
          <div className="p-12 text-center text-sm text-neutral-400">
            No image panels found for this chapter.
          </div>
        ) : (
          panels.map((url, idx) => (
            <div key={idx} className="w-full flex justify-center bg-black">
              <img
                src={url}
                alt={`Page ${idx + 1}`}
                referrerPolicy="no-referrer"
                loading={idx < 3 ? 'eager' : 'lazy'}
                className="w-full h-auto block select-none pointer-events-none"
              />
            </div>
          ))
        )}
      </section>

      {/* Bottom Navigation */}
      <footer className="w-full max-w-3xl py-10 px-4 flex items-center justify-between border-t border-neutral-800/80 my-8">
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
