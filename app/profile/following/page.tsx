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
    cover_image_url: string;
    reading_mode: string;
    type?: string;
  };
}

const FOLDERS = [
  { id: 'all', label: 'All' },
  { id: 'reading', label: 'Reading' },
  { id: 'completed', label: 'Completed' },
  { id: 'on_hold', label: 'On-Hold' },
  { id: 'dropped', label: 'Dropped' },
];

export default function FollowingPage() {
  const [items, setItems] = useState<FollowedItem[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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
            cover_image_url,
            reading_mode,
            type
          )
        `)
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: false });

      if (data) setItems(data as any);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = items.filter((item) => {
    const matchesFolder = activeFolder === 'all' || item.folder === activeFolder;
    const matchesSearch = item.series?.title?.toLowerCase().includes(search.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white">Following titles</h1>
          <p className="text-xs text-neutral-400 mt-0.5">{items.length} titles saved</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white outline-none w-40 sm:w-48"
          />
          <div className="flex bg-neutral-900 border border-neutral-800 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs ${viewMode === 'grid' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
              title="Grid View"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg text-xs ${viewMode === 'list' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}
              title="List View"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      {/* MangaFire-Style Folder Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFolder(f.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeFolder === f.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-neutral-500">Loading library...</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-xs text-neutral-500">
          No series found in this folder. Browse the catalog to bookmark titles!
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.series?.slug}`}
              className="group flex flex-col bg-[#13151f] border border-neutral-800/80 hover:border-indigo-500/50 rounded-2xl overflow-hidden transition shadow-lg"
            >
              <div className="relative aspect-[3/4.2] w-full overflow-hidden bg-neutral-900">
                <img
                  src={item.series?.cover_image_url}
                  alt={item.series?.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
                <span className="absolute top-1.5 left-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-black/80 text-neutral-200">
                  {item.series?.type || (item.series?.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga')}
                </span>
              </div>
              <div className="p-2.5">
                <h3 className="text-xs font-bold text-white group-hover:text-indigo-400 truncate transition">
                  {item.series?.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-[#13151f] border border-neutral-800 rounded-2xl overflow-hidden divide-y divide-neutral-800/50">
          {filtered.map((item) => (
            <Link
              key={item.id}
              href={`/series/${item.series?.slug}`}
              className="p-3 hover:bg-neutral-800/40 flex items-center justify-between gap-3 text-xs transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img src={item.series?.cover_image_url} alt="" className="w-9 h-12 rounded object-cover bg-neutral-900" />
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{item.series?.title}</p>
                  <p className="text-[10px] text-neutral-500 uppercase">{item.series?.reading_mode}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg">
                {item.folder}
              </span>
            </Link>
          ))}
        </div>
      )}

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </main>
  );
}
