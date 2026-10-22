'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

interface NotificationCard {
  id: string;
  chapter_id: string;
  series_title: string;
  series_slug: string;
  chapter_number: number;
  cover_url: string;
  time_ago: string;
  is_read: boolean;
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'read'>('all');
  const [items, setItems] = useState<NotificationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setLoading(false);
        return;
      }
      setUserId(auth.user.id);

      const { data: follows } = await supabase
        .from('user_follows')
        .select('series_id')
        .eq('user_id', auth.user.id);

      if (follows && follows.length > 0) {
        const sIds = follows.map((f: any) => f.series_id);

        const [chapsRes, readsRes] = await Promise.all([
          supabase
            .from('chapters')
            .select('id, series_id, chapter_number, created_at, series:series_id(title, slug, cover_image_url)')
            .in('series_id', sIds)
            .order('chapter_number', { ascending: false }),
          supabase
            .from('notification_reads')
            .select('chapter_id')
            .eq('user_id', auth.user.id),
        ]);

        const readSet = new Set((readsRes.data || []).map((r: any) => r.chapter_id));

        if (chapsRes.data) {
          const latestMap = new Map<string, NotificationCard>();
          for (const c of chapsRes.data) {
            if (!latestMap.has(c.series_id)) {
              const sObj = Array.isArray(c.series) ? c.series[0] : c.series;
              latestMap.set(c.series_id, {
                id: c.id,
                chapter_id: c.id,
                series_title: sObj?.title || 'Series',
                series_slug: sObj?.slug || '',
                chapter_number: c.chapter_number,
                cover_url: sObj?.cover_image_url || '',
                time_ago: 'Latest Release',
                is_read: readSet.has(c.id),
              });
            }
          }
          setItems(Array.from(latestMap.values()));
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  const markAllRead = async () => {
    if (!userId) return;
    const unread = items.filter((i) => !i.is_read);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));

    if (unread.length > 0) {
      await supabase.from('notification_reads').upsert(
        unread.map((i) => ({ user_id: userId, chapter_id: i.chapter_id })),
        { onConflict: 'user_id,chapter_id' }
      );
    }
  };

  const filtered = items.filter((item) => {
    if (activeTab === 'unread') return !item.is_read;
    if (activeTab === 'read') return item.is_read;
    return true;
  });

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white">Notifications</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Newest release from each title you bookmark</p>
        </div>
        <button
          onClick={markAllRead}
          className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-bold text-indigo-400 transition"
        >
          Mark as read
        </button>
      </div>

      <div className="flex bg-[#13151f] border border-neutral-800 rounded-xl p-1 gap-1">
        {(['all', 'unread', 'read'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-neutral-500">Loading alerts...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-xs text-neutral-500">No chapter drops in this category.</div>
      ) : (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl overflow-hidden divide-y divide-neutral-800/60">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/read/${item.chapter_id}`}
              className="p-3.5 hover:bg-neutral-800/40 flex items-center justify-between gap-3 transition group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img src={item.cover_url} alt="" className="w-9 h-12 rounded object-cover bg-neutral-900 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white group-hover:text-indigo-400 truncate transition">
                    {item.series_title}
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Chapter {item.chapter_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md font-bold">
                  {item.time_ago}
                </span>
                {!item.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
