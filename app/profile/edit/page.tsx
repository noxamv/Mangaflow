'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';

const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Shadow',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=MangaFlow',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Shinobi',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Hunter',
  'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Ronin',
];

const ALL_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Martial Arts', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Supernatural', 'Thriller', 'Historical', 'School Life',
  'Isekai', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Reincarnation',
  'Monster Girls', 'Mecha', 'Tragedy', 'Magic'
];

export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [preferredFormat, setPreferredFormat] = useState<'all' | 'manga' | 'manhwa'>('all');
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setEmail(data.user.email || '');
        setDisplayName(
          data.user.user_metadata?.display_name ||
          data.user.user_metadata?.full_name ||
          data.user.email?.split('@')[0] || ''
        );
        setAvatarUrl(data.user.user_metadata?.avatar_url || null);
        setPreferredFormat(data.user.user_metadata?.preferred_format || 'all');
        setFavoriteGenres(data.user.user_metadata?.favorite_genres || []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const toggleGenre = (genre: string) => {
    setFavoriteGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      data: {
        display_name: displayName.trim(),
        full_name: displayName.trim(),
        avatar_url: avatarUrl,
        preferred_format: preferredFormat,
        favorite_genres: favoriteGenres,
      },
    });

    setSaving(false);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage('Profile and preferences updated successfully!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-xs text-neutral-500">
        Loading profile settings...
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8 space-y-6 w-full max-w-full overflow-x-hidden min-w-0">
      <div className="border-b border-neutral-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Edit Profile</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your username, content preference, and favorite genres
          </p>
        </div>
        <Link href="/" className="text-xs text-indigo-400 hover:text-indigo-300 transition">
          ← Back
        </Link>
      </div>

      {message && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            message.startsWith('Error')
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-[#13151f] border border-neutral-800 rounded-2xl p-5 shadow-xl">
        {/* Profile Avatar */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-2">Profile Avatar</label>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition ${
                avatarUrl === null
                  ? 'border-indigo-500 bg-neutral-800 ring-2 ring-indigo-500/30'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-400'
              }`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </button>
            {DEFAULT_AVATARS.map((url, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setAvatarUrl(url)}
                className={`w-11 h-11 rounded-full border overflow-hidden transition ${
                  avatarUrl === url ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-neutral-800'
                }`}
              >
                <img src={url} alt="" className="w-full h-full object-cover bg-neutral-900" />
              </button>
            ))}
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Display Username</label>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Email Address</label>
          <input
            type="email"
            disabled
            value={email}
            className="w-full bg-neutral-950 border border-neutral-900 rounded-xl px-3 py-2 text-xs text-neutral-500 cursor-not-allowed"
          />
          <span className="text-[10px] text-neutral-500 mt-1 block">Authentication email managed by Supabase OTP.</span>
        </div>

        {/* Content Mode Preference */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Reading Content Mode</label>
          <div className="grid grid-cols-3 gap-2">
            {(['all', 'manga', 'manhwa'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPreferredFormat(mode)}
                className={`py-2 rounded-xl text-xs font-bold capitalize transition border ${
                  preferredFormat === mode
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                {mode === 'all' ? 'All (Mixed)' : mode === 'manga' ? 'Manga (JP)' : 'Manhwa (KR)'}
              </button>
            ))}
          </div>
        </div>

        {/* 25+ Favorite Genres Preference */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-neutral-300">Favorite Genres (Select 3 or more)</label>
            <span className="text-[10px] text-indigo-400 font-bold">{favoriteGenres.length} selected</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-2 bg-neutral-950 rounded-xl border border-neutral-800/80">
            {ALL_GENRES.map((g) => {
              const selected = favoriteGenres.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGenre(g)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition border ${
                    selected
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {selected ? '✓ ' : ''}{g}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-lg disabled:opacity-50"
        >
          {saving ? 'Saving changes...' : 'Save Profile & Preferences'}
        </button>
      </form>
    </main>
  );
}
