export type ThemeColor = 'black' | 'red' | 'blue' | 'emerald' | 'orange';

export interface ThemeOption {
  id: ThemeColor;
  name: string;
  hex: string;
  headerBg: string;
  badgeBg: string;
  badgeText: string;
  accentBorder: string;
}

export const THEME_OPTIONS: Record<ThemeColor, ThemeOption> = {
  black: {
    id: 'black',
    name: 'Negro',
    hex: '#18181b',
    headerBg: 'bg-zinc-900',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-900',
    accentBorder: 'border-zinc-900',
  },
  red: {
    id: 'red',
    name: 'Rojo',
    hex: '#dc2626',
    headerBg: 'bg-red-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    accentBorder: 'border-red-600',
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
};

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

export interface StoreConfig {
  id?: number;
  store_name: string;
  address: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  theme_color: ThemeColor;
  login_bg?: LoginBgOption;
  login_bg_image?: string | null;
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
  mp_alias?: string | null;
}

