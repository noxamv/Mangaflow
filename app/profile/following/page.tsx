'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import AuthModal from '../../../components/AuthModal';

interface FollowedItem {
  id: string;
  series_id: string;
  folder: string;
  created_at: string;
  series: {
    id: string;
    slug: string;
    title: string;
    english_title?: string;
    cover_image_url: string;
    cover_url?: string;
    reading_mode: string;
  };
}

const FOLDERS = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading' },
  { id: 'plan_to_read', label: 'Plan to Read' },
  { id: 'completed', label: 'Completed' },
  { id: 'on_hold', label: 'On-Hold' },
  { id: 'dropped', label: 'Dropped' },
];

export default function FollowingPage() {
  const [items, setItems] = useState<FollowedItem[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(auth.user);

      const { data } = await supabase
        .from('user_follows')
        .select(`
          id,
          series_id,
          folder,
          created_at,
          series (
            id,
            slug,
            title,
            english_title,
            cover_image_url,
            cover_url,
            reading_mode
          )
        `)
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

      const sanitized = (data || []).map((item: any) => ({
        id: item.id,
        series_id: item.series_id,
        folder: item.folder,
        created_at: item.created_at,
        series: Array.isArray(item.series) ? item.series[0] : item.series,
      }));

      setItems(sanitized);
      setLoading(false);
    }
    load();
  }, []);

  const handleFolderChange = async (followId: string, newFolder: string) => {
    await supabase.from('user_follows').update({ folder: newFolder }).eq('id', followId);
    setItems((prev) =>
      prev.map((it) => (it.id === followId ? { ...it, folder: newFolder } : it))
    );
  };

  const handleRemove = async (followId: string) => {
    await supabase.from('user_follows').delete().eq('id', followId);
    setItems((prev) => prev.filter((it) => it.id !== followId));
  };

  const filtered = items.filter((item) => {
    if (activeFolder !== 'all' && item.folder !== activeFolder) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const title = (item.series?.english_title || item.series?.title || '').toLowerCase();
      return title.includes(q);
    }
    return true;
  });

  if (!loading && !user) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-xl font-bold text-white">Your Reading Library</h1>
        <p className="text-xs text-neutral-400">Sign in to track reading progress and organize series.</p>
        <button
          onClick={() => setShowAuth(true)}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
        >
          Sign In
        </button>
        <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6 w-full max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-white">Library Tracker</h1>
          <p className="text-xs text-neutral-400 mt-1">Organize and monitor reading progress across shelves</p>
        </div>

        <input
          type="text"
          placeholder="Filter library..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 bg-[#13151f] border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 w-full sm:w-60"
        />
      </div>

      {/* MangaFire 6-Shelf Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeFolder === f.id
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-[#13151f] text-neutral-400 hover:text-white border border-neutral-800/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-neutral-500">Loading library items...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-xs text-neutral-500 bg-[#0e1015] rounded-2xl border border-neutral-900">
          No series found in this shelf.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((item) => {
            const cover = item.series?.cover_image_url || item.series?.cover_url || '';
            const title = item.series?.english_title || item.series?.title || 'Unknown';

            return (
              <div
                key={item.id}
                className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-2 flex flex-col justify-between group shadow-lg"
              >
                <Link href={`/series/${item.series?.slug}`} className="block">
                  <div className="aspect-[3/4.2] w-full rounded-xl overflow-hidden bg-neutral-900 relative">
                    {cover ? (
                      <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600">📖</div>
                    )}
                    <span className="absolute top-1 left-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200">
                      {item.series?.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-white truncate mt-2 group-hover:text-indigo-400 transition">
                    {title}
                  </h3>
                </Link>

                <div className="mt-2 pt-2 border-t border-neutral-800/80 flex items-center justify-between gap-1">
                  <select
                    value={item.folder}
                    onChange={(e) => handleFolderChange(item.id, e.target.value)}
                    className="bg-neutral-900 text-neutral-300 text-[10px] rounded-lg px-2 py-1 outline-none border border-neutral-800 w-full"
                  >
                    <option value="reading">Reading</option>
                    <option value="plan_to_read">Plan to Read</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On-Hold</option>
                    <option value="dropped">Dropped</option>
                  </select>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="text-neutral-500 hover:text-red-400 text-xs px-1.5 py-1"
                    title="Remove from library"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
