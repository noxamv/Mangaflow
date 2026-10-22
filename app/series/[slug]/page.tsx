'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';
import ShareBar from '../../../components/ShareBar';

interface Chapter {
  id: string;
  chapter_number: number;
  title: string | null;
  created_at?: string;
}

interface Series {
  id: string;
  title: string;
  english_title?: string | null;
  native_title?: string | null;
  synonyms?: any;
  slug: string;
  cover_image_url?: string;
  synopsis?: string;
  status?: string;
  reading_mode?: string;
  author?: string;
  rating?: number;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const rawSlug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const [aliasesExpanded, setAliasesExpanded] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!rawSlug) return;
      setLoading(true);

      const { data: sData } = await supabase
        .from('series')
        .select('*')
        .eq('slug', decodeURIComponent(rawSlug))
        .single();

      if (!sData) {
        setLoading(false);
        return;
      }
      setSeries(sData);

      const { data: cData } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, created_at')
        .eq('series_id', sData.id)
        .order('chapter_number', { ascending: false });

      if (cData) setChapters(cData);

      const { data: auth } = await supabase.auth.getUser();
      if (auth?.user) {
        const { data: follow } = await supabase
          .from('user_follows')
          .select('id')
          .eq('user_id', auth.user.id)
          .eq('series_id', sData.id)
          .single();
        setIsFollowing(!!follow);
      }
      setLoading(false);
    }
    loadData();
  }, [rawSlug]);

  const toggleFollow = async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setAuthOpen(true);
      return;
    }
    if (!series) return;

    if (isFollowing) {
      await supabase.from('user_follows').delete().eq('user_id', auth.user.id).eq('series_id', series.id);
      setIsFollowing(false);
    } else {
      await supabase.from('user_follows').insert({ user_id: auth.user.id, series_id: series.id });
      setIsFollowing(true);
    }
  };

  const aliasList = useMemo(() => {
    if (!series) return [];
    const list: string[] = [];
    if (series.native_title) list.push(series.native_title);
    if (Array.isArray(series.synonyms)) list.push(...series.synonyms);
    else if (typeof series.synonyms === 'string') {
      try {
        const parsed = JSON.parse(series.synonyms);
        if (Array.isArray(parsed)) list.push(...parsed);
        else list.push(series.synonyms);
      } catch {
        list.push(...series.synonyms.split(/[,;\n]/));
      }
    }
    return Array.from(new Set(list.map((s) => s.trim()).filter((s) => s.length > 0)));
  }, [series]);

  const displayedChapters = useMemo(() => {
    let list = [...chapters];
    if (chapterSearch.trim()) {
      const q = chapterSearch.trim().toLowerCase();
      list = list.filter((c) => String(c.chapter_number).includes(q) || c.title?.toLowerCase().includes(q));
    }
    return sortDesc ? list : list.reverse();
  }, [chapters, chapterSearch, sortDesc]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090a0d] flex items-center justify-center text-neutral-500">
        <div className="w-8 h-8 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-[#090a0d] flex flex-col items-center justify-center text-neutral-400">
        <p className="text-sm">Series not found.</p>
        <Link href="/" className="mt-3 text-xs text-amber-400 hover:underline">Back to library</Link>
      </div>
    );
  }

  const latestChapter = chapters[0];
  const firstChapter = chapters[chapters.length - 1];

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8 min-h-screen text-neutral-200">
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
        <div className="w-36 sm:w-48 aspect-[3/4.2] rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 shrink-0 shadow-xl">
          <img
            src={series.cover_image_url || '/placeholder.png'}
            alt={series.title}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
              {series.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-neutral-800 text-amber-400 border border-neutral-700">
              {series.status || 'Ongoing'}
            </span>
            <span className="text-[10px] text-neutral-500">
              {chapters.length} Chapters Indexed[span_14](start_span)[span_14](end_span)
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {series.english_title || series.title}
          </h1>

          {/* Collapsible Alternative Titles Accordion */}
          {aliasList.length > 0 && (
            <div className="text-xs text-neutral-400 bg-neutral-900/60 border border-neutral-800 rounded-lg p-2.5">
              <button
                type="button"
                onClick={() => setAliasesExpanded(!aliasesExpanded)}
                className="w-full flex items-center justify-between font-semibold text-neutral-300 text-left"
              >
                <span>Also Known As ({aliasList.length})[span_15](start_span)[span_15](end_span)</span>
                <span className="text-[10px] text-neutral-500">{aliasesExpanded ? '▲ Hide' : '▼ View'}</span>
              </button>
              {aliasesExpanded && (
                <div className="mt-2 pt-2 border-t border-neutral-800 space-y-1 text-[11px] text-neutral-400">
                  {aliasList.map((al, idx) => (
                    <p key={idx} className="truncate">• {al}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-4">
            {series.synopsis || 'No synopsis provided.'}
          </p>

          <div className="flex flex-wrap gap-2.5 pt-2">
            {firstChapter && (
              <Link
                href={`/read/${firstChapter.id}`}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg transition"
              >
                Start Reading (Ch. {firstChapter.chapter_number})[span_16](start_span)[span_16](end_span)
              </Link>
            )}
            {latestChapter && (
              <Link
                href={`/read/${latestChapter.id}`}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-400 font-semibold text-xs rounded-lg transition"
              >
                Latest (Ch. {latestChapter.chapter_number})[span_17](start_span)[span_17](end_span)
              </Link>
            )}
            <button
              onClick={toggleFollow}
              className={`px-4 py-2 font-semibold text-xs rounded-lg transition ${
                isFollowing ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' : 'bg-white text-black hover:bg-neutral-200'
              }`}
            >
              {isFollowing ? '✓ In Library' : '+ Follow Series'}[span_18](start_span)[span_18](end_span)
            </button>
          </div>

          <div className="pt-2">
            <ShareBar />
          </div>
        </div>
      </div>

      {/* Chapters Search and Filter Bar */}
      <div className="space-y-4 pt-4 border-t border-neutral-800/80">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <h2 className="text-sm font-bold text-white">
            Chapters List ({displayedChapters.length} shown)[span_19](start_span)[span_19](end_span)
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Find chapter..."
              value={chapterSearch}
              onChange={(e) => setChapterSearch(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-neutral-600 w-36 sm:w-44"
            />
            <button
              onClick={() => setSortDesc(!sortDesc)}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-medium text-neutral-300"
            >
              Sort: {sortDesc ? '9 → 1' : '1 → 9'}[span_20](start_span)[span_20](end_span)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {displayedChapters.map((c) => (
            <Link
              key={c.id}
              href={`/read/${c.id}`}
              className="p-3 bg-[#12141c] hover:bg-neutral-800/50 border border-neutral-800/80 rounded-xl flex items-center justify-between transition group"
            >
              <span className="text-xs font-semibold text-neutral-200 group-hover:text-amber-400 transition">
                Chapter {c.chapter_number}[span_21](start_span)[span_21](end_span)
              </span>
              <span className="text-[11px] text-neutral-500 group-hover:text-neutral-300">
                Read →[span_22](start_span)[span_22](end_span)
              </span>
            </Link>
          ))}
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
