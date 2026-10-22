'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

export default function CategoryCatalogPage({
  title,
  description,
  sortQuery,
}: {
  title: string;
  description: string;
  sortQuery: 'trending' | 'popular' | 'latest';
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase.from('series').select('*');

      if (sortQuery === 'trending' || sortQuery === 'latest') {
        query = query.order('updated_at', { ascending: false });
      } else {
        query = query.order('rating', { ascending: false, nullsFirst: false });
      }

      const { data } = await query.limit(36);
      setItems(data || []);
      setLoading(false);
    }
    load();
  }, [sortQuery]);

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-neutral-800 pb-4">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="text-xs text-neutral-400 mt-1">{description}</p>
      </div>

      {loading ? (
        <div className="py-24 text-center text-xs text-neutral-500">Loading catalog...</div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center text-xs text-neutral-500">No series found.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
          {items.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.slug}`}
              className="group block bg-[#14161f] border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition"
            >
              <div className="aspect-[3/4.2] overflow-hidden bg-neutral-900">
                <img
                  src={s.cover_image_url || '/placeholder.png'}
                  alt={s.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                />
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold text-white truncate group-hover:text-amber-400 transition">
                  {s.english_title || s.title}
                </p>
                <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-1">
                  <span className="uppercase">{s.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}</span>
                  <span className="text-amber-400">{s.status || 'Ongoing'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
