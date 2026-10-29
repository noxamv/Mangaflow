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

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isReadingPage = pathname?.startsWith('/read/');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem('pwa_dismissed')) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
    }
    setDeferredPrompt(null);
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_dismissed', 'true');
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    async function fetchNotifications() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) setNotifications(data);
    }

    fetchNotifications();

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user?.id}`,
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

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('series')
        .select('id, title, slug, cover_url, reading_mode')
        .ilike('title', `%${searchQuery.trim()}%`)
        .limit(8);

      setSearchResults(data || []);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
      <body className="bg-[#0b0c10] text-[#c5c6c7] min-h-screen flex flex-col font-sans antialiased selection:bg-[#45f3ff] selection:text-black">
        {showInstallBanner && !isReadingPage && (
          <div className="bg-gradient-to-r from-indigo-900/90 to-purple-900/90 text-white px-4 py-2.5 flex items-center justify-between text-xs backdrop-blur-md border-b border-indigo-500/20 sticky top-0 z-[60]">
            <div className="flex items-center gap-3">
              <span className="text-base">📱</span>
              <span>Install MangaFlow app for offline reading and quick access</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="bg-white text-neutral-900 font-bold px-3 py-1 rounded-lg text-xs hover:bg-neutral-100 transition shadow-sm"
              >
                Install
              </button>
              <button onClick={dismissInstallBanner} className="text-neutral-400 hover:text-white p-1">
                ✕
              </button>
            </div>
          </div>
        )}

        {!isReadingPage && (
          <header className="sticky top-0 z-50 bg-[#0c0d14]/90 backdrop-blur-md border-b border-neutral-800/80 px-4 lg:px-8 py-3 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                  M
                </div>
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                  MangaFlow
                </span>
              </Link>

              <nav className="hidden md:flex items-center gap-1 text-xs font-semibold text-neutral-400">
                <Link href="/" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/50 transition">
                  Home
                </Link>
                <Link href="/latest" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/50 transition">
                  Latest
                </Link>
                <Link href="/popular" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/50 transition">
                  Popular
                </Link>
                <Link href="/trending" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/50 transition">
                  Trending
                </Link>
                <Link href="/filter" className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/50 transition">
                  Browse
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div ref={searchRef} className="relative">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition flex items-center gap-2 text-xs"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Search...</span>
                </button>

                {searchOpen && (
                  <div className="absolute right-0 top-12 w-80 sm:w-96 bg-[#12131a] border border-neutral-800 rounded-2xl p-3 shadow-2xl z-50">
                    <div className="relative mb-2">
                      <input
                        type="text"
                        placeholder="Search manga, manhwa..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                        className="w-full bg-[#181a24] border border-neutral-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                      {isSearching && (
                        <div className="absolute right-3 top-2.5 w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {searchResults.map((item) => (
                        <Link
                          key={item.id}
                          href={`/series/${item.slug}`}
                          onClick={() => setSearchOpen(false)}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-neutral-800/60 transition group"
                        >
                          <img
                            src={item.cover_url || '/placeholder.png'}
                            alt={item.title}
                            className="w-8 h-11 object-cover rounded-md flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-neutral-200 group-hover:text-indigo-400 truncate">
                              {item.title}
                            </h4>
                            <span className="text-[10px] text-neutral-500 capitalize">{item.reading_mode || 'Comic'}</span>
                          </div>
                        </Link>
                      ))}
                      {!isSearching && searchQuery && searchResults.length === 0 && (
                        <div className="p-4 text-center text-xs text-neutral-500">No results found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {user ? (
                <div className="flex items-center gap-2">
                  <div ref={notifRef} className="relative">
                    <button
                      onClick={() => setNotifOpen(!notifOpen)}
                      className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-white transition relative"
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
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {notifOpen && (
                      <div className="absolute right-0 top-12 w-80 bg-[#12131a] border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                          <span className="font-bold text-xs text-white">Notifications</span>
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllAsRead}
                              className="text-[10px] text-indigo-400 hover:underline font-medium"
                            >
                              Mark all as read
                            </button>
                          )}
                        </div>

                        <div className="max-h-80 overflow-y-auto divide-y divide-neutral-800/40">
                          {notifications.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-500">No notifications yet</div>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                onClick={() => handleMarkAsRead(n.id)}
                                className={`p-3 hover:bg-neutral-800/50 transition cursor-pointer text-xs ${
                                  !n.read ? 'bg-indigo-950/20' : ''
                                }`}
                              >
                                <div className="font-semibold text-neutral-200">{n.title}</div>
                                <div className="text-[11px] text-neutral-400 mt-0.5">{n.message}</div>
                                <div className="text-[9px] text-neutral-600 mt-1">
                                  {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div ref={userMenuRef} className="relative">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700/80 flex items-center justify-center font-bold text-xs text-white overflow-hidden"
                    >
                      {user.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        user.email?.[0]?.toUpperCase() || 'U'
                      )}
                    </button>

                    {userMenuOpen && (
                      <div className="absolute right-0 top-12 w-48 bg-[#12131a] border border-neutral-800 rounded-2xl p-1.5 shadow-2xl z-50 text-xs font-medium">
                        <Link
                          href="/profile/edit"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Profile
                        </Link>
                        <Link
                          href="/profile/following"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Bookmarks
                        </Link>
                        <Link
                          href="/profile/sync"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl hover:bg-neutral-800/80 text-neutral-300 hover:text-white transition"
                        >
                          Cloud Sync
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
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-400 transition"
                        >
                          Sign Out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition"
                >
                  Sign In
                </button>
              )}
            </div>
          </header>
        )}

        <div className="flex-1 flex flex-col">{children}</div>

        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      </body>
    </html>
  );
}
