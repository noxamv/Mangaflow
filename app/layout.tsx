'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './globals.css';
import { createClient } from '@supabase/supabase-js';
import AuthModal from '../components/AuthModal';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const CHARACTER_AVATARS = [
  { id: 'jinwoo', name: 'Sung Jin-Woo', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80' },
  { id: 'luffy', name: 'Monkey D. Luffy', url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80' },
  { id: 'ichigo', name: 'Ichigo Kurosaki', url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=150&auto=format&fit=crop&q=80' },
  { id: 'gojo', name: 'Satoru Gojo', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80' },
  { id: 'zoro', name: 'Roronoa Zoro', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80' },
  { id: 'dokja', name: 'Kim Dokja', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(CHARACTER_AVATARS[0].url);
  const [notifications, setNotifications] = useState<any[]>([]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem('mangaflow_pwa_dismissed')) {
        setShowPwaBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShowPwaBanner(false);
    setDeferredPrompt(null);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || '');
        setSelectedAvatar(u.user_metadata?.avatar_url || CHARACTER_AVATARS[0].url);
        loadNotifications(u.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || '');
        setSelectedAvatar(u.user_metadata?.avatar_url || CHARACTER_AVATARS[0].url);
        loadNotifications(u.id);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Deduplicated: Exactly ONE latest chapter per followed series
  async function loadNotifications(userId: string) {
    try {
      const { data: follows } = await supabase
        .from('user_follows')
        .select('series_id')
        .eq('user_id', userId);

      if (follows && follows.length > 0) {
        const sIds = follows.map((f: any) => f.series_id);
        const { data: chaps } = await supabase
          .from('chapters')
          .select('id, series_id, chapter_number, created_at, series (title, slug)')
          .in('series_id', sIds)
          .order('chapter_number', { ascending: false });

        if (chaps) {
          const map = new Map<string, any>();
          for (const c of chaps) {
            if (!map.has(c.series_id)) {
              const sObj = Array.isArray(c.series) ? c.series[0] : c.series;
              map.set(c.series_id, {
                id: c.id,
                series_title: sObj?.title || 'Series',
                series_slug: sObj?.slug || '',
                chapter_id: c.id,
                chapter_number: c.chapter_number,
                time_ago: 'Latest Release',
                is_read: false,
              });
            }
          }
          setNotifications(Array.from(map.values()).slice(0, 8));
        }
      }
    } catch {}
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('series')
        .select('id, slug, title, english_title, cover_image_url, reading_mode')
        .or(`title.ilike.%${trimmed}%,english_title.ilike.%${trimmed}%`)
        .limit(8);
      setResults(data || []);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await supabase.auth.updateUser({
      data: { display_name: displayName.trim(), avatar_url: selectedAvatar },
    });
    setEditProfileOpen(false);
    window.location.reload();
  };

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0a0c" />
      </head>
      <body className="bg-[#0a0b0e] text-neutral-100 antialiased min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white">
        {(menuOpen || searchOpen || userMenuOpen || notifMenuOpen) && (
          <div
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(false);
              setUserMenuOpen(false);
              setNotifMenuOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          />
        )}

        {showPwaBanner && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-[#13151f] border border-indigo-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-black text-white shrink-0 shadow-lg shadow-indigo-600/30">
                MF
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white">Install MangaFlow App</h4>
                <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                  Fullscreen reading, offline caching, and instant chapter loading.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleInstallPwa}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-600/30"
                  >
                    Install Now
                  </button>
                  <button
                    onClick={() => {
                      setShowPwaBanner(false);
                      localStorage.setItem('mangaflow_pwa_dismissed', 'true');
                    }}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg text-xs font-semibold transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <header className="sticky top-0 z-40 w-full bg-[#0d0e14]/95 backdrop-blur-md border-b border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="relative flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <Link href="/" className="flex items-center gap-1.5">
                <span className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Manga<span className="text-indigo-400">Flow</span>
                </span>
              </Link>

              {menuOpen && (
                <div className="absolute top-12 left-0 w-48 bg-[#141620] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50">
                  <Link href="/" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70">
                    Home
                  </Link>
                  <Link href="/category/trending" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70">
                    🔥 Trending
                  </Link>
                  <Link href="/category/popular" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70">
                    ⭐ Popular
                  </Link>
                  <Link href="/browse" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-neutral-800/70">
                    Browse Library
                  </Link>
                </div>
              )}
            </div>

            {/* Clean Header: Settings removed from here, accessible in Profile dropdown */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                title="Search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifMenuOpen(!notifMenuOpen);
                    setUserMenuOpen(false);
                  }}
                  className="relative p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                  title="Notifications"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {hasUnread && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0d0e14]" />
                  )}
                </button>

                {notifMenuOpen && (
                  <div className="absolute top-10 right-0 w-72 sm:w-80 bg-[#13151f] border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Notifications</span>
                      <button
                        onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))}
                        className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        ✓ Mark as read
                      </button>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/50">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-neutral-500">
                          No chapter alerts yet. Follow series to receive drop updates!
                        </div>
                      ) : (
                        notifications.map((item) => (
                          <Link
                            key={item.id}
                            href={`/read/${item.chapter_id}`}
                            onClick={() => setNotifMenuOpen(false)}
                            className="p-3 hover:bg-neutral-800/40 flex items-center justify-between gap-2 text-xs transition"
                          >
                            <div className="truncate">
                              <p className="font-bold text-neutral-200 truncate">{item.series_title}</p>
                              <p className="text-[10px] text-neutral-400">Latest: Chapter {item.chapter_number}</p>
                            </div>
                            <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-black shrink-0">
                              {item.time_ago}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>

                    <div className="p-2 border-t border-neutral-800 text-center bg-neutral-900/40">
                      <Link
                        href="/notifications"
                        onClick={() => setNotifMenuOpen(false)}
                        className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
                      >
                        View all notifications →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(!userMenuOpen);
                      setNotifMenuOpen(false);
                    }}
                    className="relative w-8 h-8 rounded-full overflow-hidden border border-indigo-400/50 shadow-sm hover:scale-105 transition bg-neutral-800 flex items-center justify-center"
                  >
                    <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0d0e14]" />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute top-10 right-0 w-56 bg-[#13151f] border border-neutral-700/80 rounded-2xl shadow-2xl py-2 z-50">
                      <div className="px-3.5 py-2 border-b border-neutral-800 flex items-center gap-2.5">
                        <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 border border-neutral-700">
                          <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-black" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{displayName}</p>
                          <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setEditProfileOpen(true);
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>👤</span> Edit Profile
                      </button>

                      <Link
                        href="/profile/following"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>🔖</span> Following Titles
                      </Link>

                      <Link
                        href="/notifications"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>🔔</span> Notifications
                      </Link>

                      <Link
                        href="/profile/sync"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>🔄</span> Import / Export
                      </Link>

                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>⚙️</span> Settings
                      </Link>

                      <div className="my-1 border-t border-neutral-800" />

                      <button
                        type="button"
                        onClick={async () => {
                          await supabase.auth.signOut();
                          setUser(null);
                          setUserMenuOpen(false);
                          window.location.reload();
                        }}
                        className="w-full text-left flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <span>🚪</span> Log Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-md transition"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        {searchOpen && (
          <div className="sticky top-14 z-40 w-full px-3 sm:px-6 max-w-lg mx-auto">
            <div className="bg-[#13151f] border border-neutral-700 rounded-2xl shadow-2xl overflow-hidden mt-2">
              <div className="flex items-center px-3.5 py-2.5 gap-2 border-b border-neutral-800 bg-[#10121a]">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
                  autoFocus
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-white text-xs px-1">✕</button>
                )}
              </div>

              {query && (
                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-800/60">
                  {results.map((item) => (
                    <Link
                      key={item.id}
                      href={`/series/${item.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 px-3.5 py-2 hover:bg-neutral-800/60 transition group"
                    >
                      <img src={item.cover_image_url} alt="" className="w-8 h-11 object-cover rounded bg-neutral-900" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 truncate">{item.title}</p>
                        <span className="text-[10px] text-neutral-400 uppercase">{item.reading_mode}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {editProfileOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#13151f] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <h3 className="text-sm font-bold text-white">Customize Profile</h3>
                <button type="button" onClick={() => setEditProfileOpen(false)} className="text-neutral-400 hover:text-white text-sm">✕</button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-neutral-400 block mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-400 block mb-2">Select Character Avatar</label>
                  <div className="grid grid-cols-3 gap-2.5">
                    {CHARACTER_AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setSelectedAvatar(av.url)}
                        title={av.name}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
                          selectedAvatar === av.url ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-500/40' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-xl transition"
                >
                  Save Profile
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="flex-1">{children}</div>

        <footer className="w-full border-t border-neutral-800/80 bg-[#08090b] py-6 text-center text-xs text-neutral-500 mt-12">
          <p>© {new Date().getFullYear()} MangaFlow. All content indexed on-demand.</p>
        </footer>

        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </body>
    </html>
  );
}
