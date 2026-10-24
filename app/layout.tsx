'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import AuthModal from '../components/AuthModal';
import './globals.css';

interface UserProfile {
  id: string;
  email?: string;
  user_metadata?: {
    avatar_url?: string;
    full_name?: string;
  };
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  cover_url?: string;
  read: boolean;
  created_at: string;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Navigation & UI States
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'all' | 'unread' | 'read'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // 1. PWA Service Worker Registration & Install Event Listener
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('ServiceWorker registration error:', err);
      });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  // 2. Supabase Auth State Listener
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    }
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 3. Dropdown & Search Outside Click Listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 4. Live Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const cleanTerm = searchQuery.trim().replace(/['"]/g, '');
      const { data } = await supabase
        .from('series')
        .select('id, title, english_title, slug, cover_image_url, cover_url, reading_mode')
        .or(`title.ilike.%${cleanTerm}%,english_title.ilike.%${cleanTerm}%`)
        .limit(6);

      setSearchResults(data || []);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Focus search input when toggled open
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  // 5. Global Hotkeys
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setDrawerOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
        setAuthModalOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredNotifications = notifications.filter((n) => {
    if (notifTab === 'unread') return !n.read;
    if (notifTab === 'read') return n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserMenuOpen(false);
    router.push('/');
  };

  return (
    <html lang="en" className="dark scroll-smooth overflow-x-hidden">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>MangaFlow - High Performance Comic Reader</title>
        <meta name="description" content="Read trending and popular manga, manhwa, and manhua with instant high-speed chapters." />
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0e1015" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>

      <body className="bg-[#0e1015] text-neutral-200 antialiased min-h-screen w-full max-w-full overflow-x-hidden flex flex-col selection:bg-indigo-500/20 selection:text-indigo-300">
        
        {/* PWA INSTALL BANNER */}
        {showInstallBanner && (
          <div className="bg-indigo-600/95 text-white px-4 py-2 text-xs flex items-center justify-between z-50 sticky top-0 shadow-md">
            <div className="flex items-center gap-2">
              <span className="text-sm">📱</span>
              <span className="font-semibold">Install MangaFlow App for fullscreen reading</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={triggerPwaInstall}
                className="bg-white text-indigo-600 font-bold px-3 py-1 rounded-md text-[11px] shadow hover:bg-neutral-100 transition"
              >
                Install
              </button>
              <button
                onClick={() => setShowInstallBanner(false)}
                className="text-white/80 hover:text-white text-sm px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* MANGAFIRE HEADER BAR */}
        <header className="sticky top-0 z-40 bg-[#0e1015]/95 backdrop-blur-md border-b border-neutral-800/80 px-3 sm:px-6 py-2.5 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            
            {/* Left: Hamburger Drawer Trigger & Text-Only Logo */}
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={() => setDrawerOpen(true)}
                className="p-1.5 text-neutral-400 hover:text-white transition rounded-lg hover:bg-neutral-800/60"
                aria-label="Open Navigation Drawer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <Link href="/" className="flex items-center">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Manga<span className="text-indigo-500">Flow</span>
                </span>
              </Link>
            </div>

            {/* Right: Floating Search Icon, Notifications, Profile / Sign In */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Floating Search Toggle Button */}
              <button
                onClick={() => setSearchOpen(!searchOpen)}
                className={`p-2 rounded-xl transition ${
                  searchOpen ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:text-white hover:bg-neutral-800/80'
                }`}
                aria-label="Toggle Search"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Notification Center Popup */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="p-2 rounded-xl text-neutral-300 hover:text-white hover:bg-neutral-800/80 transition relative"
                  aria-label="Notifications"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-[#0e1015]" />
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 sm:right-auto sm:left-auto top-full mt-2 w-80 max-w-[90vw] bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-neutral-800/80 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Notifications</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={markAllNotificationsAsRead}
                          className="text-[10px] text-neutral-400 hover:text-neutral-200 transition"
                        >
                          Mark all read
                        </button>
                        <Link
                          href="/notifications"
                          onClick={() => setNotifOpen(false)}
                          className="text-[10px] text-indigo-400 hover:underline font-semibold"
                        >
                          Full page →
                        </Link>
                      </div>
                    </div>

                    <div className="flex border-b border-neutral-800 text-[11px] font-semibold bg-neutral-950/60">
                      {(['all', 'unread', 'read'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setNotifTab(tab)}
                          className={`flex-1 py-1.5 capitalize transition ${
                            notifTab === tab
                              ? 'text-indigo-400 border-b-2 border-indigo-400 bg-neutral-900/60'
                              : 'text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/60">
                      {filteredNotifications.length === 0 ? (
                        <div className="py-8 text-center text-xs text-neutral-500">
                          No {notifTab !== 'all' ? notifTab : ''} notifications.
                        </div>
                      ) : (
                        filteredNotifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3 flex items-start gap-3 transition ${
                              !n.read ? 'bg-indigo-500/10' : 'hover:bg-neutral-900/40'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white truncate">{n.title}</p>
                              <p className="text-[11px] text-neutral-400 line-clamp-2 mt-0.5">{n.message}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Avatar Menu or Sign In */}
              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full bg-indigo-600 border border-indigo-400 text-white font-black text-xs flex items-center justify-center hover:opacity-90 transition shadow-sm"
                    aria-label="User Menu"
                  >
                    {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 p-1.5 bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl z-50 text-xs divide-y divide-neutral-800/80">
                      <div className="px-3 py-2">
                        <p className="text-[10px] text-neutral-400">Signed in as</p>
                        <p className="font-bold text-white truncate">{user.email}</p>
                      </div>

                      <div className="py-1">
                        <Link
                          href="/profile/edit"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800/80 flex items-center gap-2 transition"
                        >
                          <span>👤</span> Profile Edit
                        </Link>
                        <Link
                          href="/profile/following"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800/80 flex items-center gap-2 transition"
                        >
                          <span>📚</span> Library Tracker
                        </Link>
                        <Link
                          href="/notifications"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800/80 flex items-center gap-2 transition"
                        >
                          <span>🔔</span> Notifications
                        </Link>
                        <Link
                          href="/profile/import-export"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800/80 flex items-center gap-2 transition"
                        >
                          <span>🔄</span> Import / Export
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full text-left px-3 py-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800/80 flex items-center gap-2 transition"
                        >
                          <span>⚙️</span> Settings
                        </Link>
                      </div>

                      <div className="pt-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left px-3 py-2 rounded-lg text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition font-semibold"
                        >
                          <span>🚪</span> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-md"
                >
                  Sign In
                </button>
              )}

            </div>
          </div>

          {/* MANGAFIRE FLOATING SEARCH PILL */}
          {searchOpen && (
            <div
              ref={searchContainerRef}
              className="max-w-2xl mx-auto mt-2 pt-1 transition-all duration-200"
            >
              <div className="relative flex items-center bg-[#13151f] border border-neutral-700/80 rounded-2xl px-3 py-2 shadow-2xl">
                <span className="text-neutral-400 text-sm mr-2">🔍</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search manga, manhwa, titles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-neutral-400 hover:text-white text-xs mr-2"
                  >
                    ✕
                  </button>
                )}
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white bg-neutral-800 px-2 py-1 rounded-md"
                >
                  Esc
                </button>
              </div>

              {/* Floating Live Search Dropdown */}
              {(isSearching || searchResults.length > 0 || searchQuery.trim()) && (
                <div className="mt-1 bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-neutral-800/60 z-50">
                  {isSearching ? (
                    <div className="py-4 text-center text-xs text-neutral-400">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="py-4 text-center text-xs text-neutral-400">No results found</div>
                  ) : (
                    searchResults.map((s) => {
                      const cover = s.cover_image_url || s.cover_url || '';
                      return (
                        <Link
                          key={s.id}
                          href={`/series/${s.slug}`}
                          onClick={() => setSearchOpen(false)}
                          className="p-2.5 hover:bg-neutral-800/60 flex items-center gap-3 transition"
                        >
                          {cover ? (
                            <img
                              src={cover}
                              alt=""
                              className="w-9 h-12 object-cover rounded bg-neutral-900 shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-12 rounded bg-neutral-900 flex items-center justify-center text-xs text-neutral-600 shrink-0">
                              📖
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate hover:text-indigo-400">
                              {s.english_title || s.title}
                            </p>
                            <span className="text-[10px] uppercase font-bold text-neutral-500 mt-0.5 inline-block">
                              {s.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
                            </span>
                          </div>
                        </Link>
                      );
                    })
                  )}

                  {searchResults.length > 0 && (
                    <Link
                      href={`/filter?q=${encodeURIComponent(searchQuery)}`}
                      onClick={() => setSearchOpen(false)}
                      className="block text-center py-2 text-xs font-bold text-indigo-400 hover:bg-neutral-800/80 transition"
                    >
                      View all results →
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        {/* MANGAFIRE OFF-CANVAS HAMBURGER DRAWER */}
        {drawerOpen && (
          <div className="fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] bg-[#0e1015] border-r border-neutral-800 h-full p-5 flex flex-col z-10 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                <span className="text-lg font-black text-white">
                  Manga<span className="text-indigo-500">Flow</span>
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              <nav className="py-4 space-y-1.5 flex-1">
                <Link
                  href="/trending"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    pathname === '/trending' ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <span>🔥</span> Trending Series
                </Link>
                <Link
                  href="/popular"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    pathname === '/popular' ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <span>⭐</span> Popular Series
                </Link>
                <Link
                  href="/filter"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    pathname.startsWith('/filter') ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <span>🏷️</span> Filter Series (24+ Genres)
                </Link>
                <Link
                  href="/latest"
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                    pathname === '/latest' ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <span>⚡</span> Latest Releases
                </Link>
              </nav>

              <div className="pt-4 border-t border-neutral-800 text-xs text-neutral-500">
                <span>MangaFlow Platform Engine</span>
              </div>
            </div>
          </div>
        )}

        {/* AUTHENTICATION MODAL */}
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {/* MAIN APPLICATION VIEWPORT */}
        <div className="flex-1 flex flex-col w-full max-w-full overflow-x-hidden min-w-0">
          {children}
        </div>

        {/* GLOBAL FOOTER */}
        <footer className="border-t border-neutral-900 bg-[#07070a] py-8 px-4 text-xs text-neutral-500">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-400">MangaFlow</span>
              <span>— Graphic Comic Platform Engine</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/filter" className="hover:text-neutral-300 transition">Filter Directory</Link>
              <Link href="/trending" className="hover:text-neutral-300 transition">Trending</Link>
              <Link href="/popular" className="hover:text-neutral-300 transition">Popular</Link>
              <Link href="/latest" className="hover:text-neutral-300 transition">Latest</Link>
            </div>
          </div>
        </footer>

      </body>
    </html>
  );
}
