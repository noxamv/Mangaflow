'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';
import AuthModal from '../components/AuthModal';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  const router = useRouter();
  const pathname = usePathname();
  const isReader = pathname?.startsWith('/read/');

  useEffect(() => {
    async function initUser() {
      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || 'Reader');
        setAvatarUrl(u.user_metadata?.avatar_url || null);
        loadNotifications(u.id);
      }
    }
    initUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || 'Reader');
        setAvatarUrl(u.user_metadata?.avatar_url || null);
        loadNotifications(u.id);
      } else {
        setNotifications([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadNotifications(userId: string) {
    try {
      const { data: follows } = await supabase
        .from('user_follows')
        .select('series_id')
        .eq('user_id', userId);

      if (!follows?.length) return;
      const sIds = follows.map((f: any) => f.series_id);

      const [chapsRes, readRes] = await Promise.all([
        supabase
          .from('chapters')
          .select('id, series_id, chapter_number, created_at, series:series_id(title, english_title, slug, cover_image_url)')
          .in('series_id', sIds)
          .order('chapter_number', { ascending: false }),
        supabase
          .from('notification_reads')
          .select('chapter_id')
          .eq('user_id', userId),
      ]);

      const readSet = new Set((readRes.data || []).map((r: any) => r.chapter_id));
      const map = new Map<string, any>();

      for (const c of chapsRes.data || []) {
        if (!map.has(c.series_id)) {
          const sObj = Array.isArray(c.series) ? c.series[0] : c.series;
          map.set(c.series_id, {
            id: c.id,
            series_title: sObj?.english_title || sObj?.title || 'Series',
            series_slug: sObj?.slug || '',
            chapter_id: c.id,
            chapter_number: c.chapter_number,
            cover_url: sObj?.cover_image_url || '',
            time_ago: formatTimeAgo(c.created_at),
            is_read: readSet.has(c.id),
          });
        }
      }
      setNotifications(Array.from(map.values()).slice(0, 6));
    } catch {}
  }

  function formatTimeAgo(dateStr?: string) {
    if (!dateStr) return 'Recent';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  const markAllAsRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.is_read);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    if (unread.length > 0) {
      await supabase.from('notification_reads').upsert(
        unread.map((n) => ({ user_id: user.id, chapter_id: n.chapter_id })),
        { onConflict: 'user_id,chapter_id' }
      );
    }
  };

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
        .limit(6);
      setResults(data || []);
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const hasUnread = notifications.some((n) => !n.is_read);

  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#090a0d" />
      </head>
      <body className="bg-[#090a0d] text-neutral-200 antialiased min-h-screen flex flex-col selection:bg-neutral-800 selection:text-white">
        {(menuOpen || searchOpen || userMenuOpen || notifMenuOpen) && (
          <div
            onClick={() => {
              setMenuOpen(false);
              setSearchOpen(false);
              setUserMenuOpen(false);
              setNotifMenuOpen(false);
            }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          />
        )}

        {!isReader && (
          <header className="sticky top-0 z-40 w-full border-b border-neutral-800/80 bg-[#0f1117]/95 backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
              {/* Left: Navigation Menu */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                  aria-label="Navigation"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>

                <Link href="/" className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-white hover:text-neutral-300 transition">
                    MangaFlow
                  </span>
                </Link>

                {/* Updated Navigation Dropdown (Removed Following Titles & Notifications) */}
                {menuOpen && (
                  <div className="absolute top-14 left-4 w-52 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl py-1.5 z-50 divide-y divide-neutral-800/60">
                    <div className="py-1">
                      <Link href="/" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">
                        Home
                      </Link>
                      <Link href="/trending" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">
                        Trending Series
                      </Link>
                      <Link href="/popular" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">
                        Popular Series
                      </Link>
                      <Link href="/latest" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">
                        Latest Releases
                      </Link>
                    </div>
                    <div className="py-1">
                      <Link href="/filter" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-amber-400 hover:text-amber-300 hover:bg-neutral-800/60">
                        Browse & Filter
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                  title="Search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>

                {/* Notifications Bell */}
                {user && (
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
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {hasUnread && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-[#0f1117]" />
                      )}
                    </button>

                    {/* Notification Dropdown with Images and View All Footer */}
                    {notifMenuOpen && (
                      <div className="absolute top-10 right-0 w-80 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50">
                        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Notifications</span>
                          <button
                            onClick={markAllAsRead}
                            className="text-[11px] font-semibold text-neutral-400 hover:text-white transition"
                          >
                            ✓ Mark as read
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/60">
                          {notifications.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-500">
                              No unread notifications.
                            </div>
                          ) : (
                            notifications.map((item) => (
                              <Link
                                key={item.id}
                                href={`/read/${item.chapter_id}`}
                                onClick={() => setNotifMenuOpen(false)}
                                className={`p-3 flex items-center gap-3 transition ${
                                  !item.is_read ? 'bg-neutral-800/30 hover:bg-neutral-800/50' : 'hover:bg-neutral-800/30'
                                }`}
                              >
                                <img
                                  src={item.cover_url || '/placeholder.png'}
                                  alt=""
                                  className="w-9 h-12 rounded object-cover bg-neutral-900 border border-neutral-800 shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-white truncate">{item.series_title}</p>
                                  <p className="text-[11px] text-neutral-400 mt-0.5">
                                    Ch. {item.chapter_number} · <span className="text-neutral-500">{item.time_ago}</span>
                                  </p>
                                </div>
                                {!item.is_read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                              </Link>
                            ))
                          )}
                        </div>

                        {/* MangaFire-style 'View all notifications' footer */}
                        <div className="p-2 border-t border-neutral-800 bg-[#0f1117] text-center">
                          <Link
                            href="/notifications"
                            onClick={() => setNotifMenuOpen(false)}
                            className="text-xs font-semibold text-neutral-300 hover:text-amber-400 transition block py-1"
                          >
                            View all notifications
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Clean Default Profile Icon & User Navigation */}
                {user ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(!userMenuOpen);
                        setNotifMenuOpen(false);
                      }}
                      className="w-8 h-8 rounded-full border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition overflow-hidden text-neutral-300"
                      aria-label="User profile menu"
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      )}
                    </button>

                    {/* Full User Menu */}
                    {userMenuOpen && (
                      <div className="absolute top-10 right-0 w-52 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden py-1.5 z-50 divide-y divide-neutral-800/60">
                        <div className="px-3.5 py-2">
                          <p className="text-xs font-bold text-white truncate">{displayName}</p>
                          <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                        </div>
                        <div className="py-1">
                          <Link
                            href="/profile/edit"
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
                          >
                            Edit Profile
                          </Link>
                          <Link
                            href="/profile/following"
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
                          >
                            Following Titles
                          </Link>
                          <Link
                            href="/notifications"
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
                          >
                            Notifications
                          </Link>
                          <Link
                            href="/profile/import-export"
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
                          >
                            Import & Export
                          </Link>
                          <Link
                            href="/profile/settings"
                            onClick={() => setUserMenuOpen(false)}
                            className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60 transition"
                          >
                            Settings
                          </Link>
                        </div>
                        <div className="py-1">
                          <button
                            onClick={async () => {
                              await supabase.auth.signOut();
                              setUser(null);
                              setUserMenuOpen(false);
                              router.refresh();
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            Log Out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAuthOpen(true)}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs rounded-lg transition"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Global Search Overlay */}
        {searchOpen && (
          <div className="fixed top-16 inset-x-0 z-50 flex justify-center px-4">
            <div className="w-full max-w-lg bg-[#14161f] border border-neutral-800 rounded-xl p-3 shadow-2xl">
              <input
                type="text"
                autoFocus
                placeholder="Search manga or manhwa..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
              />
              {results.length > 0 && (
                <div className="mt-2 divide-y divide-neutral-800/60 max-h-60 overflow-y-auto">
                  {results.map((r) => (
                    <Link
                      key={r.id}
                      href={`/series/${r.slug}`}
                      onClick={() => setSearchOpen(false)}
                      className="p-2 flex items-center gap-3 hover:bg-neutral-800/40 rounded-lg"
                    >
                      <img src={r.cover_image_url || '/placeholder.png'} alt="" className="w-8 h-10 object-cover rounded bg-neutral-900" />
                      <div className="truncate text-xs font-medium text-white">{r.english_title || r.title}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1">{children}</div>

        {!isReader && (
          <footer className="w-full border-t border-neutral-800/80 bg-[#090a0d] py-6 text-center text-xs text-neutral-500 mt-12">
            <p>© {new Date().getFullYear()} MangaFlow. All content indexed on-demand.</p>
          </footer>
        )}

        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </body>
    </html>
  );
}
