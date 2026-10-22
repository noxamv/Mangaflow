'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import './globals.css';

interface UserProfile {
  id: string;
  email?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  cover_url?: string;
  read: boolean;
  created_at: string;
}

const GENRE_LIST = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy',
  'Horror', 'Isekai', 'Martial Arts', 'Mecha', 'Mystery',
  'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller', 'Tragedy', 'Historical', 'School Life',
  'Shounen', 'Shoujo', 'Seinen', 'Josei'
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [genresDropdownOpen, setGenresDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'all' | 'unread' | 'read'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setGenresDropdownOpen(false);
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
        .select('id, title, english_title, slug, cover_url, reading_mode')
        .or(`title.ilike.%${cleanTerm}%,english_title.ilike.%${cleanTerm}%`)
        .limit(8);

      setSearchResults(data || []);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
        setGenresDropdownOpen(false);
        setUserMenuOpen(false);
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
      </head>

      <body className="bg-[#090a0d] text-neutral-200 antialiased min-h-screen w-full max-w-full overflow-x-hidden flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
        
        {/* TOP NAVIGATION BAR */}
        <header className="sticky top-0 z-40 bg-[#090a0d]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 lg:px-8 py-3 transition-colors">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-black font-black text-lg tracking-tighter shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
                  M
                </div>
                <span className="font-extrabold text-base tracking-tight text-white group-hover:text-amber-400 transition-colors">
                  Manga<span className="text-amber-400">Flow</span>
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                <Link
                  href="/trending"
                  className={`px-3 py-1.5 rounded-lg transition ${
                    pathname === '/trending' ? 'text-amber-400 bg-neutral-900' : 'hover:text-white hover:bg-neutral-900/60'
                  }`}
                >
                  Trending
                </Link>
                <Link
                  href="/popular"
                  className={`px-3 py-1.5 rounded-lg transition ${
                    pathname === '/popular' ? 'text-amber-400 bg-neutral-900' : 'hover:text-white hover:bg-neutral-900/60'
                  }`}
                >
                  Popular
                </Link>
                <Link
                  href="/latest"
                  className={`px-3 py-1.5 rounded-lg transition ${
                    pathname === '/latest' ? 'text-amber-400 bg-neutral-900' : 'hover:text-white hover:bg-neutral-900/60'
                  }`}
                >
                  Latest
                </Link>

                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setGenresDropdownOpen(!genresDropdownOpen)}
                    className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
                      genresDropdownOpen || pathname.startsWith('/filter')
                        ? 'text-amber-400 bg-neutral-900'
                        : 'hover:text-white hover:bg-neutral-900/60'
                    }`}
                  >
                    <span>Browse</span>
                    <span className="text-[10px]">{genresDropdownOpen ? '▲' : '▼'}</span>
                  </button>

                  {genresDropdownOpen && (
                    <div className="absolute top-full left-0 mt-2 w-72 p-3 bg-[#0d0e14] border border-neutral-800 rounded-xl shadow-2xl z-50 grid grid-cols-2 gap-1 animate-in fade-in zoom-in-95 duration-100">
                      <Link
                        href="/filter"
                        onClick={() => setGenresDropdownOpen(false)}
                        className="col-span-2 text-center py-1.5 mb-1 text-[11px] font-bold text-amber-400 bg-amber-400/10 rounded-lg hover:bg-amber-400/20 border border-amber-400/20"
                      >
                        All Filters & Genres (24+)
                      </Link>
                      {GENRE_LIST.map((genre) => (
                        <Link
                          key={genre}
                          href={`/filter?genre=${encodeURIComponent(genre.toLowerCase())}`}
                          onClick={() => setGenresDropdownOpen(false)}
                          className="px-2.5 py-1.5 text-[11px] text-neutral-300 hover:text-white hover:bg-neutral-800/80 rounded-md transition truncate"
                        >
                          {genre}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800/90 border border-neutral-800 text-neutral-400 text-xs transition"
              >
                <span>🔍</span>
                <span className="hidden sm:inline">Search manga...</span>
                <kbd className="hidden lg:inline-block ml-2 text-[10px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">
                  ⌘K
                </kbd>
              </button>

              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifOpen(!notifOpen)}
                  className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white transition relative"
                  aria-label="Notifications"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#090a0d]" />
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#0d0e14] border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col">
                    <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Notifications</span>
                      <button
                        onClick={markAllNotificationsAsRead}
                        className="text-[10px] text-neutral-400 hover:text-neutral-200 transition"
                      >
                        Mark all read
                      </button>
                    </div>

                    <div className="flex border-b border-neutral-800 text-[11px] font-semibold bg-neutral-950/60">
                      {(['all', 'unread', 'read'] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setNotifTab(tab)}
                          className={`flex-1 py-1.5 capitalize transition ${
                            notifTab === tab
                              ? 'text-amber-400 border-b-2 border-amber-400 bg-neutral-900/60'
                              : 'text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-neutral-800/60 scrollbar-thin">
                      {filteredNotifications.length === 0 ? (
                        <div className="py-8 text-center text-xs text-neutral-500">
                          No notifications.
                        </div>
                      ) : (
                        filteredNotifications.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3 flex items-start gap-3 transition ${
                              !n.read ? 'bg-amber-500/5' : 'hover:bg-neutral-900/40'
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

              {user ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 hover:border-amber-400/80 transition flex items-center justify-center overflow-hidden focus:outline-none"
                    aria-label="User Menu"
                  >
                    <svg className="w-4 h-4 text-neutral-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-52 p-1.5 bg-[#0d0e14] border border-neutral-800 rounded-xl shadow-2xl z-50 text-xs">
                      <div className="px-3 py-2 border-b border-neutral-800/80 mb-1">
                        <p className="text-[11px] text-neutral-400">Signed in as</p>
                        <p className="font-semibold text-white truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2"
                      >
                        Profile
                      </Link>
                      <Link
                        href="/profile/following"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2"
                      >
                        Following List
                      </Link>
                      <Link
                        href="/profile/import-export"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2"
                      >
                        Import / Export
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 flex items-center gap-2"
                      >
                        Settings
                      </Link>
                      <div className="border-t border-neutral-800/80 my-1" />
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition"
                      >
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs transition"
                >
                  Sign In
                </Link>
              )}

            </div>
          </div>
        </header>

        {/* SEARCH OVERLAY MODAL */}
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
            <div className="relative w-full max-w-xl bg-[#0d0e14] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col">
              <div className="p-3 border-b border-neutral-800 flex items-center gap-2.5">
                <span className="text-neutral-400 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search series title, alternative name, or author..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full bg-transparent text-sm text-white placeholder-neutral-500 focus:outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-neutral-900 border border-neutral-800"
                >
                  ESC
                </button>
              </div>

              <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/50 p-2">
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
                      className="p-2.5 rounded-xl hover:bg-neutral-900 flex items-center gap-3 transition group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white group-hover:text-amber-400 transition truncate">
                          {s.english_title || s.title}
                        </p>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

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
              <Link href="/filter" className="hover:text-neutral-300 transition">Catalog Directory</Link>
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
