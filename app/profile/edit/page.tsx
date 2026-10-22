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

export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setEmail(data.user.email || '');
        setDisplayName(data.user.user_metadata?.display_name || data.user.email?.split('@')[0] || '');
        setAvatarUrl(data.user.user_metadata?.avatar_url || null);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      email: email,
      data: {
        display_name: displayName.trim(),
        avatar_url: avatarUrl,
      },
    });

    setSaving(false);
    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage('Profile updated successfully!');
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
    <main className="max-w-xl mx-auto px-4 py-10 space-y-6">
      <div className="border-b border-neutral-800 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Edit Profile</h1>
          <p className="text-xs text-neutral-400 mt-1">Manage your account username, email, and avatar</p>
        </div>
        <Link href="/" className="text-xs text-neutral-400 hover:text-white transition">
          ← Back
        </Link>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-xs font-semibold ${message.startsWith('Error') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-[#14161f] border border-neutral-800 rounded-xl p-5 shadow-xl">
        {/* Avatar Selection */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-2">Profile Avatar</label>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setAvatarUrl(null)}
              className={`w-12 h-12 rounded-full border flex items-center justify-center transition ${avatarUrl === null ? 'border-amber-400 bg-neutral-800 ring-2 ring-amber-400/30' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}
              title="Default Silhouette"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </button>
            {DEFAULT_AVATARS.map((url, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setAvatarUrl(url)}
                className={`w-12 h-12 rounded-full border overflow-hidden transition ${avatarUrl === url ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-neutral-800'}`}
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
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
        >
          {saving ? 'Saving changes...' : 'Save Profile'}
        </button>
      </form>
    </main>
  );
}
