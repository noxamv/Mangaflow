import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'MangaFlow - Free Online Manga & Manhwa Reader',
  description: 'Read trending Manga, Manhwa, and Manhua chapters online for free.',
  referrer: 'no-referrer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="bg-[#0b0c10] text-neutral-100 antialiased min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white">

        {/* Hidden Modals and Dropdown Checkbox Controllers */}
        <input type="checkbox" id="nav-dropdown-toggle" className="peer/menu hidden" />
        <input type="checkbox" id="search-modal-toggle" className="peer/search hidden" />
        <input type="checkbox" id="notif-modal-toggle" className="peer/notif hidden" />
        <input type="checkbox" id="auth-modal-toggle" className="peer/auth hidden" />

        {/* Global Backdrop Click-to-Close */}
        <label
          htmlFor="nav-dropdown-toggle"
          className="fixed inset-0 z-40 hidden peer-checked/menu:block"
        ></label>

        {/* ================= TOP NAVBAR ================= */}
        <header className="sticky top-0 z-50 w-full bg-[#0f1117]/95 backdrop-blur-md border-b border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
            
            {/* Left: Compact Hamburger Menu & Brand */}
            <div className="relative flex items-center gap-2.5">
              <label
                htmlFor="nav-dropdown-toggle"
                className="cursor-pointer p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition select-none flex items-center justify-center"
                aria-label="Toggle Navigation"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </label>

              <Link href="/" className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-xs shadow-md shadow-indigo-500/20">
                  M
                </span>
                <span className="text-base sm:text-lg font-black tracking-tight text-white">
                  Manga<span className="text-indigo-400">Flow</span>
                </span>
              </Link>

              {/* Compact Popover Menu */}
              <div className="absolute top-12 left-0 w-56 bg-[#151822] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50 hidden peer-checked/menu:block transition-all">
                <Link href="/" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                  Home
                </Link>
                <Link href="/browse?type=manga" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <span className="text-sm">🔥</span> Trending Manga
                </Link>
                <Link href="/browse?type=webtoon" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <span className="text-sm">⚡</span> Trending Webtoon
                </Link>
                <Link href="/browse?sort=latest" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Recently Updated
                </Link>
                <Link href="/browse?sort=newest" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                  Recently Added
                </Link>
                <div className="my-1.5 border-t border-neutral-700/60"></div>
                <Link href="/browse" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                  Browse All Titles
                </Link>
                <Link href="/browse?sort=random" className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>
                  Random Series
                </Link>
              </div>
            </div>

            {/* Right: Search, Notifications, Sign Up */}
            <div className="flex items-center gap-1 sm:gap-2">
              <label
                htmlFor="search-modal-toggle"
                className="cursor-pointer p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </label>

              <label
                htmlFor="notif-modal-toggle"
                className="cursor-pointer p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
                aria-label="Notifications"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </label>

              <label
                htmlFor="auth-modal-toggle"
                className="cursor-pointer px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-md shadow-sm transition select-none"
              >
                Sign Up
              </label>
            </div>

          </div>
        </header>

        {/* ================= SEARCH MODAL ================= */}
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden peer-checked/search:flex items-start justify-center pt-20 px-4">
          <label htmlFor="search-modal-toggle" className="fixed inset-0 cursor-pointer"></label>
          <div className="relative w-full max-w-lg bg-[#141721] border border-neutral-700/80 rounded-2xl p-4 shadow-2xl z-10">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Search Catalog</span>
              <label htmlFor="search-modal-toggle" className="cursor-pointer text-neutral-400 hover:text-white text-sm">✕</label>
            </div>
            <form action="/browse" method="GET" className="mt-3 flex gap-2">
              <input
                type="text"
                name="q"
                placeholder="Search series title, author, genre..."
                className="flex-1 bg-neutral-900 border border-neutral-700 focus:border-indigo-500 focus:outline-none rounded-xl px-4 py-2 text-xs text-white"
              />
              <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">
                Search
              </button>
            </form>
          </div>
        </div>

        {/* ================= NOTIFICATIONS MODAL ================= */}
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden peer-checked/notif:flex items-start justify-center pt-24 px-4">
          <label htmlFor="notif-modal-toggle" className="fixed inset-0 cursor-pointer"></label>
          <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-5 shadow-2xl z-10 text-center">
            <div className="flex justify-end">
              <label htmlFor="notif-modal-toggle" className="cursor-pointer text-neutral-400 hover:text-white text-sm">✕</label>
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

        {/* ================= SIGN UP MODAL ================= */}
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm hidden peer-checked/auth:flex items-center justify-center p-4">
          <label htmlFor="auth-modal-toggle" className="fixed inset-0 cursor-pointer"></label>
          <div className="relative w-full max-w-sm bg-[#141721] border border-neutral-700/80 rounded-2xl p-6 shadow-2xl z-10">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <h3 className="text-sm font-bold text-white">Create an Account</h3>
              <label htmlFor="auth-modal-toggle" className="cursor-pointer text-neutral-400 hover:text-white text-sm">✕</label>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Username</label>
                <input type="text" placeholder="Reader123" className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Email</label>
                <input type="email" placeholder="you@example.com" className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Password</label>
                <input type="password" placeholder="••••••••" className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white" />
              </div>
              <button type="button" className="w-full mt-2 py-2 bg-indigo-600 hover:bg-indigo-500 font-bold text-xs text-white rounded-lg transition">
                Create Account
              </button>
            </div>
          </div>
        </div>

        {/* ================= PAGE CHILDREN ================= */}
        <div className="flex-1">
          {children}
        </div>

        {/* ================= FOOTER ================= */}
        <footer className="w-full border-t border-neutral-800/80 bg-[#0a0b0e] py-6 text-center text-xs text-neutral-500 mt-12">
          <p>© {new Date().getFullYear()} MangaFlow. All content indexed on-demand.</p>
        </footer>

      </body>
    </html>
  );
}
