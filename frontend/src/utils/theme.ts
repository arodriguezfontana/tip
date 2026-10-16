import { THEME_OPTIONS, type ThemeColor } from '@/types/storeConfig';

/**
 * Aplica el color principal del tema en el documento mediante la variable CSS --primary-color.
 * Permite que todos los botones de acción y elementos clave adopten el color elegido
 * dinámicamente en la web de clientes, el panel de administración y el login.
 */
export function applyThemeColor(color?: ThemeColor | string | null) {
  if (typeof document === 'undefined') return THEME_OPTIONS.black;
  const key = (color as ThemeColor) || 'black';
  const theme = THEME_OPTIONS[key] || THEME_OPTIONS.black;
  document.documentElement.style.setProperty('--primary-color', theme.hex);
  return theme;
}

