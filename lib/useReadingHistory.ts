// lib/useReadingHistory.ts
'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const LOCAL_STORAGE_KEY = 'mangaflow_reading_history';

export interface HistoryEntry {
  seriesId: string;
  seriesSlug: string;
  seriesTitle: string;
  chapterId: string;
  chapterNumber: number;
  pageIndex: number;
  progressPercent: number;
  updatedAt: number;
}

export function saveLocalProgress(entry: HistoryEntry) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const history: Record<string, HistoryEntry> = raw ? JSON.parse(raw) : {};
    history[entry.seriesId] = entry;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

export function getLocalProgress(seriesId: string): HistoryEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const history: Record<string, HistoryEntry> = JSON.parse(raw);
    return history[seriesId] || null;
  } catch {
    return null;
  }
}

export function getAllLocalHistory(): Record<string, HistoryEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Custom Hook: Tracks scroll position in localStorage and syncs
 * to Supabase with an anti-flood debounce (max once every 10 seconds).
 */
export function useTrackReadingProgress(
  seriesId?: string,
  seriesSlug?: string,
  seriesTitle?: string,
  chapterId?: string,
  chapterNumber?: number
) {
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const recordProgress = (pageIndex: number, totalPages: number) => {
    if (!seriesId || !chapterId || typeof chapterNumber !== 'number') return;

    const percent = totalPages > 0 ? Math.round(((pageIndex + 1) / totalPages) * 100) : 0;
    const entry: HistoryEntry = {
      seriesId,
      seriesSlug: seriesSlug || '',
      seriesTitle: seriesTitle || '',
      chapterId,
      chapterNumber,
      pageIndex,
      progressPercent: percent,
      updatedAt: Date.now(),
    };

    // 1. Instant client-side save (0ms latency, zero database load)
    saveLocalProgress(entry);

    // 2. Anti-spam debounced server sync (syncs to Supabase only after reading settles)
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (authData?.session?.user?.id) {
          await supabase.from('reading_history').upsert(
            {
              user_id: authData.session.user.id,
              series_id: seriesId,
              chapter_id: chapterId,
              chapter_number: chapterNumber,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,series_id' }
          );
        }
      } catch {}
    }, 10000);
  };

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, []);

  return { recordProgress };
}
