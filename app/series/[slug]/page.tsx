'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import ShareBar from '../../../components/ShareBar';

const FALLBACK_COVER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='400' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%2313151f'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14px' fill='%234f46e5' font-weight='bold'%3EMangaFlow%3C/text%3E%3C/svg%3E";

interface Chapter {
  id: string;
  chapter_number: number;
  title: string | null;
  pages?: string[] | null;
}

interface Series {
  id: string;
  title: string;
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  slug: string;
  cover_image_url?: string;
  cover_url?: string;
  synopsis?: string;
  status?: string;
  author?: string;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const rawSlug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeNum, setResumeNum] = useState<number | null>(null);

  useEffect(() => {
    async function fetchSeriesData() {
      if (!rawSlug) return;
      setLoading(true);

      try {
        const decoded = decodeURIComponent(rawSlug).trim();
        const { data: seriesData } = await supabase
          .from('series')
          .select('*')
          .or(`slug.eq."${decoded}",id.eq."${decoded}"`)
          .maybeSingle();

        if (!seriesData) {
          setLoading(false);
          return;
        }

        setSeries(seriesData);

        // Check local progress for instant continuation
        try {
          const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
          if (local[seriesData.id]) {
            setResumeId(local[seriesData.id].chapterId);
            setResumeNum(local[seriesData.id].chapterNumber);
          }
        } catch {}

        // Fetch populated chapters
        const { data: chapterData } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, pages')
          .eq('series_id', seriesData.id)
          .order('chapter_number', { ascending: false });

        if (chapterData) {
          const valid = chapterData.filter((c) => Array.isArray(c.pages) && c.pages.length > 0);
          setChapters(valid);
        }
      } catch (err) {
        console.error('Series fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchSeriesData();
  }, [rawSlug]);

  if (loading) {
    return <div className="min-h-screen bg-[#07080b] flex items-center justify-center text-xs text-neutral-500">Loading series...</div>;
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-[#07080b] flex flex-col items-center justify-center text-white space-y-3">
        <h1 className="text-xl font-bold">Series Not Found</h1>
        <Link href="/" className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold">Return Home</Link>
      </div>
    );
  }

  const primaryTitle = series.english_title || series.title;
  const firstChapter = chapters[chapters.length - 1];
  const latestChapter = chapters[0];

  // Parse alternative synonym list
  let synList: string[] = [];
  if (Array.isArray(series.synonyms)) synList = series.synonyms;
  else if (typeof series.synonyms === 'string') {
    try { synList = JSON.parse(series.synonyms); } catch { synList = [series.synonyms]; }
  }

  return (
    <main className="min-h-screen bg-[#07080b] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="relative overflow-hidden rounded-3xl border border-neutral-800/80 bg-[#10121a] p-6 shadow-2xl">
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <div className="mx-auto aspect-[3/4.2] w-48 shrink-0 overflow-hidden rounded-2xl bg-neutral-900 border border-white/10">
              <img
                src={series.cover_image_url || series.cover_url || FALLBACK_COVER}
                alt={primaryTitle}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_COVER; }}
              />
            </div>

            <div className="flex flex-1 flex-col justify-between space-y-4">
              <div>
                <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-400 border border-indigo-500/30">
                  {series.status || 'Ongoing'}
                </span>

                <h1 className="mt-2 text-2xl font-black text-white sm:text-3xl">{primaryTitle}</h1>

                {/* All Alternative & Native Titles Display */}
                <div className="mt-2 space-y-1 text-xs text-neutral-400">
                  {series.title !== primaryTitle && (
                    <p><span className="text-neutral-500 font-semibold">Original:</span> {series.title}</p>
                  )}
                  {series.native_title && (
                    <p><span className="text-neutral-500 font-semibold">Native:</span> {series.native_title}</p>
                  )}
                  {synList.length > 0 && (
                    <p className="line-clamp-2">
                      <span className="text-neutral-500 font-semibold">Also Known As:</span> {synList.slice(0, 4).join(', ')}
                    </p>
                  )}
                </div>

                <p className="mt-4 text-xs text-neutral-300 sm:text-sm line-clamp-4">
                  {series.synopsis || 'Read online for free on MangaFlow.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-neutral-800">
                {resumeId ? (
                  <Link href={`/read/${resumeId}`} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-black shadow-lg">
                    ▶ Continue Reading (Ch. {resumeNum})
                  </Link>
                ) : firstChapter ? (
                  <Link href={`/read/${firstChapter.id}`} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-black shadow-lg">
                    Start Reading (Ch. {firstChapter.chapter_number})
                  </Link>
                ) : null}

                {latestChapter && (
                  <Link href={`/read/${latestChapter.id}`} className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-xs font-bold text-neutral-200">
                    Latest (Ch. {latestChapter.chapter_number})
                  </Link>
                )}
                <ShareBar />
              </div>
            </div>
          </div>
        </div>

        {/* Chapter List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <h2 className="text-base font-black text-white sm:text-lg">Chapters</h2>
            <span className="text-xs text-neutral-500">{chapters.length} Available</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[600px] overflow-y-auto">
            {chapters.map((ch) => (
              <Link
                key={ch.id}
                href={`/read/${ch.id}`}
                className="flex items-center justify-between p-3.5 rounded-xl border border-neutral-800/80 bg-[#10121a] hover:border-indigo-500/40"
              >
                <span className="truncate text-xs font-semibold text-neutral-200">Chapter {ch.chapter_number}</span>
                <span className="text-xs text-indigo-400 font-bold">Read →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
