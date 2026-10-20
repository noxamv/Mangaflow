'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

interface Chapter {
  id: string;
  series_id: string;
  chapter_number: number;
  title: string | null;
  pages: string[] | null;
  series?: {
    id: string;
    title: string;
    english_title?: string | null;
    slug: string;
    cover_image_url?: string | null;
  };
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<{ id: string; chapter_number: number; title: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings: Single, Double, Long Strip (Webtoon)
  const [layoutMode, setLayoutMode] = useState<'long_strip' | 'single' | 'double'>('long_strip');
  const [readingDirection, setReadingDirection] = useState<'rtl' | 'ltr'>('rtl');
  const [pageMargin, setPageMargin] = useState<number>(0);
  const [pageIdx, setPageIdx] = useState(0);

  // Floating Modals
  const [showChaptersDrawer, setShowChaptersDrawer] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerSort, setDrawerSort] = useState<'desc' | 'asc'>('desc');
  const [reportReason, setReportReason] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      if (!chapterId) return;
      setLoading(true);

      try {
        let chData: any = null;
        try {
          const res = await fetch(`/api/chapter/${chapterId}`);
          if (res.ok) chData = await res.json();
        } catch {}

        if (!chData || !chData.pages || chData.pages.length === 0) {
          const { data } = await supabase
            .from('chapters')
            .select('id, series_id, chapter_number, title, pages, series (id, title, english_title, slug, cover_image_url)')
            .eq('id', chapterId)
            .maybeSingle();
          chData = data;
        }

        if (!chData) {
          setLoading(false);
          return;
        }

        const sObj = Array.isArray(chData.series) ? chData.series[0] : chData.series;
        const cur: Chapter = { ...chData, series: sObj };
        setChapter(cur);
        setPageIdx(0);

        const { data: sibs } = await supabase
          .from('chapters')
          .select('id, chapter_number, title')
          .eq('series_id', cur.series_id)
          .order('chapter_number', { ascending: true });

        if (sibs) setAllChapters(sibs);

        // Save local history
        const local = JSON.parse(localStorage.getItem('mangaflow_reading_history') || '{}');
        local[cur.series_id] = {
          seriesId: cur.series_id,
          seriesTitle: sObj?.english_title || sObj?.title || '',
          seriesSlug: sObj?.slug || cur.series_id,
          coverUrl: sObj?.cover_image_url || '',
          chapterId: cur.id,
          chapterNumber: cur.chapter_number,
        };
        localStorage.setItem('mangaflow_reading_history', JSON.stringify(local));

        // Cloud history
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          await supabase.from('reading_history').upsert({
            user_id: auth.user.id,
            series_id: cur.series_id,
            chapter_id: cur.id,
            chapter_number: cur.chapter_number,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,series_id' });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [chapterId]);

  const currentIndex = allChapters.findIndex((c) => c.id === chapter?.id);
  const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

  // Keyboard navigation
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (layoutMode === 'long_strip' || !chapter?.pages) return;
      if (e.key === 'ArrowRight' || e.key === 'd') {
        if (pageIdx < chapter.pages.length - 1) setPageIdx((p) => p + 1);
        else if (nextChapter) router.push(`/read/${nextChapter.id}`);
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (pageIdx > 0) setPageIdx((p) => p - 1);
        else if (prevChapter) router.push(`/read/${prevChapter.id}`);
      }
    },
    [layoutMode, chapter, pageIdx, nextChapter, prevChapter, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center text-xs text-neutral-500">
        Loading chapter panels...
      </div>
    );
  }

  if (!chapter || !chapter.pages || chapter.pages.length === 0) {
    return (
      <div className="min-h-screen bg-[#07080a] flex flex-col items-center justify-center text-white space-y-4 px-4 text-center">
        <p className="text-sm font-semibold">Syncing chapter panels in background.</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold">
          Retry
        </button>
      </div>
    );
  }

  const primaryTitle = chapter.series?.english_title || chapter.series?.title;
  const filteredDrawerChapters = allChapters
    .filter((c) => String(c.chapter_number).includes(drawerSearch.trim()))
    .sort((a, b) => (drawerSort === 'desc' ? b.chapter_number - a.chapter_number : a.chapter_number - b.chapter_number));

  return (
    <div className="min-h-screen bg-[#07080a] text-white flex flex-col relative select-none">
      {/* Top Floating Mini Header */}
      <div className="sticky top-0 z-30 bg-[#0d0e14]/90 backdrop-blur-md border-b border-neutral-800/60 px-4 py-2 flex items-center justify-between text-xs">
        <Link href={`/series/${chapter.series?.slug || chapter.series_id}`} className="font-bold text-neutral-300 hover:text-white truncate max-w-[50%]">
          ← {primaryTitle}
        </Link>
        <span className="font-semibold text-neutral-400">
          Ch. {chapter.chapter_number} {chapter.title ? `(${chapter.title})` : ''}
        </span>
      </div>

      {/* Floating Right Sidebar matching MangaFire */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2 bg-[#13151f]/90 border border-neutral-800/80 p-1.5 rounded-2xl shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setShowChaptersDrawer(true)}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
          title="Chapters List"
        >
          📑
        </button>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition"
          title="Reader Settings"
        >
          ⚙️
        </button>
        <button
          onClick={() => setShowHelpModal(true)}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-xl transition hidden sm:block"
          title="Keyboard Shortcuts"
        >
          ❓
        </button>
        <button
          onClick={() => setShowReportModal(true)}
          className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl transition"
          title="Report Chapter Issue"
        >
          🚩
        </button>
      </div>

      {/* Reader Canvas */}
      <main className="flex-1 flex flex-col items-center w-full" style={{ paddingLeft: `${pageMargin}px`, paddingRight: `${pageMargin}px` }}>
        {layoutMode === 'long_strip' ? (
          <div className="w-full max-w-3xl flex flex-col items-center mx-auto">
            {chapter.pages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                referrerPolicy="no-referrer"
                loading={i < 4 ? 'eager' : 'lazy'}
                className="w-full h-auto block bg-neutral-950"
                onError={(e) => {
                  const t = e.currentTarget;
                  if (!t.src.includes('/api/proxy')) t.src = `/api/proxy?url=${encodeURIComponent(url)}`;
                }}
              />
            ))}
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center flex-1 py-4">
            <img
              src={chapter.pages[pageIdx]}
              alt=""
              referrerPolicy="no-referrer"
              className="max-h-[85vh] w-auto object-contain rounded shadow-2xl"
            />
            <div className="flex items-center gap-4 mt-4 text-xs font-bold text-neutral-400">
              <button disabled={pageIdx === 0} onClick={() => setPageIdx((p) => p - 1)} className="px-3 py-1 bg-neutral-900 rounded-lg disabled:opacity-30">
                ← Prev
              </button>
              <span>{pageIdx + 1} / {chapter.pages.length}</span>
              <button disabled={pageIdx === chapter.pages.length - 1} onClick={() => setPageIdx((p) => p + 1)} className="px-3 py-1 bg-neutral-900 rounded-lg disabled:opacity-30">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* End of Chapter Section matching 1000245704.jpg */}
        <div className="w-full max-w-2xl mx-auto px-4 py-12 text-center space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white">End of Ch. {chapter.chapter_number}</h3>
            <p className="text-xs text-neutral-500">{chapter.title || 'Official Release'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {prevChapter ? (
              <Link
                href={`/read/${prevChapter.id}`}
                className="p-3.5 bg-[#12141c] hover:bg-neutral-800 border border-neutral-800/80 rounded-2xl flex flex-col items-start transition group text-left"
              >
                <span className="text-[10px] text-neutral-500 uppercase font-black group-hover:text-neutral-400">Previous</span>
                <span className="text-xs font-bold text-white mt-0.5 truncate">Ch. {prevChapter.chapter_number}</span>
              </Link>
            ) : (
              <div className="p-3.5 bg-neutral-900/40 border border-neutral-800/40 rounded-2xl flex flex-col items-start text-left opacity-40">
                <span className="text-[10px] text-neutral-500 uppercase font-black">Previous</span>
                <span className="text-xs font-bold text-neutral-400 mt-0.5">None</span>
              </div>
            )}

            {nextChapter ? (
              <Link
                href={`/read/${nextChapter.id}`}
                className="p-3.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 rounded-2xl flex flex-col items-end transition group text-right"
              >
                <span className="text-[10px] text-indigo-400 uppercase font-black">Next</span>
                <span className="text-xs font-bold text-white mt-0.5 truncate">Ch. {nextChapter.chapter_number}</span>
              </Link>
            ) : (
              <div className="p-3.5 bg-neutral-900/40 border border-neutral-800/40 rounded-2xl flex flex-col items-end text-right opacity-40">
                <span className="text-[10px] text-neutral-500 uppercase font-black">Next</span>
                <span className="text-xs font-bold text-neutral-400 mt-0.5">None</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Link
              href={`/series/${chapter.series?.slug || chapter.series_id}`}
              className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-300 transition"
            >
              📖 Series
            </Link>
            <Link
              href="/"
              className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-bold text-neutral-300 transition"
            >
              🏠 Home
            </Link>
          </div>
        </div>
      </main>

      {/* Modal 1: Table of Contents Drawer */}
      {showChaptersDrawer && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#13151f] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-3">
              <h4 className="text-xs font-black uppercase text-white">Chapters</h4>
              <button onClick={() => setShowChaptersDrawer(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Find chapter..."
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white outline-none"
              />
              <button
                onClick={() => setDrawerSort(drawerSort === 'desc' ? 'asc' : 'desc')}
                className="px-2.5 py-1 bg-neutral-800 text-xs rounded-lg font-bold"
              >
                {drawerSort === 'desc' ? '9→1' : '1→9'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-neutral-800/50 pr-1">
              {filteredDrawerChapters.map((c) => (
                <Link
                  key={c.id}
                  href={`/read/${c.id}`}
                  onClick={() => setShowChaptersDrawer(false)}
                  className={`p-2.5 flex items-center justify-between rounded-lg text-xs transition ${
                    c.id === chapter.id ? 'bg-indigo-600/20 text-indigo-400 font-bold' : 'text-neutral-300 hover:bg-neutral-800/50'
                  }`}
                >
                  <span>Ch. {c.chapter_number} {c.title ? `- ${c.title}` : ''}</span>
                  {c.id === chapter.id && <span>●</span>}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Reader Settings Modal matching MangaFire */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#13151f] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h4 className="text-xs font-black uppercase text-white">Reader Settings</h4>
              <button onClick={() => setShowSettingsModal(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400 block mb-2">Layout</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'long_strip', label: 'Long Strip' },
                  { id: 'single', label: 'Single' },
                  { id: 'double', label: 'Double' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setLayoutMode(item.id as any)}
                    className={`py-2 rounded-xl text-xs font-bold transition ${
                      layoutMode === item.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-400 block mb-2">Page Margin</label>
              <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2">
                <button onClick={() => setPageMargin((m) => Math.max(0, m - 10))} className="text-base font-bold text-neutral-400 px-2">-</button>
                <span className="text-xs font-bold text-white">{pageMargin}px</span>
                <button onClick={() => setPageMargin((m) => m + 10)} className="text-base font-bold text-neutral-400 px-2">+</button>
              </div>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white shadow-lg transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Keyboard Shortcuts Cheatsheet */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#13151f] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h4 className="text-xs font-black uppercase text-white">Keyboard Shortcuts</h4>
              <button onClick={() => setShowHelpModal(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 text-xs divide-y divide-neutral-800/40">
              <div className="flex justify-between pt-1"><span className="text-neutral-400">Next / Prev Page</span><span className="font-mono font-bold text-white">→ / ← or D / A</span></div>
              <div className="flex justify-between pt-1"><span className="text-neutral-400">Next / Prev Chapter</span><span className="font-mono font-bold text-white">N / B</span></div>
              <div className="flex justify-between pt-1"><span className="text-neutral-400">Scroll Strip</span><span className="font-mono font-bold text-white">W / S or ↑ / ↓</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Report Issue Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#13151f] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h4 className="text-xs font-black uppercase text-white">Report Chapter Issue</h4>
              <button onClick={() => setShowReportModal(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>

            {reportSuccess ? (
              <div className="text-center py-4 space-y-2">
                <div className="text-emerald-400 font-bold text-lg">✓</div>
                <p className="text-xs text-neutral-300">Report logged. Chapter queued for re-scrape.</p>
                <button onClick={() => setShowReportModal(false)} className="px-4 py-1.5 bg-indigo-600 rounded-lg text-xs font-bold mt-2">Close</button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await fetch('/api/report', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chapterId: chapter.id, reason: reportReason }),
                  });
                  setReportSuccess(true);
                }}
                className="space-y-3"
              >
                <p className="text-xs text-neutral-400">What is wrong with Chapter {chapter.chapter_number}?</p>
                <textarea
                  required
                  rows={3}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="e.g. Missing panels, broken images, wrong chapter..."
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500"
                />
                <button type="submit" className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 font-bold text-xs text-white rounded-xl transition">
                  Send Report
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
