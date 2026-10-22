'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';
import AuthModal from '../components/AuthModal';
import './globals.css';

function getNaturalAvatarStyle(name: string) {
  const styles = [
    { bg: 'bg-[#252c38]', border: 'border-[#384355]', text: 'text-[#9eb5d1]' },
    { bg: 'bg-[#332c22]', border: 'border-[#4a4031]', text: 'text-[#d6b47c]' },
    { bg: 'bg-[#22302a]', border: 'border-[#33473e]', text: 'text-[#88bfa8]' },
  ];
  const charCode = (name || 'U').charCodeAt(0);
  return styles[charCode % styles.length];
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const [displayName, setDisplayName] = useState('');
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
        loadNotifications(u.id);
      }
    }
    initUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user || null;
      setUser(u);
      if (u) {
        setDisplayName(u.user_metadata?.display_name || u.email?.split('@')[0] || 'Reader');
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
          .select('id, series_id, chapter_number, created_at, series:series_id(title, slug, cover_image_url)')
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
            series_title: sObj?.title || 'Series',
            series_slug: sObj?.slug || '',
            chapter_id: c.id,
            chapter_number: c.chapter_number,
            cover_url: sObj?.cover_image_url || '',
            time_ago: 'Latest Drop',
            is_read: readSet.has(c.id),
          });
        }
      }
      setNotifications(Array.from(map.values()).slice(0, 8));
    } catch {}
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await supabase.auth.updateUser({
      data: { display_name: displayName.trim() },
    });
    setEditProfileOpen(false);
  };

  const hasUnread = notifications.some((n) => !n.is_read);
  const avatarStyle = getNaturalAvatarStyle(displayName);
  const initial = displayName ? displayName.charAt(0).toUpperCase() : 'U';

  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#090a0d" />
      </head>
      <body className="bg-[#090a0d] text-neutral-200 antialiased min-h-screen flex flex-col selection:bg-neutral-700 selection:text-white">
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

                {menuOpen && (
                  <div className="absolute top-14 left-4 w-48 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl py-1 z-50">
                    <Link href="/" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">Home</Link>
                    <Link href="/filter" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">Browse & Filter</Link>
                    <Link href="/profile/following" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">Followed Comics</Link>
                    <Link href="/notifications" onClick={() => setMenuOpen(false)} className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60">Notifications</Link>
                  </div>
                )}
              </div>

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

                    {notifMenuOpen && (
                      <div className="absolute top-10 right-0 w-80 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50">
                        <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Notifications</span>
                          <button
                            onClick={markAllAsRead}
                            className="text-[10px] font-semibold text-neutral-400 hover:text-white"
                          >
                            Mark all read
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/60">
                          {notifications.length === 0 ? (
                            <div className="p-6 text-center text-xs text-neutral-500">
                              No unread releases.
                            </div>
                          ) : (
                            notifications.map((item) => (
                              <Link
                                key={item.id}
                                href={`/read/${item.chapter_id}`}
                                onClick={() => setNotifMenuOpen(false)}
                                className={`p-3 flex items-center justify-between gap-3 transition ${
                                  !item.is_read ? 'bg-neutral-800/30 hover:bg-neutral-800/50' : 'hover:bg-neutral-800/30'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{item.series_title}</p>
                                  <p className="text-[11px] text-neutral-400">Chapter {item.chapter_number}</p>
                                </div>
                                {!item.is_read && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {user ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(!userMenuOpen);
                        setNotifMenuOpen(false);
                      }}
                      className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold transition shadow-sm ${avatarStyle.bg} ${avatarStyle.border} ${avatarStyle.text}`}
                    >
                      {initial}
                    </button>

                    {userMenuOpen && (
                      <div className="absolute top-10 right-0 w-48 bg-[#14161f] border border-neutral-800 rounded-xl shadow-2xl overflow-hidden py-1 z-50">
                        <div className="px-3 py-2 border-b border-neutral-800">
                          <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                          <p className="text-[10px] text-neutral-400 truncate">{user.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            setEditProfileOpen(true);
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                        >
                          Edit Profile
                        </button>
                        <Link
                          href="/profile/following"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/60"
                        >
                          Followed Comics
                        </Link>
                        <button
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setUser(null);
                            setUserMenuOpen(false);
                            router.refresh();
                          }}
                          className="w-full text-left px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10"
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
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs rounded-lg transition"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

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
                      <img src={r.cover_image_url} alt="" className="w-8 h-10 object-cover rounded bg-neutral-900" />
                      <div className="truncate text-xs font-medium text-white">{r.english_title || r.title}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {editProfileOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#14161f] border border-neutral-800 rounded-xl p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <h3 className="text-xs font-bold text-white">Customize Profile</h3>
                <button type="button" onClick={() => setEditProfileOpen(false)} className="text-neutral-400 hover:text-white text-sm">✕</button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold shadow-sm ${avatarStyle.bg} ${avatarStyle.border} ${avatarStyle.text}`}>
                    {initial}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{displayName || 'User'}</p>
                    <p className="text-[10px] text-neutral-500">Natural Profile Tone</p>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Display Username</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-neutral-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 font-semibold text-xs text-white rounded-lg transition"
                >
                  Save Profile
                </button>
              </form>
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
