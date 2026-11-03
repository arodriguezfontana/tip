export type PresetThemeColor = 'black' | 'blue' | 'emerald' | 'orange';
export type ThemeColor = PresetThemeColor | 'red' | string;

export interface ThemeOption {
  id: string;
  name: string;
  hex: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  accentBorder: string;
}

export const THEME_OPTIONS: Record<string, ThemeOption> = {
  black: {
    id: 'black',
    name: 'Negro',
    hex: '#18181b',
    headerBg: 'bg-zinc-900',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-900',
    accentBorder: 'border-zinc-900',
  },
  blue: {
    id: 'blue',
    name: 'Azul',
    hex: '#2563eb',
    headerBg: 'bg-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    accentBorder: 'border-blue-600',
  },
  emerald: {
    id: 'emerald',
    name: 'Verde',
    hex: '#059669',
    headerBg: 'bg-emerald-600',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    accentBorder: 'border-emerald-600',
  },
  orange: {
    id: 'orange',
    name: 'Naranja',
    hex: '#ea580c',
    headerBg: 'bg-orange-600',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    accentBorder: 'border-orange-600',
  },
  // Mantenemos 'red' en el mapa por si existe en alguna base de datos existente,
  // pero ya no figura en los temas preseleccionados ofrecidos en la interfaz.
  red: {
    id: 'red',
    name: 'Rojo',
    hex: '#dc2626',
    headerBg: 'bg-red-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    accentBorder: 'border-red-600',
  },
};

/** Lista de temas preseleccionados mostrados como botones. Rojo fue removido a favor del selector arcoíris. */
export const PRESET_THEME_KEYS: PresetThemeColor[] = ['black', 'blue', 'emerald', 'orange'];

export function getThemeOption(color?: string | null): ThemeOption {
  if (!color) return THEME_OPTIONS.black;
  if (THEME_OPTIONS[color]) return THEME_OPTIONS[color];
  if (color.startsWith('#')) {
    return {
      id: color,
      name: 'Personalizado',
      hex: color,
      headerBg: 'bg-zinc-900',
      badgeBg: 'bg-zinc-100',
      badgeText: 'text-zinc-900',
      accentBorder: 'border-zinc-900',
    };
  }
  return THEME_OPTIONS.black;
}

/** 'custom' = imagen propia subida desde el dispositivo (ver login_bg_image). */
export type LoginBgOption = 'bistro' | 'kitchen' | 'trattoria' | 'custom';

export interface LoginBgInfo {
  id: LoginBgOption;
  name: string;
}

export const LOGIN_BG_OPTIONS: Record<Exclude<LoginBgOption, 'custom'>, LoginBgInfo> = {
  bistro: {
    id: 'bistro',
    name: 'Salón',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Cocina',
  },
  trattoria: {
    id: 'trattoria',
    name: 'Platos',
  },
};

/** Fondo del panel de administración: 'none' = liso; 'color' = color liso a elección (ver panel_bg_color); 'custom' = imagen propia (ver panel_bg_image). */
export type PanelBgOption = 'none' | 'color' | 'bistro' | 'kitchen' | 'trattoria' | 'custom';

export interface StoreConfig {
  id?: number;
  store_name: string;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  theme_color: ThemeColor;
  login_bg?: LoginBgOption;
  login_bg_image?: string | null;
  panel_bg?: PanelBgOption;
  panel_bg_image?: string | null;
  panel_bg_color?: string | null;
  mp_alias?: string | null;
}

export interface StoreConfigUpdatePayload {
  store_name: string;
  address?: string | null;
  contact_phone?: string | null;
  logo_url?: string | null;
  theme_color: ThemeColor;
  login_bg?: LoginBgOption;
  login_bg_image?: string | null;
  panel_bg?: PanelBgOption;
  panel_bg_image?: string | null;
  panel_bg_color?: string | null;
  mp_alias?: string | null;
}
