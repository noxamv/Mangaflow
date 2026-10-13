'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './globals.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

const CHARACTER_AVATARS = [
  { id: 'jinwoo', name: 'Sung Jin-Woo', url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=150&auto=format&fit=crop&q=80' },
  { id: 'gojo', name: 'Satoru Gojo', url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=150&auto=format&fit=crop&q=80' },
  { id: 'luffy', name: 'Monkey D. Luffy', url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80' },
  { id: 'zoro', name: 'Roronoa Zoro', url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80' },
  { id: 'eren', name: 'Eren Yeager', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80' },
  { id: 'frieren', name: 'Frieren', url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80' },
  { id: 'anya', name: 'Anya Forger', url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80' },
  { id: 'chahaein', name: 'Cha Hae-In', url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=150&auto=format&fit=crop&q=80' },
];

interface SearchResult {
  id: string;
  slug: string;
  title: string;
  cover_image_url: string;
  reading_mode: string;
}

interface NotificationItem {
  id: string;
  series_id: string;
  chapter_id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  // User session state
  const [user, setUser] = useState<any>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Profile Edit State
  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(CHARACTER_AVATARS[0].url);
  const [savingProfile, setSavingProfile] = useState(false);

  // Auth States
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Search States
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Service Worker Registration for Offline PWA Capabilities
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
    }
  }, []);

  // PWA install trigger listener
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPwaBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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

  // Auth listener
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

  // Notifications listener
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    async function loadNotifications() {
      const { data } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);

      if (data) setNotifications(data);
    }

    loadNotifications();
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Search debouncing
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      const { data } = await supabase
        .from('series')
        .select('id, slug, title, cover_image_url, reading_mode')
        .ilike('title', `%${query.trim()}%`)
        .limit(6);

      setResults(data || []);
      setLoadingSearch(false);
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Strict Gmail Magic Link verification
  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = authEmail.trim().toLowerCase();

    const isStrictGmail = /^[a-z0-9](\.?[a-z0-9]){5,}@gmail\.com$/.test(cleanEmail);
    if (!isStrictGmail) {
      setAuthError('Only verified personal @gmail.com accounts are permitted.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    const redirectUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://mangaflow-psi.vercel.app';

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { emailRedirectTo: redirectUrl },
    });

    if (error) {
      setAuthError(error.message);
    } else {
      setAuthSent(true);
    }
    setAuthLoading(false);
  };

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
      data: {
        display_name: displayName.trim(),
        avatar_url: selectedAvatar,
      },
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
        
        {/* PWA App Install Slide-Down Banner */}
        {showPwaBanner && (
          <aside aria-label="Install App" className="sticky top-0 z-50 bg-gradient-to-r from-indigo-900/90 via-violet-900/90 to-neutral-900/90 border-b border-indigo-500/30 px-4 py-2 flex items-center justify-between text-xs backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center font-black text-white text-[11px]">M</span>
              <span className="text-white font-semibold">Install MangaFlow for faster offline reading</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallPwa}
                className="px-3 py-1 bg-white text-neutral-950 font-bold rounded-lg hover:bg-neutral-200 transition text-[11px]"
              >
                Install
              </button>
              <button
                type="button"
                onClick={() => setShowPwaBanner(false)}
                className="text-neutral-400 hover:text-white px-1.5"
              >
                ✕
              </button>
            </div>
          </aside>
        )}

        {(menuOpen || searchOpen) && (
          <div
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          />
        )}

        {/* Top Navbar */}
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

              <Link href="/" className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-xs shadow-md shadow-indigo-500/20">
                  M
                </span>
                <span className="text-base sm:text-lg font-black tracking-tight text-white">
                  Manga<span className="text-indigo-400">Flow</span>
                </span>
              </Link>

              {menuOpen && (
                <div className="absolute top-12 left-0 w-48 bg-[#151822] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50">
                  <Link
                    href="/"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    Home
                  </Link>
                  <Link
                    href="/category/trending"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    <span>🔥</span> Trending Series
                  </Link>
                  <Link
                    href="/category/popular"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    <span>⭐</span> Popular Series
                  </Link>
                  <Link
                    href="/category/latest"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    Latest Releases
                  </Link>
                  <div className="my-1 border-t border-neutral-700/60" />
                  <Link
                    href="/filter"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-neutral-800/70 transition"
                  >
                    Filter & Browse
                  </Link>
                </div>
              )}
            </div>

            {/* Right: Search, Notifications, Avatar */}
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

              {/* Notification Bell Button with Unread Pulse */}
              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                className="relative p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                )}
              </button>

              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full overflow-hidden border border-indigo-400/50 shadow-sm hover:scale-105 transition bg-neutral-800 flex items-center justify-center"
                    aria-label="User Account"
                  >
                    {currentAvatarUrl ? (
                      <img src={currentAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-xs text-indigo-300">
                        {currentDisplayName[0].toUpperCase()}
                      </span>
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
                        <span>★</span> Following Titles
                      </Link>

                      <Link
                        href="/profile/sync"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>🔄</span> Import / Export
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
                  onClick={() => {
                    setAuthSent(false);
                    setAuthError(null);
                    setAuthOpen(true);
                  }}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-md shadow-sm transition"
                >
                  Sign In
                </button>
              )}
            </div>

          </div>
        </header>

        {/* Live Notification Drawer */}
        {notifOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
            <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[75vh]">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Notifications {unreadCount > 0 && `(${unreadCount})`}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[10px] text-indigo-400 hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-neutral-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto divide-y divide-neutral-800/60 py-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-8 text-xs text-neutral-500">
                    No updates yet. Follow titles with ★ to receive chapter alerts!
                  </div>
                ) : (
                  notifications.map((item) => (
                    <Link
                      key={item.id}
                      href={`/read/${item.chapter_id}`}
                      onClick={() => setNotifOpen(false)}
                      className={`block p-2.5 rounded-xl transition ${
                        item.is_read ? 'hover:bg-neutral-800/40 opacity-70' : 'bg-indigo-600/10 hover:bg-indigo-600/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className="text-xs font-bold text-neutral-200 truncate">{item.title}</h4>
                        <span className="text-[9px] text-neutral-500 shrink-0">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400">{item.message}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {editProfileOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-[#141722] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <h3 className="text-sm font-bold text-white">Customize Profile</h3>
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-neutral-400 block mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter reader username..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-neutral-400 block mb-2">
                    Select Anime / Manhwa Avatar
                  </label>
                  <div className="grid grid-cols-4 gap-2.5">
                    {CHARACTER_AVATARS.map((av) => (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setSelectedAvatar(av.url)}
                        title={av.name}
                        className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${
                          selectedAvatar === av.url
                            ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-500/40'
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-bold text-xs text-white rounded-lg transition"
                >
                  {savingProfile ? 'Saving Changes...' : 'Save Profile'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Strict Gmail Authentication Modal */}
        {authOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <h3 className="text-sm font-bold text-white">
                  {authSent ? 'Check Your Inbox' : 'Sign In With Gmail'}
                </h3>
                <button
                  type="button"
                  onClick={() => setAuthOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {authSent ? (
                <div className="text-center py-3 space-y-3">
                  <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <p className="text-xs text-neutral-300">
                    A sign-in link has been sent to <br />
                    <span className="text-white font-semibold">{authEmail}</span>.
                  </p>
                  <p className="text-[11px] text-neutral-400">
                    Click the link in your email to log in automatically.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthSent(false);
                      setAuthEmail('');
                    }}
                    className="text-xs text-indigo-400 hover:underline pt-2 block mx-auto"
                  >
                    Use another email
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendMagicLink} className="space-y-3">
                  <p className="text-xs text-neutral-400">
                    Only authentic personal <span className="text-white font-semibold">@gmail.com</span> accounts are supported for reading progress backup.
                  </p>

                  {authError && (
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                      {authError}
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                      Gmail Address
                    </label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="username@gmail.com"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-lg transition"
                  >
                    {authLoading ? 'Verifying & Sending...' : 'Send Magic Link'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Floating Search Bar */}
        {searchOpen && (
          <div className="sticky top-14 z-40 w-full px-3 sm:px-6 max-w-lg mx-auto">
            <div className="bg-[#151824] border border-neutral-700 rounded-xl shadow-2xl overflow-hidden mt-2">
              <div className="flex items-center px-3 py-2 gap-2 border-b border-neutral-800 bg-[#12141d]">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search series title..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-neutral-500 focus:outline-none"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-white text-xs px-1">
                    ✕
                  </button>
                )}
              </div>

              {query && (
                <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/60 bg-[#151824]">
                  {loadingSearch && (
                    <div className="p-3 text-center text-xs text-neutral-400">Searching...</div>
                  )}

                  {!loadingSearch && results.map((item) => (
                    <Link
                      key={item.id}
                      href={`/series/${item.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800/60 transition group"
                    >
                      <div className="w-9 h-12 rounded overflow-hidden bg-neutral-900 shrink-0">
                        <img
                          src={item.cover_image_url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 truncate">
                          {item.title}
                        </h4>
                        <span className="text-[10px] text-neutral-400 uppercase font-medium">
                          {item.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                        </span>
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
      </body>
    </html>
  );
}
