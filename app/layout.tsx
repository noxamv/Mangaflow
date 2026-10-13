{userMenuOpen && (
  <div className="absolute top-10 right-0 w-48 bg-[#141722] border border-neutral-700/80 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in duration-100">
    <div className="px-3.5 py-1.5 border-b border-neutral-800">
      <p className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">Signed In As</p>
      <p className="text-xs font-bold text-white truncate">{user.user_metadata?.display_name || user.email?.split('@')[0]}</p>
    </div>

    <Link
      href="/profile/following"
      onClick={() => setUserMenuOpen(false)}
      className="flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800/70 transition"
    >
      <span>★</span> Followed Titles
    </Link>

    <button
      type="button"
      onClick={async () => {
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
