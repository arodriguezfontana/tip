import type { ReactNode } from 'react';
import { THEME_OPTIONS, type ThemeColor } from '@/types/storeConfig';

interface TopBarProps {
  onToggleMenu?: () => void;
  menuOpen?: boolean;
  onLogout?: () => void;
  /** Acciones extra alineadas a la derecha (por ejemplo, la cuenta del cliente en la web). */
  actions?: ReactNode;
  /** Nombre personalizado de la marca / local */
  title?: string;
  /** Logotipo principal */
  logoUrl?: string | null;
  /** Color temático principal */
  themeColor?: ThemeColor;
}

export function TopBar({ onToggleMenu, menuOpen, onLogout, actions, title, logoUrl, themeColor }: TopBarProps) {
  const brandName = title?.trim() || 'RestoIT';
  const bgColor = themeColor ? THEME_OPTIONS[themeColor]?.hex : '#000000';

  return (
    <header
      className="w-full text-white py-4 relative transition-colors duration-200"
      style={{ backgroundColor: bgColor }}
    >
      <div className="flex items-center justify-center gap-3 px-12">
        {logoUrl && (
          <img
            src={logoUrl}
            alt={`Logo de ${brandName}`}
            className="h-9 w-auto max-w-[120px] object-contain rounded-lg"
          />
        )}
        <h1 className="text-center text-3xl font-bebas uppercase tracking-widest">{brandName}</h1>
      </div>

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

      {actions && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
