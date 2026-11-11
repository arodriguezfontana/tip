import { useEffect, useState } from 'react';
import { fetchStoreConfig } from '@/services/storeConfigService';
import type { StoreConfig } from '@/types/storeConfig';
import { applyThemeColor } from '@/utils/theme';

/**
 * La configuración del local (nombre, contacto, fondos, etc.), que se pide al abrir la pantalla. Al cargarla se
 * aplica el color del tema. Si no se puede cargar, la pantalla sigue con los valores por defecto.
 */
export function useStoreConfig() {
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStoreConfig()
      .then((config) => {
        if (cancelled) return;
        setStoreConfig(config);
        if (config?.theme_color) applyThemeColor(config.theme_color);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return { storeConfig, setStoreConfig };
}
