interface TopBarProps {
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  onLogout?: () => void;
}

export function TopBar({ onToggleMenu, menuOpen, onLogout }: TopBarProps) {
  return (
    <header className="w-full bg-black text-white py-4 relative">
      <h1 className="text-center text-3xl font-bebas uppercase tracking-widest">RestoIT</h1>

      {onToggleMenu && (
        <button
          type="button"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition"
        >
          Cerrar sesión
        </button>
      )}
    </header>
  );
}
