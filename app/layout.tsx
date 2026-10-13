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
      <body className="bg-[#08080a] text-neutral-100 antialiased min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white">
        
        {/* ================= TOP NAVBAR ================= */}
        <header className="sticky top-0 z-50 w-full bg-[#0c0d12]/95 backdrop-blur-md border-b border-neutral-800/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
            
            {/* Left: Mobile Drawer Trigger + Brand Logo */}
            <div className="flex items-center gap-3">
              <label htmlFor="nav-drawer" className="cursor-pointer p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </label>

              <Link href="/" className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-xs shadow-md shadow-indigo-500/20">
                  M
                </span>
                <span className="text-lg font-black tracking-tight text-white">
                  Manga<span className="text-indigo-400">Flow</span>
                </span>
              </Link>
            </div>

            {/* Right: Search Icon, Notifications, Sign Up Button */}
            <div className="flex items-center gap-2.5">
              {/* Search Trigger Button */}
              <button 
                type="button" 
                aria-label="Search" 
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              {/* Notification Bell */}
              <button 
                type="button" 
                aria-label="Notifications" 
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </button>

              {/* Sign Up Bar */}
              <button 
                type="button"
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-md shadow-sm transition"
              >
                Sign Up
              </button>
            </div>

          </div>
        </header>

        {/* Hidden Drawer Checkbox Toggle for Pure CSS Mobile Menu */}
        <input type="checkbox" id="nav-drawer" className="peer hidden" />

        {/* Backdrop Overlay */}
        <label 
          htmlFor="nav-drawer" 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 hidden peer-checked:block transition-all"
        ></label>

        {/* Slide-out Sidebar Menu */}
        <aside className="fixed top-0 left-0 h-full w-72 bg-[#0c0d12] border-r border-neutral-800/80 z-50 transform -translate-x-full peer-checked:translate-x-0 transition-transform duration-300 ease-in-out p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800/80 mb-5">
              <span className="text-base font-black text-white">Menu Navigation</span>
              <label htmlFor="nav-drawer" className="cursor-pointer text-neutral-400 hover:text-white text-lg">✕</label>
            </div>

            <nav className="flex flex-col space-y-1 text-sm font-semibold text-neutral-300">
              <Link href="/?type=trending" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-white transition">🔥 Trending Series</Link>
              <Link href="/?type=popular" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-white transition">⭐ Popular Series</Link>
              <Link href="/?type=views" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-white transition">👁 Most Viewed</Link>
              <Link href="/?type=random" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-white transition">🎲 Random Series</Link>
              <Link href="/?type=latest" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-white transition">⚡ Latest Releases</Link>

              <div className="pt-3 pb-1 border-t border-neutral-800/80 my-2 text-xs uppercase tracking-wider text-neutral-500 font-bold px-3">
                Format Filters
              </div>
              <Link href="/?format=manhwa" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-indigo-400 transition">🇰🇷 Manhwa (Korean)</Link>
              <Link href="/?format=manga" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-indigo-400 transition">🇯🇵 Manga (Japanese)</Link>
              <Link href="/?format=manhua" className="px-3 py-2 rounded-lg hover:bg-neutral-800 hover:text-indigo-400 transition">🇨🇳 Manhua (Chinese)</Link>
            </nav>
          </div>

          <div className="text-xs text-neutral-600 border-t border-neutral-800/80 pt-3">
            MangaFlow Engine v4.0
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1">
          {children}
        </div>

        {/* Footer */}
        <footer className="w-full border-t border-neutral-800/80 bg-[#060608] py-8 text-center text-xs text-neutral-500 mt-12">
          <p>© {new Date().getFullYear()} MangaFlow. All series data indexed on-demand.</p>
        </footer>

      </body>
    </html>
  );
}
