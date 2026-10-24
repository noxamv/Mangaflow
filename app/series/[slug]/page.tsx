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
  slug: string;
  synopsis: string | null;
  cover_image_url: string | null;
  cover_url?: string | null;
  reading_mode: string | null;
  status: string | null;
  updated_at: string | null;
}

interface CommentItem {
  id: string;
  series_id: string;
  user_id: string;
  user_name: string;
  user_avatar?: string | null;
  content: string;
  created_at: string;
}

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Comments State
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [visibleCommentCount, setVisibleCommentCount] = useState(7);

  useEffect(() => {
    async function loadSeries() {
      if (!slug) return;
      setLoading(true);

      const { data: sData } = await supabase
        .from('series')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

      if (!sData) {
        setLoading(false);
        return;
      }

      setSeries(sData);

      const [{ data: cData }, { data: authData }, { data: commentsData }] = await Promise.all([
        supabase
          .from('chapters')
          .select('id, chapter_number, title, created_at')
          .eq('series_id', sData.id)
          .order('chapter_number', { ascending: false }),
        supabase.auth.getUser(),
        supabase
          .from('comments')
          .select('*')
          .eq('series_id', sData.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      setChapters(cData || []);
      setComments(commentsData || []);

      if (authData?.user) {
        setUser(authData.user);
        const { data: follow } = await supabase
          .from('reading_history')
          .select('id')
          .eq('user_id', authData.user.id)
          .eq('series_id', sData.id)
          .maybeSingle();

        setIsFollowing(!!follow);
      }

      setLoading(false);
    }

    loadSeries();
  }, [slug]);

  const toggleFollow = async () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!series) return;

    if (isFollowing) {
      await supabase
        .from('reading_history')
        .delete()
        .eq('user_id', user.id)
        .eq('series_id', series.id);
      setIsFollowing(false);
    } else {
      await supabase.from('reading_history').insert({
        user_id: user.id,
        series_id: series.id,
        folder: 'reading',
        updated_at: new Date().toISOString(),
      });
      setIsFollowing(true);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!series) return;

    setSubmittingComment(true);
    const fallbackName = user.email ? user.email.split('@')[0] : 'Reader';

    const newComment = {
      series_id: series.id,
      user_id: user.id,
      user_name: user.user_metadata?.full_name || fallbackName,
      user_avatar: user.user_metadata?.avatar_url || null,
      content: commentText.trim(),
    };

    const { data, error } = await supabase
      .from('comments')
      .insert(newComment)
      .select()
      .single();

    if (!error && data) {
      setComments((prev) => [data, ...prev]);
      setCommentText('');
    }
    setSubmittingComment(false);
  };

  const filteredChapters = useMemo(() => {
    let list = [...chapters];
    if (searchChapter.trim()) {
      const q = searchChapter.trim();
      list = list.filter(
        (c) =>
          c.chapter_number.toString().includes(q) ||
          (c.title && c.title.toLowerCase().includes(q.toLowerCase()))
      );
    }
    list.sort((a, b) =>
      sortAsc ? a.chapter_number - b.chapter_number : b.chapter_number - a.chapter_number
    );
    return list;
  }, [chapters, searchChapter, sortAsc]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-xs text-neutral-500">
        Loading series overview...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-neutral-400 space-y-3">
        <p className="text-sm">Series not found.</p>
        <Link href="/" className="text-xs text-indigo-400 hover:underline">
          ← Return to Home
        </Link>
      </div>
    );
  }

  const coverUrl = series.cover_image_url || series.cover_url || '';
  const firstChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;
  const latestChapter = chapters.length > 0 ? chapters[0] : null;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 space-y-8 w-full max-w-full overflow-x-hidden min-w-0">
      {/* SERIES INFO HERO */}
      <div className="flex flex-col sm:flex-row gap-6 items-start">
        <div className="w-36 sm:w-48 aspect-[3/4.2] rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl shrink-0 mx-auto sm:mx-0">
          {coverUrl ? (
            <img src={coverUrl} alt={series.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600">📖</div>
          )}
        </div>

        <div className="flex-1 space-y-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 border border-indigo-500/30">
              {series.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {series.status || 'Ongoing'}
            </span>
            <span className="text-[9px] font-bold text-neutral-500">
              {chapters.length} Chapters Indexed
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {series.english_title || series.title}
          </h1>

          {series.native_title && (
            <p className="text-xs text-neutral-500">Also Known As: {series.native_title}</p>
          )}

          <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
            {series.synopsis || 'Read online for free in high definition on MangaFlow.'}
          </p>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
            {firstChapter && (
              <Link
                href={`/read/${firstChapter.id}`}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                Start Reading (Ch. {firstChapter.chapter_number})
              </Link>
            )}
            {latestChapter && (
              <Link
                href={`/read/${latestChapter.id}`}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 font-bold text-xs rounded-xl transition"
              >
                Latest (Ch. {latestChapter.chapter_number})
              </Link>
            )}
            <button
              onClick={toggleFollow}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                isFollowing
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300'
              }`}
            >
              <span>{isFollowing ? '✓' : '+'}</span>
              <span>{isFollowing ? 'Following' : 'Follow Series'}</span>
            </button>
          </div>
        </div>
      </div>

      <ShareBar />

      {/* CHAPTER LIST SECTION */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white">Chapters List</h2>
            <span className="text-xs text-neutral-500">({filteredChapters.length})</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="text"
              placeholder="Find chapter..."
              value={searchChapter}
              onChange={(e) => setSearchChapter(e.target.value)}
              className="px-3 py-1.5 bg-[#13151f] border border-neutral-800 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 flex-1 sm:w-44"
            />
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="px-3 py-1.5 bg-[#13151f] hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs text-neutral-300 transition whitespace-nowrap"
            >
              Sort: {sortAsc ? '1 → 9' : '9 → 1'}
            </button>
          </div>
        </div>

        {filteredChapters.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-500">
            No chapters found matching filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[480px] overflow-y-auto pr-1">
            {filteredChapters.map((c) => (
              <Link
                key={c.id}
                href={`/read/${c.id}`}
                className="p-3 bg-[#13151f] hover:bg-neutral-800/80 border border-neutral-800/70 rounded-xl transition flex items-center justify-between group"
              >
                <span className="text-xs font-semibold text-neutral-200 group-hover:text-indigo-400 transition truncate">
                  Chapter {c.chapter_number}
                  {c.title && c.title !== `Chapter ${c.chapter_number}` ? ` - ${c.title}` : ''}
                </span>
                <span className="text-[10px] text-neutral-500 group-hover:text-neutral-300 shrink-0">
                  Read →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* COMMUNITY DISCUSSION / 7-COMMENT SECTION */}
      <div className="space-y-4 pt-4 border-t border-neutral-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">💬</span>
            <h2 className="text-base font-bold text-white">Community Discussion</h2>
            <span className="text-xs text-neutral-500">({comments.length})</span>
          </div>
        </div>

        {/* Comment Input */}
        <form onSubmit={handlePostComment} className="space-y-2">
          {user ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Leave a thought or discuss this series (max 500 characters)..."
                value={commentText}
                maxLength={500}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#13151f] border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={submittingComment || !commentText.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
              >
                {submittingComment ? 'Posting...' : 'Post'}
              </button>
            </div>
          ) : (
            <div
              onClick={() => setAuthOpen(true)}
              className="p-3 bg-[#13151f] border border-neutral-800 rounded-xl text-xs text-neutral-400 cursor-pointer hover:border-neutral-700 transition flex items-center justify-between"
            >
              <span>Sign in with email to join the discussion...</span>
              <span className="text-indigo-400 font-bold">Sign In →</span>
            </div>
          )}
        </form>

        {/* Render Up to 7 Comments */}
        <div className="space-y-2.5">
          {comments.length === 0 ? (
            <div className="py-6 text-center text-xs text-neutral-500 bg-[#0e1015] rounded-xl border border-neutral-900">
              No comments yet. Be the first to share your thoughts on this series!
            </div>
          ) : (
            comments.slice(0, visibleCommentCount).map((c) => (
              <div
                key={c.id}
                className="p-3 bg-[#13151f] border border-neutral-800/80 rounded-xl flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs shrink-0 uppercase">
                  {c.user_name ? c.user_name.charAt(0) : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{c.user_name}</span>
                    <span className="text-[10px] text-neutral-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 mt-1 leading-relaxed break-words">
                    {c.content}
                  </p>
                </div>
              </div>
            ))
          )}

          {comments.length > visibleCommentCount && (
            <div className="text-center pt-2">
              <button
                onClick={() => setVisibleCommentCount((prev) => prev + 7)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-bold bg-[#13151f] border border-neutral-800 px-4 py-2 rounded-xl transition"
              >
                Load more comments ({comments.length - visibleCommentCount} remaining) ↓
              </button>
            </div>
          )}
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
