'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesDetail {
  id: string;
  title: string;
  slug: string;
  synopsis: string | null;
  cover_image_url: string | null;
  reading_mode: string | null;
  status?: string;
  rating?: number;
  rating_votes?: number;
  followed_count?: number;
  release_year?: number;
  content_rating?: string;
  author?: string;
  artist?: string;
  genres?: string[];
}

interface ChapterItem {
  id: string;
  chapter_number: number;
  title: string | null;
  created_at: string;
}

interface CommentItem {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

function StarRatingCard({ seriesId, userId }: { seriesId: string; userId?: string }) {
  const [selectedStars, setSelectedStars] = useState<number>(10);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId || !seriesId) return;
    supabase
      .from('series_reviews')
      .select('rating')
      .eq('series_id', seriesId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUserRating(data.rating);
          setSelectedStars(data.rating);
        }
      });
  }, [seriesId, userId]);

  const handleRate = async () => {
    if (!userId) {
      alert('Sign in with your Gmail to rate this title.');
      return;
    }
    setSubmitting(true);

    const { error } = await supabase.from('series_reviews').upsert(
      {
        series_id: seriesId,
        user_id: userId,
        rating: selectedStars,
        username: 'Reader',
      },
      { onConflict: 'user_id,series_id' }
    );

    if (!error) {
      setUserRating(selectedStars);
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-[#12141c] border border-neutral-800/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 max-w-xl mx-auto my-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-neutral-300">Your Rating:</span>
        <select
          value={selectedStars}
          onChange={(e) => setSelectedStars(Number(e.target.value))}
          className="bg-neutral-900 border border-neutral-700 text-amber-400 font-bold text-xs rounded-lg px-2 py-1 focus:outline-none"
        >
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((num) => (
            <option key={num} value={num}>
              ★ {num} / 10
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={handleRate}
        className="px-3.5 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-bold text-xs rounded-lg transition"
      >
        {userRating ? `Update (${userRating}★)` : 'Submit Rating'}
      </button>
    </div>
  );
}

export default function SeriesDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchChapter, setSearchChapter] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [lastReadChapter, setLastReadChapter] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function init() {
      if (!slug) return;
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      setUser(authData?.user || null);

      const { data: sData } = await supabase
        .from('series')
        .select('*')
        .eq('slug', slug)
        .single();

      if (sData) {
        setSeries(sData);

        // Fetch Chapters
        const { data: chData } = await supabase
          .from('chapters')
          .select('id, chapter_number, title, created_at')
          .eq('series_id', sData.id)
          .order('chapter_number', { ascending: false });
        setChapters(chData || []);

        // Fetch Comments
        const { data: commData } = await supabase
          .from('series_comments')
          .select('id, user_id, username, content, created_at')
          .eq('series_id', sData.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setComments(commData || []);

        // Reading History & Bookmarks
        if (authData?.user) {
          const { data: bData } = await supabase
            .from('user_bookmarks')
            .select('id')
            .eq('user_id', authData.user.id)
            .eq('series_id', sData.id)
            .maybeSingle();
          setIsBookmarked(!!bData);

          const { data: hData } = await supabase
            .from('reading_history')
            .select('chapter_number')
            .eq('user_id', authData.user.id)
            .eq('series_id', sData.id)
            .maybeSingle();
          if (hData) setLastReadChapter(hData.chapter_number);
        }
      }
      setLoading(false);
    }
    init();
  }, [slug]);

  const toggleBookmark = async () => {
    if (!user) {
      alert('Please sign in to bookmark this title.');
      return;
    }
    if (!series) return;

    if (isBookmarked) {
      await supabase
        .from('user_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('series_id', series.id);
      setIsBookmarked(false);
    } else {
      await supabase
        .from('user_bookmarks')
        .insert({ user_id: user.id, series_id: series.id });
      setIsBookmarked(true);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Please sign in to leave a comment.');
      return;
    }
    if (!newComment.trim() || !series) return;

    setSubmittingComment(true);
    const username = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Reader';

    const { data, error } = await supabase
      .from('series_comments')
      .insert({
        series_id: series.id,
        user_id: user.id,
        user_email: user.email,
        username,
        content: newComment.trim(),
      })
      .select('id, user_id, username, content, created_at')
      .single();

    if (!error && data) {
      setComments([data, ...comments]);
      setNewComment('');
    }
    setSubmittingComment(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    const { error } = await supabase
      .from('series_comments')
      .delete()
      .eq('id', commentId);

    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } else {
      alert(error.message);
    }
  };

  const filteredChapters = useMemo(() => {
    let result = [...chapters];
    if (searchChapter.trim()) {
      result = result.filter(
        (ch) =>
          ch.chapter_number.toString().includes(searchChapter.trim()) ||
          (ch.title && ch.title.toLowerCase().includes(searchChapter.toLowerCase()))
      );
    }
    result.sort((a, b) =>
      sortAsc ? a.chapter_number - b.chapter_number : b.chapter_number - a.chapter_number
    );
    return result;
  }, [chapters, searchChapter, sortAsc]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-xs text-neutral-400">
        Loading series details...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <h2 className="text-lg font-bold text-white">Series Not Found</h2>
        <Link href="/" className="text-xs text-indigo-400 hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  const defaultGenres = series.genres && series.genres.length > 0
    ? series.genres
    : ['Action', 'Fantasy', 'Supernatural', 'Martial Arts', 'Adventure'];

  const firstChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

  return (
    <main className="min-h-screen bg-[#0b0c10] text-neutral-200 pb-20">
      {/* Top Banner & Overview */}
      <div className="relative w-full bg-neutral-950 border-b border-neutral-800/80 pt-6 pb-8">
        {series.cover_image_url && (
          <div
            className="absolute inset-0 bg-cover bg-center filter blur-3xl scale-110 opacity-15"
            style={{ backgroundImage: `url(${series.cover_image_url})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-black/85 to-transparent" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 flex flex-col items-center text-center">
          {/* Main Poster */}
          <div className="w-36 sm:w-48 aspect-[3/4.2] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-neutral-900 mb-4">
            {series.cover_image_url ? (
              <img
                src={series.cover_image_url}
                alt={series.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">
                No Cover
              </div>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-2">
            {series.title}
          </h1>

          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase mb-3">
            <span className="px-2.5 py-0.5 rounded bg-black/60 text-neutral-300 border border-white/10">
              {series.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              ● {series.status || 'Releasing'}
            </span>
            <span className="px-2 py-0.5 rounded bg-black/60 text-neutral-400 border border-white/10">
              {series.release_year || 2024}
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              {series.content_rating || 'Suggestive'}
            </span>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-4 text-xs font-semibold text-neutral-400 mb-4">
            <span className="flex items-center gap-1 text-white">
              <span className="text-amber-400">★</span> {series.rating || '9.6'}
              <span className="text-neutral-500 font-normal">/10 ({series.rating_votes || '210'})</span>
            </span>
            <span>•</span>
            <span>{(series.followed_count || 1400).toLocaleString()} follows</span>
          </div>

          {/* Clickable Genre Chips */}
          <div className="flex flex-wrap justify-center gap-1.5 max-w-xl mb-4">
            {defaultGenres.map((g) => (
              <Link
                key={g}
                href={`/filter?genre=${encodeURIComponent(g)}`}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-neutral-900/90 text-neutral-300 border border-neutral-700/60 hover:border-indigo-500/60 hover:text-indigo-300 transition"
              >
                {g}
              </Link>
            ))}
          </div>

          {/* Author / Artist */}
          <div className="text-xs text-neutral-400 space-y-0.5 mb-3">
            <p>Author: <span className="text-neutral-200 font-medium">{series.author || 'Original Author'}</span></p>
            <p>Art: <span className="text-neutral-200 font-medium">{series.artist || 'Original Artist'}</span></p>
          </div>

          {/* Synopsis */}
          <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed mb-4">
            {series.synopsis || 'Read all chapters for free on MangaFlow.'}
          </p>

          {/* Star Rating & Review Component */}
          <StarRatingCard seriesId={series.id} userId={user?.id} />

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-3 mt-2">
            {firstChapter && (
              <Link
                href={`/read/${firstChapter.id}`}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5"
              >
                <span>▶</span>
                {lastReadChapter ? `Continue Ch. ${lastReadChapter}` : `Start Ch. ${firstChapter.chapter_number}`}
              </Link>
            )}

            <button
              type="button"
              onClick={toggleBookmark}
              className={`p-2.5 rounded-xl border transition ${
                isBookmarked
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border-neutral-700/80'
              }`}
              title="Bookmark Series"
            >
              {isBookmarked ? '★' : '☆'}
            </button>
          </div>
        </div>
      </div>

      {/* Chapters Listing with Embedded Search & Sort */}
      <section className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-[#12141c] border border-neutral-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-3.5 bg-[#161824] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2.5">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Chapters ({chapters.length})
            </span>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search chapter..."
                value={searchChapter}
                onChange={(e) => setSearchChapter(e.target.value)}
                className="bg-neutral-900 border border-neutral-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-44"
              />
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="px-2.5 py-1 bg-neutral-900 border border-neutral-700/80 text-neutral-300 text-[11px] font-semibold rounded-lg hover:bg-neutral-800 transition"
              >
                {sortAsc ? 'Asc ↑' : 'Desc ↓'}
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-800/50 max-h-[600px] overflow-y-auto">
            {filteredChapters.length === 0 ? (
              <div className="text-center py-10 text-xs text-neutral-500">
                No matching chapters found.
              </div>
            ) : (
              filteredChapters.map((ch) => (
                <Link
                  key={ch.id}
                  href={`/read/${ch.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-neutral-800/50 transition group"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 transition">
                      Ch. {ch.chapter_number}
                    </span>
                    {ch.title && (
                      <span className="text-xs text-neutral-400 truncate max-w-xs hidden sm:inline">
                        - {ch.title}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-500">
                    {new Date(ch.created_at).toLocaleDateString()}
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Discussion Section */}
        <div className="mt-10 bg-[#12141c] border border-neutral-800/80 rounded-2xl p-4 sm:p-6 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-4">
            Discussion ({comments.length})
          </h3>

          <form onSubmit={handlePostComment} className="mb-6 space-y-2">
            <textarea
              rows={3}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={user ? 'Write a comment...' : 'Sign in to leave a comment...'}
              disabled={!user}
              className="w-full bg-neutral-900 border border-neutral-700/80 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submittingComment || !user || !newComment.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition"
              >
                {submittingComment ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </form>

          <div className="space-y-3 divide-y divide-neutral-800/50">
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-500 text-center py-4">
                No comments yet. Be the first to start the conversation!
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="pt-3 first:pt-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-300">
                        {c.username}
                      </span>
                      {user?.id === c.user_id && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                          You
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] text-neutral-500">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>

                      {user?.id === c.user_id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(c.id)}
                          className="text-[11px] text-neutral-500 hover:text-rose-400 transition"
                          title="Delete comment"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {c.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
