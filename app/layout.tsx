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

  const [user, setUser] = useState<UserProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [menuDropdownOpen, setMenuDropdownOpen] = useState(false);

  // MangaFire-Style Inline Search States
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // MangaFire-Style Notification States
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isReadingPage = pathname?.startsWith('/read/');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser((session?.user as UserProfile) || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser((session?.user as UserProfile) || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) setNotifications(data);
    }

    fetchNotifications();
  }, [user]);

  // Click Outside to Dismiss
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
        setMenuDropdownOpen(false);
      }
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

  // Fast Live Search Query
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('series')
        .select('id, title, slug, cover_url, cover_image_url, reading_mode')
        .ilike('title', `%${q}%`)
        .limit(6);

      setSearchResults(data || []);
      setIsSearching(false);
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <html lang="en" className="dark scroll-smooth overflow-x-hidden">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>MangaFlow - Read Free Manga Online</title>
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0e1015" />
      </head>

      <body className="bg-[#0e1015] text-neutral-200 antialiased min-h-screen w-full max-w-full overflow-x-hidden flex flex-col selection:bg-indigo-500/20 selection:text-indigo-300">
        {!isReadingPage && (
          <header className="sticky top-0 z-50 bg-[#0e1015]/98 backdrop-blur-md border-b border-neutral-800/80 transition-colors">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2.5 flex items-center justify-between gap-4">
              {/* Left Side: Mobile Menu & Logo */}
              <div className="flex items-center gap-3">
                <div ref={menuDropdownRef} className="relative md:hidden">
                  <button
                    onClick={() => setMenuDropdownOpen(!menuDropdownOpen)}
                    className="p-1.5 rounded-lg text-neutral-300 hover:text-white transition"
                    aria-label="Navigation Menu"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  {/* Clean Drawer Menu */}
                  {menuDropdownOpen && (
                    <div className="absolute left-0 mt-2 w-52 bg-[#13151f] border border-neutral-800 rounded-2xl p-2 shadow-2xl z-50 text-xs font-semibold space-y-1">
                      <Link
                        href="/"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        <span>🏠</span> Home
                      </Link>
                      <Link
                        href="/trending"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        <span>🔥</span> Trending
                      </Link>
                      <Link
                        href="/popular"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        <span>⭐</span> Popular
                      </Link>
                      <Link
                        href="/latest"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        <span>⚡</span> Latest Releases
                      </Link>
                      <div className="h-px bg-neutral-800 my-1" />
                      <Link
                        href="/filter"
                        onClick={() => setMenuDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                      >
                        <span>🔍</span> Browse All Comics
                      </Link>
                    </div>
                  )}
                </div>

                <Link href="/" className="flex items-center gap-1.5 group">
                  <span className="font-extrabold text-xl tracking-tight text-white group-hover:text-indigo-400 transition-colors">
                    MangaFlow
                  </span>
                </Link>

                <nav className="hidden md:flex items-center gap-1 ml-4 text-xs font-semibold text-neutral-400">
                  <Link href="/" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Home
                  </Link>
                  <Link href="/trending" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Trending
                  </Link>
                  <Link href="/popular" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Popular
                  </Link>
                  <Link href="/latest" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Latest
                  </Link>
                  <Link href="/filter" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition">
                    Browse
                  </Link>
                </nav>
              </div>

              {/* Right Side Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className={`p-2 rounded-xl transition ${
                    searchOpen ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/80'
                  }`}
                  aria-label="Search"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Notifications Dropdown (MangaFire Style) */}
                <div ref={notifRef} className="relative">
                  <button
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/80 transition relative"
                    aria-label="Notifications"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 shadow-md shadow-indigo-500/50" />
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in duration-150">
                      <div className="p-3.5 border-b border-neutral-800 flex items-center justify-between">
                        <span className="font-bold text-white text-sm">Notifications</span>
                        <button
                          onClick={handleMarkAllAsRead}
                          className="text-xs text-sky-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <span>✓</span> Mark as read
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/50">
                        {notifications.length === 0 ? (
                          <div className="py-8 text-center text-neutral-500 text-xs">
                            You're all caught up.
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <Link
                              key={n.id}
                              href={n.chapter_id ? `/read/${n.chapter_id}` : '/notifications'}
                              onClick={() => setNotifOpen(false)}
                              className={`p-3 flex items-start gap-3 hover:bg-neutral-800/40 transition block ${
                                !n.read ? 'bg-indigo-950/20' : ''
                              }`}
                            >
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <p className="font-bold text-white truncate text-xs">{n.title}</p>
                                <p className="text-[11px] text-neutral-400 line-clamp-1">{n.message}</p>
                              </div>
                            </Link>
                          ))
                        )}
                      </div>

                      <Link
                        href="/notifications"
                        onClick={() => setNotifOpen(false)}
                        className="block w-full py-2.5 text-center text-xs font-bold text-sky-400 hover:bg-neutral-800/60 border-t border-neutral-800 transition"
                      >
                        View all notifications
                      </Link>
                    </div>
                  )}
                </div>

                {/* User Menu */}
                {user ? (
                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center font-bold text-xs text-white overflow-hidden shadow-sm"
                      aria-label="User Account Menu"
                    >
                      {user.email?.[0]?.toUpperCase() || 'U'}
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-[#13151f] border border-neutral-800 rounded-2xl p-1.5 shadow-2xl z-50 text-xs font-semibold space-y-0.5">
                        <Link
                          href="/profile/following"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          My Library
                        </Link>
                        <Link
                          href="/profile/sync"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Sync AniList / MAL
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

            {/* MangaFire-Style Inline Dropdown Search Bar */}
            {searchOpen && (
              <div
                ref={searchContainerRef}
                className="border-t border-neutral-800/80 bg-[#10121a] px-4 py-2.5 animate-in slide-in-from-top-2 duration-150 relative"
              >
                <div className="max-w-2xl mx-auto relative">
                  <div className="flex items-center gap-2 bg-[#181a24] border border-neutral-700/80 rounded-xl px-3 py-2 focus-within:border-indigo-500 transition">
                    <span className="text-neutral-400 text-sm">🔍</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search titles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-white text-xs sm:text-sm focus:outline-none placeholder-neutral-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-neutral-400 hover:text-white text-xs px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {searchQuery.trim() && (
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#141620] border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden text-xs max-h-80 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-neutral-900/60 text-[10px] font-black uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                        RESULTS
                      </div>

                      {isSearching ? (
                        <div className="py-6 text-center text-xs text-neutral-500 animate-pulse">
                          Searching...
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((item) => (
                          <Link
                            key={item.id}
                            href={`/series/${item.slug}`}
                            onClick={() => setSearchOpen(false)}
                            className="p-2.5 flex items-center gap-3 hover:bg-neutral-800/60 border-b border-neutral-800/40 transition group"
                          >
                            <div className="w-9 h-12 rounded-lg bg-neutral-900 overflow-hidden shrink-0 border border-neutral-800">
                              <img
                                src={item.cover_url || item.cover_image_url}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-xs font-bold text-white group-hover:text-indigo-400 transition truncate">
                                {item.title}
                              </p>
                              <p className="text-[10px] text-neutral-400 uppercase font-semibold">
                                {item.reading_mode === 'webtoon' ? 'manhwa' : 'manga'}
                              </p>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="py-6 text-center text-xs text-neutral-500">
                          No results found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </header>
        )}

        <main className="flex-1 w-full max-w-full">{children}</main>

        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </body>
    </html>
  );
}
