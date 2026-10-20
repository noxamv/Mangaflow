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
  { id: 'luffy', name: 'Monkey D. Luffy', url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3f4-200d-2620-fe0f.png', bg: '#ef4444' },
  { id: 'ichigo', name: 'Ichigo Kurosaki', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ichigo', bg: '#f97316' },
  { id: 'goku', name: 'Son Goku', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=goku', bg: '#eab308' },
  { id: 'zoro', name: 'Roronoa Zoro', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=zoro', bg: '#10b981' },
  { id: 'gojo', name: 'Satoru Gojo', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=gojo', bg: '#3b82f6' },
  { id: 'naruto', name: 'Naruto Uzumaki', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=naruto', bg: '#f59e0b' },
  { id: 'eren', name: 'Eren Yeager', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=eren', bg: '#78716c' },
  { id: 'frieren', name: 'Frieren', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=frieren', bg: '#ec4899' },
  { id: 'anya', name: 'Anya Forger', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=anya', bg: '#f43f5e' },
  { id: 'jinwoo', name: 'Sung Jin-Woo', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=jinwoo', bg: '#6366f1' },
  { id: 'dokja', name: 'Kim Dokja', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=dokja', bg: '#0284c7' },
  { id: 'arthur', name: 'Arthur Leywin', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=arthur', bg: '#8b5cf6' },
  { id: 'yangkai', name: 'Yang Kai', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=yangkai', bg: '#d97706' },
];

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  english_title?: string | null;
  cover_image_url: string;
  reading_mode: string;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // PWA Prompt Management
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(CHARACTER_AVATARS[0].url);
  const [savingProfile, setSavingProfile] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Service Worker registration
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Capture PWA installation event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const isDismissed = localStorage.getItem('mangaflow_pwa_dismissed');
      if (!isDismissed) {
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
    if (outcome === 'accepted') {
      setShowPwaBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismissPwa = () => {
    setShowPwaBanner(false);
    localStorage.setItem('mangaflow_pwa_dismissed', 'true');
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || '');
        setSelectedAvatar(u.user_metadata?.avatar_url || CHARACTER_AVATARS[0].url);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || '');
        setSelectedAvatar(u.user_metadata?.avatar_url || CHARACTER_AVATARS[0].url);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_all_titles', {
          search_query: trimmed,
        });

        if (!rpcError && rpcData?.length) {
          setResults(
            rpcData.map((s: any) => ({
              id: s.id,
              slug: s.slug || s.id,
              title: s.english_title || s.title,
              english_title: s.english_title,
              cover_image_url: s.cover_image_url || s.cover_url || '',
              reading_mode: s.reading_mode || 'manga',
            }))
          );
        } else {
          const { data: fallbackData } = await supabase
            .from('series')
            .select('id, slug, title, english_title, cover_image_url, reading_mode')
            .or(`title.ilike.%${trimmed}%,english_title.ilike.%${trimmed}%`)
            .limit(10);

          setResults(
            (fallbackData || []).map((s: any) => ({
              id: s.id,
              slug: s.slug || s.id,
              title: s.english_title || s.title,
              english_title: s.english_title,
              cover_image_url: s.cover_image_url || '',
              reading_mode: s.reading_mode || 'manga',
            }))
          );
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoadingSearch(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserMenuOpen(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);

    const { error } = await supabase.auth.updateUser({
      data: { display_name: displayName.trim(), avatar_url: selectedAvatar },
    });

    if (!error) {
      setEditProfileOpen(false);
      window.location.reload();
    } else {
      alert(error.message);
    }
    setSavingProfile(false);
  };

  const currentAvatarUrl = user?.user_metadata?.avatar_url || null;
  const currentDisplayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'User';

  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b0c10" />
      </head>
      <body className="bg-[#0b0c10] text-neutral-100 antialiased min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white">
        {(menuOpen || searchOpen) && (
          <div
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          />
        )}

        {/* PWA Floating Install Banner */}
        {showPwaBanner && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-[#141724] border border-indigo-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-black text-white shrink-0 shadow-lg shadow-indigo-500/30">
                MF
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-white">Install MangaFlow App</h4>
                <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                  Install our app for fullscreen reading, offline caching, and faster chapter access.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleInstallPwa}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-600/30"
                  >
                    Install Now
                  </button>
                  <button
                    onClick={handleDismissPwa}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg text-xs font-semibold transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navbar */}
        <header className="sticky top-0 z-40 w-full bg-[#0f1117]/95 backdrop-blur-md border-b border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
            <div className="relative flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Toggle Navigation"
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
                <div className="absolute top-12 left-0 w-48 bg-[#151822] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50">
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

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(!searchOpen)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-indigo-400/50 shadow-sm hover:scale-105 transition bg-neutral-800 flex items-center justify-center"
                  >
                    {currentAvatarUrl ? (
                      <img src={currentAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-xs text-indigo-300">{currentDisplayName[0].toUpperCase()}</span>
                    )}
                  </button>

                  {userMenuOpen && (
                    <div className="absolute top-10 right-0 w-52 bg-[#141722] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50">
                      <div className="px-3.5 py-1.5 border-b border-neutral-800 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 border border-neutral-700">
                          {currentAvatarUrl ? (
                            <img src={currentAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold">
                              {currentDisplayName[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Account</p>
                          <p className="text-xs font-bold text-white truncate">{currentDisplayName}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); setEditProfileOpen(true); }}
                        className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>👤</span> Edit Profile
                      </button>

                      <Link
                        href="/profile/following"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>★</span> Following Titles
                      </Link>

                      <Link
                        href="/profile/sync"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>🔄</span> Import / Export Sync
                      </Link>

                      <div className="my-1 border-t border-neutral-800" />

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full text-left flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        Log Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-md shadow-sm transition"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Global Search Bar Dropdown */}
        {searchOpen && (
          <div className="sticky top-14 z-40 w-full px-3 sm:px-6 max-w-lg mx-auto">
            <div className="bg-[#151824] border border-neutral-700 rounded-xl shadow-2xl overflow-hidden mt-2">
              <div className="flex items-center px-3 py-2 gap-2 border-b border-neutral-800 bg-[#12141d]">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search series by English, Romaji, or Synonyms..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
                  autoFocus
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-white text-xs px-1">✕</button>
                )}
              </div>

              {query && (
                <div className="max-h-80 overflow-y-auto divide-y divide-neutral-800/60 bg-[#151824]">
                  {loadingSearch && <div className="p-3 text-center text-xs text-neutral-400">Searching...</div>}
                  {!loadingSearch && results.map((item) => (
                    <Link
                      key={item.id}
                      href={`/series/${item.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800/60 transition group"
                    >
                      <div className="w-9 h-12 rounded overflow-hidden bg-neutral-900 shrink-0">
                        <img src={item.cover_image_url} alt={item.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 truncate">{item.title}</h4>
                        <span className="text-[10px] text-neutral-400 uppercase">{item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1">{children}</div>

        <footer className="w-full border-t border-neutral-800/80 bg-[#0a0b0e] py-6 text-center text-xs text-neutral-500 mt-12">
          <p>© {new Date().getFullYear()} MangaFlow. All content indexed on-demand.</p>
        </footer>

        {/* Mounted AuthModal (Resolves Sign In Button Not Opening) */}
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </body>
    </html>
  );
}
