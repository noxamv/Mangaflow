'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export default function AuthModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const redirectUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://mangaflow-psi.vercel.app';

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setSent(false);
    setEmail('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6 shadow-2xl relative">
        <button
          onClick={() => {
            handleReset();
            onClose();
          }}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>

        {sent ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
              ✓
            </div>
            <h3 className="text-lg font-bold text-white">Check your email</h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              We sent a magic sign-in link to <span className="text-white font-semibold">{email}</span>. Click the link in the message to log in instantly.
            </p>
            <button
              onClick={handleReset}
              className="text-xs text-indigo-400 hover:underline pt-2 inline-block"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-bold text-white mb-1">
              Sign In to MangaFlow
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Enter your email to receive a passwordless magic login link.
            </p>

            {errorMsg && (
              <div className="p-2.5 rounded-lg text-xs mb-4 bg-rose-500/10 text-rose-400 border border-rose-500/20">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSendMagicLink} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-neutral-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition mt-2"
              >
                {loading ? 'Sending link...' : 'Send Magic Link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
