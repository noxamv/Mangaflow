'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import './globals.css';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface SearchResult {
  id: string;
  slug: string;
  title: string;
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
  const [notifOpen, setNotifOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // User session state
  const [user, setUser] = useState<any>(null);

  // Magic Link Form States
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authSent, setAuthSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Search States
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [searchOpen]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim()) return;

    setAuthLoading(true);
    setAuthError(null);

    const redirectUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://mangaflow-psi.vercel.app';

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: redirectUrl,
      },
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

  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
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

        {/* TOP NAVBAR */}
        <header className="sticky top-0 z-50 w-full bg-[#0f1117]/95 backdrop-blur-md border-b border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
            {/* Left: Brand & Menu */}
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

              {/* Popover Menu */}
              {menuOpen && (
                <div className="absolute top-12 left-0 w-48 bg-[#151822] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50">
                  <Link
                    href="/"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
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
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Latest Releases
                  </Link>
                  <Link
                    href="/category/random"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                  >
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Random Series
                  </Link>
                  <div className="my-1 border-t border-neutral-700/60" />
                  <Link
                    href="/filter"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 hover:bg-neutral-800/70 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    Filter & Browse
                  </Link>
                </div>
              )}
            </div>

            {/* Right: Search, Notifications, Circular User Avatar */}
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

              <button
                type="button"
                onClick={() => setNotifOpen(true)}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>

              {user ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-bold text-xs flex items-center justify-center border border-indigo-400/40 shadow-sm hover:scale-105 transition"
                    aria-label="User Account"
                  >
                    {user.email ? user.email[0].toUpperCase() : 'U'}
                  </button>

                  {userMenuOpen && (
                    <div className="absolute top-10 right-0 w-48 bg-[#141722] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in duration-100">
                      <div className="px-3.5 py-1.5 border-b border-neutral-800">
                        <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Account</p>
                        <p className="text-xs font-bold text-white truncate">
                          {user.user_metadata?.display_name || user.email?.split('@')[0]}
                        </p>
                      </div>

                      <Link
                        href="/profile/following"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>★</span> Following Titles
                      </Link>

                      <button
                        type="button"
                        onClick={async () => {
                          setUserMenuOpen(false);
                          const newName = prompt('Enter new display name:');
                          if (newName?.trim()) {
                            await supabase.auth.updateUser({
                              data: { display_name: newName.trim() },
                            });
                            window.location.reload();
                          }
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
                      >
                        <span>✎</span> Edit Profile
                      </button>

                      <div className="my-1 border-t border-neutral-800" />

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full text-left flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
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
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-md shadow-sm transition select-none"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Floating Search Bar */}
        {searchOpen && (
          <div className="sticky top-14 z-50 w-full px-3 sm:px-6 max-w-lg mx-auto animate-in fade-in duration-150">
            <div className="bg-[#151824] border border-neutral-700 rounded-xl shadow-2xl overflow-hidden mt-2">
              <div className="flex items-center px-3 py-2 gap-2 border-b border-neutral-800 bg-[#12141d]">
                <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search series title, author..."
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

                  {!loadingSearch && results.length > 0 && results.map((item) => (
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

                  {!loadingSearch && results.length === 0 && (
                    <div className="p-4 text-center text-xs text-neutral-400">
                      No titles found.
                    </div>
                  )}

                  <Link
                    href={`/filter?q=${encodeURIComponent(query)}`}
                    onClick={() => setSearchOpen(false)}
                    className="block text-center py-2 text-xs font-semibold text-indigo-400 hover:bg-neutral-800/80 border-t border-neutral-800"
                  >
                    View all matching results →
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notifications Modal */}
        {notifOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4">
            <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl text-center">
              <div className="flex justify-end">
                <button type="button" onClick={() => setNotifOpen(false)} className="text-neutral-400 hover:text-white text-sm">✕</button>
              </div>
              <div className="w-12 h-12 bg-neutral-800/80 rounded-full flex items-center justify-center mx-auto mb-3 text-neutral-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-white mb-1">No Notifications</h3>
              <p className="text-xs text-neutral-400">You don&apos;t have any notifications right now.</p>
            </div>
          </div>
        )}

        {/* Auth Modal */}
        {authOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
                <h3 className="text-sm font-bold text-white">
                  {authSent ? 'Check Your Inbox' : 'Sign In / Register'}
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
                    Click the link in the email to log in automatically.
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
                    Sign in or create an account without passwords using a magic link.
                  </p>

                  {authError && (
                    <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                      {authError}
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-lg transition shadow-md"
                  >
                    {authLoading ? 'Sending link...' : 'Send Magic Link'}
                  </button>
                </form>
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
