// app/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Home section visibility
  const [showContinueHome, setShowContinueHome] = useState(true);
  const [showFollowedHome, setShowFollowedHome] = useState(true);

  // Following titles visible on home feed
  const [homeFolders, setHomeFolders] = useState({
    reading: true,
    completed: false,
    on_hold: false,
    dropped: false,
    plan_to_read: false,
  });

  // Notification triggers by shelf
  const [notifFolders, setNotifFolders] = useState({
    reading: true,
    completed: true,
    on_hold: true,
    dropped: true,
    plan_to_read: true,
  });

  // Load user session & saved settings
  useEffect(() => {
    async function loadData() {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);

      try {
        const saved = localStorage.getItem('mangaflow_settings_home');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.showContinueHome !== undefined) setShowContinueHome(parsed.showContinueHome);
          if (parsed.showFollowedHome !== undefined) setShowFollowedHome(parsed.showFollowedHome);
          if (parsed.homeFolders) setHomeFolders(parsed.homeFolders);
          if (parsed.notifFolders) setNotifFolders(parsed.notifFolders);
        }
      } catch {}

      setLoading(false);
    }
    loadData();
  }, []);

  const saveSettings = (updates: any) => {
    try {
      const current = {
        showContinueHome,
        showFollowedHome,
        homeFolders,
        notifFolders,
        ...updates,
      };
      localStorage.setItem('mangaflow_settings_home', JSON.stringify(current));
    } catch {}
  };

  const Toggle = ({ active, onChange }: { active: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
        active ? 'bg-indigo-600' : 'bg-neutral-800'
      }`}
    >
      <div
        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
          active ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const username = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Reader';
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Recently';

  return (
    <main className="max-w-xl mx-auto px-4 py-8 space-y-6 w-full max-w-full overflow-x-hidden min-w-0">
      {/* Top Header Card */}
      {user && (
        <div className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-indigo-600 border border-indigo-400 text-white font-black text-base flex items-center justify-center uppercase shadow-md shrink-0">
            {username.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white truncate">{username}</h2>
            <p className="text-[11px] text-neutral-400">Joined {joinDate}</p>
          </div>
          <Link
            href="/profile/edit"
            className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl transition"
          >
            Edit Profile
          </Link>
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-xs text-neutral-400 mt-1">Control how your followed titles surface on the home page.</p>
      </div>

      {/* 1. Home Section Visibility */}
      <section className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
        <h2 className="text-xs font-bold text-white">Home</h2>
        <p className="text-[11px] text-neutral-500">Choose which personal sections appear on the home page.</p>
        <div className="divide-y divide-neutral-800/60 pt-1">
          <div className="py-3 flex items-center justify-between">
            <span className="text-xs text-neutral-200">Show Continue Reading on home</span>
            <Toggle
              active={showContinueHome}
              onChange={() => {
                const val = !showContinueHome;
                setShowContinueHome(val);
                saveSettings({ showContinueHome: val });
              }}
            />
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-xs text-neutral-200">Show new chapters from following titles on home</span>
            <Toggle
              active={showFollowedHome}
              onChange={() => {
                const val = !showFollowedHome;
                setShowFollowedHome(val);
                saveSettings({ showFollowedHome: val });
              }}
            />
          </div>
        </div>
      </section>

      {/* 2. Following Titles on Home */}
      <section className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
        <h2 className="text-xs font-bold text-white">Following titles on home</h2>
        <p className="text-[11px] text-neutral-500">Choose which folders show their followed titles on the home page.</p>
        <div className="divide-y divide-neutral-800/60 pt-1">
          {[
            { id: 'reading', label: 'Reading' },
            { id: 'completed', label: 'Completed' },
            { id: 'on_hold', label: 'On-Hold' },
            { id: 'dropped', label: 'Dropped' },
            { id: 'plan_to_read', label: 'Plan to Read' },
          ].map((f) => (
            <div key={f.id} className="py-3 flex items-center justify-between">
              <span className="text-xs text-neutral-200">{f.label}</span>
              <Toggle
                active={(homeFolders as any)[f.id]}
                onChange={() => {
                  const updated = { ...homeFolders, [f.id]: !(homeFolders as any)[f.id] };
                  setHomeFolders(updated);
                  saveSettings({ homeFolders: updated });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 3. New Chapter Notifications */}
      <section className="bg-[#13151f] border border-neutral-800/80 rounded-2xl p-5 space-y-3 shadow-lg">
        <h2 className="text-xs font-bold text-white">New chapter notifications</h2>
        <p className="text-[11px] text-neutral-500">Choose which folders notify you when a new chapter is released.</p>
        <div className="divide-y divide-neutral-800/60 pt-1">
          {[
            { id: 'reading', label: 'Reading' },
            { id: 'completed', label: 'Completed' },
            { id: 'on_hold', label: 'On-Hold' },
            { id: 'dropped', label: 'Dropped' },
            { id: 'plan_to_read', label: 'Plan to Read' },
          ].map((f) => (
            <div key={f.id} className="py-3 flex items-center justify-between">
              <span className="text-xs text-neutral-200">{f.label}</span>
              <Toggle
                active={(notifFolders as any)[f.id]}
                onChange={() => {
                  const updated = { ...notifFolders, [f.id]: !(notifFolders as any)[f.id] };
                  setNotifFolders(updated);
                  saveSettings({ notifFolders: updated });
                }}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
