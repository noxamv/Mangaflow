'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [showContinueHome, setShowContinueHome] = useState(true);
  const [showFollowedHome, setShowFollowedHome] = useState(true);

  const [folders, setFolders] = useState({
    reading: true,
    completed: false,
    on_hold: false,
    dropped: false,
    plan_to_read: false,
  });

  const [languages, setLanguages] = useState({
    en: true,
    fr: true,
    es: true,
    pt: true,
    ja: true,
  });

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

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Settings</h1>
        <p className="text-xs text-neutral-400 mt-1">Control how your followed titles and feeds surface.</p>
      </div>

      {/* Home Feed Display */}
      <section className="bg-[#13151f] border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400">Home Feed</h2>
        <div className="divide-y divide-neutral-800/60">
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Show Continue Reading on home</p>
              <p className="text-[11px] text-neutral-500">Display your recent history row on the home page.</p>
            </div>
            <Toggle active={showContinueHome} onChange={() => setShowContinueHome(!showContinueHome)} />
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Show new chapters from followed titles</p>
              <p className="text-[11px] text-neutral-500">Surface quick updates for your bookmarked series.</p>
            </div>
            <Toggle active={showFollowedHome} onChange={() => setShowFollowedHome(!showFollowedHome)} />
          </div>
        </div>
      </section>

      {/* Following Titles on Home Folders */}
      <section className="bg-[#13151f] border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400">Folders on Home Feed</h2>
        <div className="divide-y divide-neutral-800/60">
          {[
            { id: 'reading', label: 'Reading' },
            { id: 'completed', label: 'Completed' },
            { id: 'on_hold', label: 'On-Hold' },
            { id: 'dropped', label: 'Dropped' },
            { id: 'plan_to_read', label: 'Plan to Read' },
          ].map((f) => (
            <div key={f.id} className="py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">{f.label}</span>
              <Toggle
                active={(folders as any)[f.id]}
                onChange={() => setFolders((prev) => ({ ...prev, [f.id]: !(prev as any)[f.id] }))}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Notification Languages */}
      <section className="bg-[#13151f] border border-neutral-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-neutral-400">Notification Languages</h2>
        <div className="divide-y divide-neutral-800/60">
          {[
            { id: 'en', label: 'English', flag: '🇬🇧' },
            { id: 'fr', label: 'French', flag: '🇫🇷' },
            { id: 'es', label: 'Spanish', flag: '🇪🇸' },
            { id: 'pt', label: 'Portuguese', flag: '🇵🇹' },
            { id: 'ja', label: 'Japanese', flag: '🇯🇵' },
          ].map((l) => (
            <div key={l.id} className="py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-2">
                <span>{l.flag}</span>
                <span>{l.label}</span>
              </span>
              <Toggle
                active={(languages as any)[l.id]}
                onChange={() => setLanguages((prev) => ({ ...prev, [l.id]: !(prev as any)[l.id] }))}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
