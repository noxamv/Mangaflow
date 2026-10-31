// app/series/[slug]/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';
import ShareBar from '../../../components/ShareBar';
import { getLocalProgress } from '../../../lib/useReadingHistory';

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
  updated_at?: string;
}

interface Comment {
  id: string;
  user_id: string;
  user_email?: string;
  comment: string;
  created_at: string;
}

const FOLDERS = [
  { id: 'reading', label: 'Reading' },
  { id: 'plan_to_read', label: 'Plan to Read' },
  { id: 'completed', label: 'Completed' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'dropped', label: 'Dropped' },
];

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  // Library / Follow State
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);

  // Chapter Search & Sort
  const [chapterSearch, setChapterSearch] = useState('');
  const [sortDesc, setSortDesc] = useState(true);

  // Community Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Reading History (Highest Read Chapter Number)
  const [lastReadChapterNum, setLastReadChapterNum] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadSeriesData() {
      if (!slug) return;
      setLoading(true);

      const { data: sData } = await supabase
        .from('series')
        .select('*')
        .eq('slug', slug)
        .single();

      if (!sData) {
        setLoading(false);
        return;
      }

      setSeries(sData);

      // Check client-side localStorage history first
      const localHist = getLocalProgress(sData.id);
      if (localHist?.chapterNumber) {
        setLastReadChapterNum(localHist.chapterNumber);
      }

      // Check database reading history if user is authenticated
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user) {
        const { data: hist } = await supabase
          .from('reading_history')
          .select('chapter_number')
          .eq('user_id', authUser.user.id)
          .eq('series_id', sData.id)
          .maybeSingle();

        if (hist?.chapter_number) {
          setLastReadChapterNum((prev) => Math.max(prev || 0, hist.chapter_number));
        }

        const { data: follow } = await supabase
          .from('user_follows')
          .select('folder')
          .eq('user_id', authUser.user.id)
          .eq('series_id', sData.id)
          .maybeSingle();

        if (follow) setCurrentFolder(follow.folder);
      }

      // Load Chapters
      const { data: cData } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, created_at')
        .eq('series_id', sData.id)
        .order('chapter_number', { ascending: false });

      if (cData) setChapters(cData);

      // Load Comments
      const { data: comData } = await supabase
        .from('series_comments')
        .select('id, user_id, user_email, comment, created_at')
        .eq('series_id', sData.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (comData) setComments(comData);

      setLoading(false);
    }

    loadSeriesData();
  }, [slug]);

  const displayedChapters = useMemo(() => {
    let list = [...chapters];
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.chapter_number.toString().includes(q) ||
          (c.title && c.title.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) =>
      sortDesc ? b.chapter_number - a.chapter_number : a.chapter_number - b.chapter_number
    );
    return list;
  }, [chapters, chapterSearch, sortDesc]);

  const handleFolderChange = async (folderId: string | null) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!series) return;
    setSavingFolder(true);

    try {
      if (folderId === null) {
        await supabase
          .from('user_follows')
          .delete()
          .eq('user_id', user.id)
          .eq('series_id', series.id);
        setCurrentFolder(null);
      } else {
        await supabase.from('user_follows').upsert(
          {
            user_id: user.id,
            series_id: series.id,
            folder: folderId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,series_id' }
        );
        setCurrentFolder(folderId);
      }
    } finally {
      setSavingFolder(false);
      setFolderMenuOpen(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!series || !commentText.trim()) return;

    setPostingComment(true);
    try {
      const newComment = {
        series_id: series.id,
        user_id: user.id,
        user_email: user.email?.split('@')[0] || 'Reader',
        comment: commentText.trim(),
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('series_comments')
        .insert([newComment])
        .select()
        .single();

      if (!error && data) {
        setComments((prev) => [data, ...prev]);
        setCommentText('');
      }
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0e15] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-screen bg-[#0d0e15] text-white flex flex-col items-center justify-center p-4">
        <h1 className="text-xl font-bold mb-2">Series Not Found</h1>
        <p className="text-neutral-400 text-sm mb-4">This series may have been renamed or moved.</p>
        <Link href="/" className="px-4 py-2 bg-indigo-600 rounded-xl text-sm font-semibold">
          Return Home
        </Link>
      </div>
    );
  }

  const firstChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;
  const continueChapter = chapters.find((c) =>
    lastReadChapterNum ? c.chapter_number >= lastReadChapterNum : false
  ) || firstChapter;

  return (
    <div className="min-h-screen bg-[#0d0e15] text-white pb-24">
      {/* Background Hero Accent */}
      <div className="relative w-full h-72 sm:h-96 overflow-hidden bg-neutral-900 border-b border-neutral-800">
        {series.cover_image_url && (
          <img
            src={series.cover_image_url}
            alt={series.title}
            className="w-full h-full object-cover blur-2xl opacity-20 scale-110"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0e15] via-[#0d0e15]/70 to-transparent" />
      </div>

      {/* Main Series Container */}
      <div className="max-w-5xl mx-auto px-4 -mt-40 sm:-mt-56 relative z-10 space-y-8">
        {/* Header Grid: Poster + Metadata */}
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {/* Poster */}
          <div className="w-36 sm:w-48 aspect-[3/4.2] rounded-2xl overflow-hidden shadow-2xl border border-neutral-700/80 bg-neutral-900 shrink-0">
            {series.cover_image_url ? (
              <img
                src={series.cover_image_url}
                alt={series.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500">
                No Cover
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {series.reading_mode && (
                <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  {series.reading_mode === 'webtoon' ? 'MANHWA' : 'MANGA'}
                </span>
              )}
              {series.status && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                  {series.status}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              {series.title}
            </h1>
            {series.english_title && series.english_title !== series.title && (
              <p className="text-neutral-400 text-xs sm:text-sm">{series.english_title}</p>
            )}

            {/* Reading Action Row */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {continueChapter && (
                <Link
                  href={`/read/${continueChapter.id}`}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center gap-2"
                >
                  <span>▶</span>
                  {lastReadChapterNum ? `Resume Ch. ${lastReadChapterNum}` : 'Start Reading'}
                </Link>
              )}

              {/* Bookmark Folder Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setFolderMenuOpen(!folderMenuOpen)}
                  disabled={savingFolder}
                  className="px-4 py-2.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-700/80 rounded-xl text-xs sm:text-sm font-semibold text-neutral-200 transition flex items-center gap-2"
                >
                  <span>🔖</span>
                  {currentFolder
                    ? FOLDERS.find((f) => f.id === currentFolder)?.label || 'Bookmarked'
                    : 'Add to Library'}
                  <span className="text-[10px] text-neutral-400">▼</span>
                </button>

                {folderMenuOpen && (
                  <div className="absolute left-0 mt-2 w-44 bg-[#181a24] border border-neutral-800 rounded-xl shadow-2xl p-1 z-30 space-y-0.5">
                    {FOLDERS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFolderChange(f.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition ${
                          currentFolder === f.id
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                    {currentFolder && (
                      <button
                        onClick={() => handleFolderChange(null)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition border-t border-neutral-800/80"
                      >
                        Remove from Library
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <ShareBar title={series.title} />
          </div>
        </div>

        {/* Synopsis */}
        {series.synopsis && (
          <div className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-5 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Synopsis</h2>
            <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
              {series.synopsis}
            </p>
          </div>
        )}

        {/* Chapter Ladder & Search */}
        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white">Chapters</h2>
              <span className="text-xs text-neutral-500 font-mono">({chapters.length})</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search chapter..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="px-3 py-1.5 bg-[#13151f] border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setSortDesc(!sortDesc)}
                className="px-3 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-medium text-neutral-300 transition"
              >
                Sort: {sortDesc ? '9 → 1' : '1 → 9'}
              </button>
            </div>
          </div>

          {/* Scrollable Chapter Grid with Progress Highlighting */}
          <div className="max-h-[500px] overflow-y-auto pr-1 space-y-2 rounded-2xl border border-neutral-800/80 p-2 bg-[#13151f]/40 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent">
            {displayedChapters.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500">
                No chapters match your search.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {displayedChapters.map((c) => {
                  const isRead = lastReadChapterNum !== null && c.chapter_number <= lastReadChapterNum;
                  const isNextUnread = lastReadChapterNum !== null && c.chapter_number === lastReadChapterNum + 1;

                  return (
                    <Link
                      key={c.id}
                      href={`/read/${c.id}`}
                      className={`p-3 border rounded-xl flex items-center justify-between transition group ${
                        isNextUnread
                          ? 'bg-indigo-600/15 border-indigo-500/60 hover:bg-indigo-600/25'
                          : isRead
                          ? 'bg-[#10121a]/60 border-neutral-800/40 opacity-70 hover:opacity-100 hover:bg-[#13151f]'
                          : 'bg-[#13151f] hover:bg-neutral-800/70 border-neutral-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isRead && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                        <span
                          className={`text-xs font-semibold truncate ${
                            isNextUnread
                              ? 'text-indigo-400 font-bold'
                              : isRead
                              ? 'text-neutral-400'
                              : 'text-neutral-200 group-hover:text-indigo-400'
                          }`}
                        >
                          Chapter {c.chapter_number}
                          {c.title && c.title !== `Chapter ${c.chapter_number}` ? ` - ${c.title}` : ''}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isNextUnread && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-500 text-white">
                            Next
                          </span>
                        )}
                        <span className="text-[11px] text-neutral-500 group-hover:text-neutral-300">
                          {isRead ? 'Re-read' : 'Read →'}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Community Discussion Section */}
        <div className="space-y-4 pt-6 border-t border-neutral-800/80">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <h2 className="text-sm sm:text-base font-bold text-white">Community Discussion</h2>
            <span className="text-xs text-neutral-500">({comments.length})</span>
          </div>

          <form onSubmit={handlePostComment} className="space-y-2">
            {user ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Leave a comment (max 500 characters)..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  maxLength={500}
                  className="flex-1 px-4 py-2.5 bg-[#13151f] border border-neutral-800 rounded-xl text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={postingComment || !commentText.trim()}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
                >
                  {postingComment ? 'Posting...' : 'Post'}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-[#13151f] border border-neutral-800 rounded-xl text-center text-xs text-neutral-400">
                Please{' '}
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="text-indigo-400 underline font-semibold"
                >
                  sign in
                </button>{' '}
                to participate in community discussions.
              </div>
            )}
          </form>

          {/* Comment List */}
          <div className="space-y-2">
            {comments.map((comm) => (
              <div
                key={comm.id}
                className="p-3 bg-[#13151f] border border-neutral-800/60 rounded-xl space-y-1"
              >
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-semibold text-neutral-300">{comm.user_email}</span>
                  <span>{new Date(comm.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-neutral-200">{comm.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
