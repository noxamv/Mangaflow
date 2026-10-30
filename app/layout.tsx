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

  // Identify Reader Route to Conditionally Hide Global Navbar
  const isReadingPage = pathname ? pathname.startsWith('/read/') : false;

  // 1. Initial Auth Session Check
  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    }
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Fetch Notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    async function loadNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data);
      }
    }

    loadNotifications();

    const channel = supabase
      .channel('realtime_user_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationItem, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // 3. PWA Install Event Handler
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('mangaflow_pwa_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('mangaflow_pwa_dismissed', 'true');
  };

  // Click Outside to Dismiss Panels
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuDropdownRef.current &&
        !menuDropdownRef.current.contains(event.target as Node)
      ) {
        setMenuDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
      if (
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setNotifOpen(false);
      }
      if (
        searchOpen &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchOpen]);

  // 4. Live Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('series')
        .select('id, title, slug, cover_url, reading_mode')
        .ilike('title', `%${searchQuery.trim()}%`)
        .limit(6);

      setSearchResults(data || []);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto focus on search opening
  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filteredNotifications = notifications.filter((n) => {
    if (notifTab === 'unread') return !n.read;
    if (notifTab === 'read') return n.read;
    return true;
  });

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
        {showInstallBanner && !isReadingPage && (
          <div className="bg-gradient-to-r from-indigo-950 via-purple-950 to-neutral-900 border-b border-indigo-500/20 px-4 py-2.5 flex items-center justify-between text-xs sticky top-0 z-[60] backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">📱</span>
              <p className="font-medium text-neutral-200">
                Install <strong className="text-white">MangaFlow</strong> app for the fastest full-screen reading experience.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallPwa}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] transition shadow-md shadow-indigo-600/30"
              >
                Install
              </button>
              <button
                onClick={dismissInstallBanner}
                className="p-1 text-neutral-400 hover:text-white transition rounded-md"
                aria-label="Dismiss banner"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* TOP NAVIGATION BAR */}
        {!isReadingPage && (
          <header className="sticky top-0 z-50 bg-[#0e1015]/95 backdrop-blur-md border-b border-neutral-800/80 px-4 lg:px-8 py-3 transition-colors">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              
              {/* Left: Mobile Menu on FAR LEFT, followed by MangaFlow */}
              <div className="flex items-center gap-2 sm:gap-4">
                {/* Mobile / Quick Dropdown Menu Trigger on the FAR LEFT */}
                <div ref={menuDropdownRef} className="relative md:hidden">
                  <button
                    onClick={() => setMenuDropdownOpen(!menuDropdownOpen)}
                    className="p-1.5 rounded-lg hover:bg-neutral-800/80 text-neutral-400 hover:text-white transition"
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

                {/* Brand Name (Without the purple [ M ] box) */}
                <Link href="/" className="flex items-center gap-2 group">
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
                
                {/* Floating Search Toggle Button */}
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

                  {/* Notifications Overlay Panel */}
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

                      {/* Filter Tabs */}
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

        {/* FLOATING EXPANDED SEARCH OVERLAY */}
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              ref={searchContainerRef}
              className="w-full max-w-2xl bg-[#13151f] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center px-4 py-3 border-b border-neutral-800 gap-3">
                <span className="text-neutral-400 text-sm">🔍</span>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search series by title or alternate name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-neutral-500"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="text-xs px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition"
                >
                  ESC
                </button>
              </div>

              {/* SEARCH RESULTS FEED */}
              <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/60 p-2">
                {isSearching ? (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    Scanning active series catalog...
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <Link
                      key={item.id}
                      href={`/series/${item.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-800/50 transition group"
                    >
                      <div className="w-10 h-14 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                        {item.cover_url && (
                          <img
                            src={item.cover_url}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 truncate transition">
                          {item.title}
                        </p>
                        <p className="text-[10px] text-neutral-400 capitalize">
                          {item.reading_mode === 'webtoon' ? 'Webtoon' : 'Manga'}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : searchQuery.trim() ? (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    No series found matching &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    Type to search titles across the indexed catalog.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AUTH MODAL */}
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

        {/* MAIN BODY CONTENT */}
        <main className="flex-1 w-full max-w-full">{children}</main>
      </body>
    </html>
  );
}
