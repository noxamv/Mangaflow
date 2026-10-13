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
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            
            {/* Left: Mobile Menu Button & Brand Logo */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Mobile Hamburger Icon */}
              <button 
                type="button"
                aria-label="Toggle navigation menu"
                className="md:hidden p-2 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-indigo-500/20">
                  M
                </span>
                <span className="text-xl font-black tracking-tight text-white">
                  Manga<span className="text-indigo-400">Flow</span>
                </span>
              </Link>
            </div>

            {/* Middle: MangaFire-style Quick Filter Links */}
            <nav className="hidden md:flex items-center gap-1 text-xs font-semibold text-neutral-300">
              <Link 
                href="/" 
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition"
              >
                Home
              </Link>
              <Link 
                href="/?type=manhwa" 
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition"
              >
                Manhwa
              </Link>
              <Link 
                href="/?type=manga" 
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition"
              >
                Manga
              </Link>
              <Link 
                href="/?type=manhua" 
                className="px-3 py-1.5 rounded-lg hover:text-white hover:bg-neutral-800/60 transition"
              >
                Manhua
              </Link>
            </nav>

            {/* Right: Search Bar & Actions */}
            <div className="flex items-center gap-3 flex-1 max-w-md justify-end">
              <form action="/" method="GET" className="relative w-full max-w-xs">
                <input
                  type="text"
                  name="q"
                  placeholder="Search series or author..."
                  className="w-full bg-neutral-900/90 border border-neutral-700/70 focus:border-indigo-500 focus:outline-none rounded-xl pl-9 pr-4 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 transition shadow-inner"
                />
                <svg
                  className="w-4 h-4 absolute left-3 top-2 text-neutral-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </form>
            </div>

          </div>
        </header>

        {/* ================= MAIN CONTENT ================= */}
        <div className="flex-1">
          {children}
        </div>

        {/* ================= FOOTER ================= */}
        <footer className="w-full border-t border-neutral-800/80 bg-[#060608] py-8 text-center text-xs text-neutral-500 mt-16">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© {new Date().getFullYear()} MangaFlow. All series data indexed on-demand.</p>
            <div className="flex gap-4">
              <Link href="/" className="hover:text-neutral-300 transition">Privacy</Link>
              <Link href="/" className="hover:text-neutral-300 transition">DMCA</Link>
              <Link href="/" className="hover:text-neutral-300 transition">Contact</Link>
            </div>
          </div>
        </footer>

      </body>
    </html>
  );
}
