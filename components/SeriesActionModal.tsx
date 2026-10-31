// components/SeriesActionModal.tsx
'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SeriesActionModalProps {
  series: {
    id: string;
    title: string;
    slug: string;
    cover_url?: string | null;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function SeriesActionModal({ series, isOpen, onClose }: SeriesActionModalProps) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !series) return null;

  const notify = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(null);
      onClose();
    }, 1400);
  };

  const handleUpdateLibrary = async (status: string) => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData?.session?.user?.id) {
        notify('Please log in to manage your library.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.from('user_library').upsert(
        {
          user_id: authData.session.user.id,
          series_id: series.id,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,series_id' }
      );

      if (error) throw error;
      notify(`Saved to ${status}!`);
    } catch (err: any) {
      notify(err.message || 'Failed to update library.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/series/${series.slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: series.title, url });
        onClose();
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      notify('Link copied to clipboard!');
    }
  };

  const handleReport = async () => {
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seriesId: series.id,
          title: series.title,
          issue: 'User reported broken images or missing chapters from Quick Actions',
        }),
      });
      notify('Report sent to moderators.');
    } catch {
      notify('Report failed to send.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <div className="truncate pr-2">
            <h3 className="text-white font-bold text-base truncate">{series.title}</h3>
            <p className="text-neutral-400 text-xs">Quick Actions</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close action menu"
            className="text-neutral-400 hover:text-white p-1 rounded-lg text-lg"
          >
            ✕
          </button>
        </div>

        {statusMessage ? (
          <div className="py-8 text-center text-indigo-400 font-medium text-sm animate-pulse">
            {statusMessage}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-1 text-sm font-medium">
            <button
              disabled={loading}
              onClick={() => handleUpdateLibrary('Reading')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-200 hover:bg-neutral-800 hover:text-white transition text-left"
            >
              <span className="text-emerald-400">📖</span> Start / Mark as Reading
            </button>
            <button
              disabled={loading}
              onClick={() => handleUpdateLibrary('Plan to Read')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-200 hover:bg-neutral-800 hover:text-white transition text-left"
            >
              <span className="text-blue-400">🔖</span> Plan to Read Later
            </button>
            <button
              disabled={loading}
              onClick={() => handleUpdateLibrary('Completed')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-200 hover:bg-neutral-800 hover:text-white transition text-left"
            >
              <span className="text-purple-400">✅</span> Mark as Completed
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-200 hover:bg-neutral-800 hover:text-white transition text-left"
            >
              <span className="text-amber-400">🔗</span> Share Link
            </button>
            <button
              onClick={handleReport}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition text-left"
            >
              <span>🚩</span> Report Broken Mirror / Missing Content
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
