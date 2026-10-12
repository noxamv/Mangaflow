import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function SeriesDetailPage({ params }: PageProps) {
  const { slug } = await params;

  // 1. Fetch Series info
  const { data: series, error: sErr } = await supabase
    .from('series')
    .select('*')
    .eq('slug', slug)
    .single();

  if (sErr || !series) {
    notFound();
  }

  // 2. Fetch Chapters for this series
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, chapter_number, title, created_at')
    .eq('series_id', series.id)
    .order('chapter_number', { ascending: false });

  const chapterList = chapters || [];

  return (
    <main className="min-h-screen bg-[#0a0a0c] text-neutral-100 font-sans pb-24 selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-40 bg-[#0a0a0c]/80 backdrop-blur-md border-b border-neutral-800/80 px-4 py-3 md:px-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-white transition flex items-center gap-1.5"
          >
            ← Back to Library
          </Link>
          <span className="text-xs px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase font-semibold">
            {series.source || 'MangaDex'}
          </span>
        </div>
      </nav>

      <section className="max-w-6xl mx-auto px-4 md:px-8 mt-6">
        {/* Series Header Card */}
        <div className="flex flex-col md:flex-row gap-6 bg-neutral-900/50 border border-neutral-800/80 rounded-2xl p-5 md:p-6 backdrop-blur">
          <div className="w-36 md:w-52 flex-shrink-0 aspect-[3/4] rounded-xl overflow-hidden bg-neutral-950 border border-neutral-800">
            {series.cover_image_url ? (
              <img
                src={series.cover_image_url}
                alt={series.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
                No Cover
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between flex-1">
            <div>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-white/5">
                  {series.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {chapterList.length} Chapters
                </span>
              </div>

              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                {series.title}
              </h1>

              <p className="mt-3 text-sm text-neutral-300 leading-relaxed max-w-3xl">
                {series.synopsis || 'No synopsis available for this title.'}
              </p>
            </div>

            {chapterList.length > 0 && (
              <div className="mt-6 pt-4 border-t border-neutral-800/80 flex items-center gap-3">
                <Link
                  href={`/series/${series.slug}/read/${chapterList[chapterList.length - 1].chapter_number}`}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs tracking-wide transition shadow-lg shadow-indigo-600/20"
                >
                  Start Chapter {chapterList[chapterList.length - 1].chapter_number}
                </Link>
                <Link
                  href={`/series/${series.slug}/read/${chapterList[0].chapter_number}`}
                  className="px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium text-xs tracking-wide transition"
                >
                  Latest (Ch. {chapterList[0].chapter_number})
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Chapters Section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Chapter List
            </h2>
            <span className="text-xs text-neutral-500">
              {chapterList.length} available
            </span>
          </div>

          {chapterList.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center text-sm text-neutral-400">
              No chapters synced yet for this series.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {chapterList.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/series/${series.slug}/read/${ch.chapter_number}`}
                  className="group flex items-center justify-between p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800 hover:border-indigo-500/40 hover:bg-neutral-800/40 transition"
                >
                  <div>
                    <p className="text-sm font-semibold text-neutral-200 group-hover:text-indigo-400 transition-colors">
                      Chapter {ch.chapter_number}
                    </p>
                    {ch.title && (
                      <p className="text-xs text-neutral-500 truncate max-w-[200px]">
                        {ch.title}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500 group-hover:text-indigo-400 group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
