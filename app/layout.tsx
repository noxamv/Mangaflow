// app/layout.tsx
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
    avatar_url?: string | null;
    display_name?: string;
    full_name?: string;
  };
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  chapter_id?: string;
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
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);
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

  // References for Outside Click Detection
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Hide Navbar & Footer in Reader View
  const isReaderPage = pathname?.startsWith('/read/');

  // Initial Auth Session Check
  useEffect(() => {
    async function checkUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    }
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Click Outside to Dismiss Panels
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
        setMenuDropdownOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global Keyboard Shortcuts (Ctrl/Cmd + K for Search, Esc to Close)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMenuDropdownOpen(false);
        setUserMenuOpen(false);
        setNotifOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus Input Field When Search Opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [searchOpen]);

  // Live Catalog Search Debounce
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
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // PWA Install Prompt Handler
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleMarkAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (notifTab === 'unread') return !n.read;
    if (notifTab === 'read') return n.read;
    return true;
  });

  return (
    <html lang="en" className="dark bg-[#0a0b0e] text-neutral-100 antialiased selection:bg-indigo-600 selection:text-white">
      <head>
        <title>MangaFlow - Read Manga & Manhwa Online</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="min-h-screen flex flex-col font-sans bg-[#0a0b0e] text-neutral-100">
        
        {/* Render Global Navbar only if not in Reader View */}
        {!isReaderPage && (
          <header className="sticky top-0 z-50 bg-[#0e1015]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 lg:px-8 py-3 transition-colors">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              
              {/* Left: Hamburger Menu on FAR LEFT, followed by MangaFlow */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Mobile / Quick Dropdown Menu Trigger */}
                <div ref={menuDropdownRef} className="relative md:hidden">
                  <button
                    onClick={() => setMenuDropdownOpen(!menuDropdownOpen)}
                    className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition flex items-center justify-center"
                    aria-label="Navigation Menu"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  {menuDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-48 bg-[#13151f] border border-neutral-800 rounded-2xl p-1.5 shadow-2xl z-50 text-xs font-semibold space-y-0.5">
                      <Link
                        href="/"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        Home
                      </Link>
                      <Link
                        href="/latest"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        Latest Releases
                      </Link>
                      <Link
                        href="/popular"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        Popular Comics
                      </Link>
                      <Link
                        href="/trending"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        Trending
                      </Link>
                      <Link
                        href="/filter"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        Filter & Search
                      </Link>
                    </div>
                  )}
                </div>

                {/* Brand Name (Without the [ M ] box) */}
                <Link href="/" className="flex items-center gap-1.5 group">
                  <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent group-hover:text-white transition-colors">
                    MangaFlow
                  </span>
                </Link>

                {/* Desktop Global Links */}
                <nav className="hidden md:flex items-center gap-1 ml-4 text-xs font-semibold text-neutral-400">
                  <Link href="/" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Home
                  </Link>
                  <Link href="/latest" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Latest
                  </Link>
                  <Link href="/popular" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Popular
                  </Link>
                  <Link href="/trending" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Trending
                  </Link>
                  <Link href="/filter" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Browse
                  </Link>
                </nav>
              </div>

              {/* Right: Floating Search Icon, Notifications, Profile / Sign In */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className={`p-2 rounded-xl border border-neutral-800/80 transition flex items-center justify-center ${
                    searchOpen ? 'bg-indigo-600 text-white' : 'text-neutral-300 hover:text-white hover:bg-neutral-800/80'
                  }`}
                  aria-label="Toggle Search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Notifications Panel */}
                <div ref={notifRef} className="relative">
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="p-2 rounded-xl border border-neutral-800/80 text-neutral-300 hover:text-white hover:bg-neutral-800/80 transition relative flex items-center justify-center"
                    aria-label="Notifications"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center shadow-md shadow-indigo-600/40">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs">
                      <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                        <span className="font-bold text-white">Notifications</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleMarkAllAsRead}
                            className="text-[10px] text-indigo-400 hover:underline font-semibold"
                          >
                            Mark all read
                          </button>
                        </div>
                      </div>

                      <div className="flex border-b border-neutral-800 bg-neutral-900/40 text-[11px]">
                        <button
                          onClick={() => setNotifTab('all')}
                          className={`flex-1 py-1.5 font-bold text-center border-b-2 transition ${
                            notifTab === 'all'
                              ? 'border-indigo-500 text-white'
                              : 'border-transparent text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setNotifTab('unread')}
                          className={`flex-1 py-1.5 font-bold text-center border-b-2 transition ${
                            notifTab === 'unread'
                              ? 'border-indigo-500 text-white'
                              : 'border-transparent text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          Unread ({unreadCount})
                        </button>
                        <button
                          onClick={() => setNotifTab('read')}
                          className={`flex-1 py-1.5 font-bold text-center border-b-2 transition ${
                            notifTab === 'read'
                              ? 'border-indigo-500 text-white'
                              : 'border-transparent text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          Read
                        </button>
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-neutral-800/40">
                        {filteredNotifications.length === 0 ? (
                          <div className="py-8 text-center text-neutral-500 text-xs">
                            No notifications in this view
                          </div>
                        ) : (
                          filteredNotifications.map((n) => (
                            <div
                              key={n.id}
                              onClick={() => handleMarkAsRead(n.id)}
                              className={`p-3 hover:bg-neutral-800/40 transition cursor-pointer flex flex-col gap-1 ${
                                !n.read ? 'bg-indigo-950/20' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-neutral-200">{n.title}</span>
                                <span className="text-[10px] text-neutral-500">
                                  {new Date(n.created_at).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              <p className="text-[11px] text-neutral-400">{n.message}</p>
                              {n.chapter_id && (
                                <Link
                                  href={`/read/${n.chapter_id}`}
                                  className="text-[10px] font-bold text-indigo-400 hover:underline mt-1 inline-block"
                                >
                                  Open Chapter →
                                </Link>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* User Authentication Menu Button */}
                {user ? (
                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center font-bold text-xs text-white overflow-hidden shadow-sm"
                      aria-label="User Account Menu"
                    >
                      {user.user_metadata?.avatar_url ? (
                        <img
                          src={user.user_metadata.avatar_url}
                          alt="Profile Avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        user.email?.[0]?.toUpperCase() || 'U'
                      )}
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-[#13151f] border border-neutral-800 rounded-2xl p-1.5 shadow-2xl z-50 text-xs font-semibold space-y-0.5">
                        <Link
                          href="/profile/edit"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Profile Details
                        </Link>
                        <Link
                          href="/profile/following"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Bookmarks & Follows
                        </Link>
                        <Link
                          href="/profile/sync"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Sync State & Clouds
                        </Link>
                        <Link
                          href="/profile/import-export"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Backup / Export
                        </Link>
                        <Link
                          href="/settings"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Settings
                        </Link>
                        <div className="h-px bg-neutral-800 my-1" />
                        <button
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setUserMenuOpen(false);
                            router.push('/');
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-400 hover:text-red-300 transition"
                        >
                          Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setAuthModalOpen(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Global Floating Search Modal Overlay */}
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
            <div
              ref={searchContainerRef}
              className="relative w-full max-w-xl bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
            >
              <div className="p-3.5 border-b border-neutral-800 flex items-center gap-2.5">
                <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search series title, alternative name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-neutral-900 border border-neutral-800 transition"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/40 p-2">
                {isSearching ? (
                  <div className="py-8 text-center text-xs text-neutral-500">Searching catalog...</div>
                ) : searchResults.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500">
                    {searchQuery.trim() ? 'No series found matching query.' : 'Type to search across indexed titles.'}
                  </div>
                ) : (
                  searchResults.map((s) => (
                    <Link
                      key={s.id}
                      href={`/series/${s.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="p-2.5 rounded-xl hover:bg-neutral-800/50 flex items-center gap-3 transition group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition truncate">
                          {s.english_title || s.title}
                        </p>
                        <p className="text-[10px] text-neutral-400 capitalize">
                          {s.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Auth Modal Trigger */}
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {/* Main Content Area */}
        <main className="flex-1">{children}</main>

        {/* Global Footer */}
        {!isReaderPage && (
          <footer className="border-t border-neutral-800/80 bg-[#090a0d] py-8 px-4 text-center text-xs text-neutral-500">
            <div className="max-w-7xl mx-auto space-y-2">
              <p className="font-semibold text-neutral-400">MangaFlow &copy; {new Date().getFullYear()} — Free Online Manga & Manhwa Reader</p>
              <p className="text-[11px] text-neutral-600">Disclaimer: MangaFlow does not store any files on its servers. All contents are scraped from third-party sources.</p>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
