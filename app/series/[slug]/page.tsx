'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';
import ShareBar from '../../../components/ShareBar';

interface Chapter {
  id: string;
  chapter_number: number;
  title: string | null;
  created_at: string;
}

interface Series {
  id: string;
  title: string;
  slug: string;
  cover_url: string;
  description: string;
  status: string;
  author: string;
}

export default function SeriesDetailsPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    async function fetchSeriesData() {
      if (!slug) return;
      setLoading(true);

      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select('*')
        .eq('slug', slug)
        .single();

      if (seriesError || !seriesData) {
        setLoading(false);
        return;
      }

      setSeries(seriesData);

      // Check if user is following this series
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        const { data: followRecord } = await supabase
          .from('user_follows')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq('series_id', seriesData.id)
          .maybeSingle();

        if (followRecord) setIsFollowing(true);
      }

      // Fetch chapters
      const { data: chapterData } = await supabase
        .from('chapters')
        .select('id, chapter_number, title, created_at')
        .eq('series_id', seriesData.id)
        .order('chapter_number', { ascending: false });

      if (chapterData) {
        setChapters(chapterData);
      }

      setLoading(false);
    }

    fetchSeriesData();
  }, [slug]);

  const handleFollowToggle = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setShowAuthModal(true);
      return;
    }

    if (!series) return;

    if (isFollowing) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('user_id', userData.user.id)
        .eq('series_id', series.id);
      setIsFollowing(false);
    } else {
      await supabase.from('user_follows').insert({
        user_id: userData.user.id,
        series_id: series.id,
      });
      setIsFollowing(true);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d0d12] text-white">
        Loading series...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d12] text-white">
        <h1 className="text-2xl font-bold">Series Not Found</h1>
        <Link href="/" className="mt-4 text-purple-400 hover:underline">
          Return to Browse
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0d12] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-8 md:flex-row">
          <div className="relative h-72 w-52 flex-shrink-0 overflow-hidden rounded-lg shadow-lg">
            <Image
              src={series.cover_url || '/placeholder.png'}
              alt={series.title}
              fill
              className="object-cover"
            />
          </div>

          <div className="flex flex-col justify-center">
            <h1 className="text-3xl font-extrabold sm:text-4xl">{series.title}</h1>
            <p className="mt-2 text-sm text-gray-400">Author: {series.author || 'Unknown'}</p>
            <p className="mt-1 text-sm text-gray-400">Status: {series.status || 'Ongoing'}</p>
            <p className="mt-4 text-gray-300">{series.description}</p>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button
                onClick={handleFollowToggle}
                className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                  isFollowing
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
              >
                {isFollowing ? '✓ Bookmarked' : '+ Bookmark Series'}
              </button>

              <ShareBar title={series.title} />
            </div>
          </div>
        </div>

        {/* Chapter list */}
        <div className="mt-12">
          <h2 className="border-b border-gray-800 pb-2 text-2xl font-bold">Chapters</h2>
          <div className="mt-4 flex flex-col gap-2">
            {chapters.length === 0 ? (
              <p className="text-gray-500">No chapters released yet.</p>
            ) : (
              chapters.map((chapter) => (
                <Link
                  key={chapter.id}
                  href={`/read/${chapter.id}`}
                  className="flex items-center justify-between rounded-md bg-[#16161f] p-4 transition hover:bg-[#20202c]"
                >
                  <span className="font-medium text-gray-200">
                    Chapter {chapter.chapter_number} {chapter.title ? `- ${chapter.title}` : ''}
                  </span>
                  <span className="text-xs text-purple-400">Read →</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Auth Modal Trigger */}
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </main>
  );
}
