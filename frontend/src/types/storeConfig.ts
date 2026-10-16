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
    name: 'Negro Clásico',
    hex: '#18181b',
    headerBg: 'bg-zinc-900',
    badgeBg: 'bg-zinc-100',
    badgeText: 'text-zinc-900',
    accentBorder: 'border-zinc-900',
  },
  red: {
    id: 'red',
    name: 'Rojo Gourmet',
    hex: '#dc2626',
    headerBg: 'bg-red-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    accentBorder: 'border-red-600',
  },
  blue: {
    id: 'blue',
    name: 'Azul Real',
    hex: '#2563eb',
    headerBg: 'bg-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    accentBorder: 'border-blue-600',
  },
  emerald: {
    id: 'emerald',
    name: 'Verde Esmeralda',
    hex: '#059669',
    headerBg: 'bg-emerald-600',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    accentBorder: 'border-emerald-600',
  },
  orange: {
    id: 'orange',
    name: 'Naranja Cálido',
    hex: '#ea580c',
    headerBg: 'bg-orange-600',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    accentBorder: 'border-orange-600',
  },
};

export interface StoreConfig {
  id?: number;
  store_name: string;
  address: string | null;
  opening_hours: string | null;
  contact_phone: string | null;
  logo_url: string | null;
  theme_color: ThemeColor;
}

export interface StoreConfigUpdatePayload {
  store_name: string;
  address?: string | null;
  opening_hours?: string | null;
  contact_phone?: string | null;
  logo_url?: string | null;
  theme_color: ThemeColor;
}

