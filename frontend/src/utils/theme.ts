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
    document.documentElement.style.setProperty('--primary-light', `${theme.hex}15`);
    document.documentElement.style.setProperty('--primary-light-hover', `${theme.hex}25`);
    document.documentElement.style.setProperty('--primary-border', `${theme.hex}40`);
    document.documentElement.style.setProperty(
      '--primary-text',
      theme.hex === '#18181b' || theme.hex === '#000000' ? '#27272a' : theme.hex
    );
  }
  return theme;
}
