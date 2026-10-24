'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';

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

    // Dynamic origin so it works on any Vercel domain or localhost
    const redirectUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : undefined;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#0d0e14] border border-neutral-800 p-6 shadow-2xl relative">
        <button
          onClick={() => {
            handleReset();
            onClose();
          }}
          className="absolute top-4 right-4 text-neutral-400 hover:text-white text-sm"
          aria-label="Close"
        >
          ✕
        </button>

        {sent ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">
              ✓
            </div>
            <h3 className="text-base font-bold text-white">Check your email</h3>
            <p className="text-xs text-neutral-300 leading-relaxed">
              We sent a login link to <span className="text-amber-400 font-semibold">{email}</span>. Click the link in the message to sign in instantly.
            </p>
            <button
              onClick={handleReset}
              className="text-xs text-amber-400 hover:underline pt-2 inline-block font-semibold"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-base font-bold text-white mb-1">
              Sign In to MangaFlow
            </h3>
            <p className="text-xs text-neutral-400 mb-5">
              Enter your email to receive a passwordless login link.
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
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-amber-400 placeholder-neutral-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black font-extrabold text-xs rounded-lg transition mt-2"
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
