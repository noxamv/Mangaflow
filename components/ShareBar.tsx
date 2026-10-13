'use client';
import { useState } from 'react';

export default function ShareBar() {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center justify-between bg-[#13151f] border border-neutral-800/80 px-3 py-2 rounded-xl text-xs">
      <span className="text-[11px] font-semibold text-neutral-400">
        Share MangaFlow:
      </span>
      <div className="flex items-center gap-1.5">
        {/* Facebook */}
        <a
          href="https://www.facebook.com/sharer/sharer.php?u=https://mangaflow-psi.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#1877F2]/20 hover:bg-[#1877F2]/30 text-[#1877F2] rounded-lg transition"
          aria-label="Share on Facebook"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        </a>

        {/* X / Twitter */}
        <a
          href="https://twitter.com/intent/tweet?url=https://mangaflow-psi.vercel.app&text=Read%20free%20manga%20and%20manhwa%20on%20MangaFlow"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition"
          aria-label="Share on X"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>

        {/* WhatsApp */}
        <a
          href="https://api.whatsapp.com/send?text=Read%20free%20manga%20and%20manhwa%20on%20MangaFlow%20https://mangaflow-psi.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] rounded-lg transition"
          aria-label="Share on WhatsApp"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
        </a>

        {/* Telegram */}
        <a
          href="https://t.me/share/url?url=https://mangaflow-psi.vercel.app&text=Read%20free%20manga"
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-[#0088cc]/20 hover:bg-[#0088cc]/30 text-[#0088cc] rounded-lg transition"
          aria-label="Share on Telegram"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.949z"/></svg>
        </a>

        {/* Copy Link Button */}
        <button
          onClick={copyUrl}
          className="flex items-center gap-1 px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg transition text-[11px]"
          title="Copy Link"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}
