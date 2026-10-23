import { getThemeOption, type ThemeColor } from '@/types/storeConfig';

/**
 * Aplica el color principal del tema en el documento mediante la variable CSS --primary-color.
 * Permite que los botones de acción y elementos clave adopten el color elegido
 * dinámicamente en tiempo real en la web pública y en el panel.
 */
export function applyThemeColor(color?: ThemeColor | string | null) {
  const theme = getThemeOption(color);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--primary-color', theme.hex);
  }
  return theme;
}
