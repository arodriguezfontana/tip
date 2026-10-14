import { useEffect, useState } from 'react';
import { fetchBusinessHours } from '@/services/businessHoursService';
import type { BusinessHoursStatus } from '@/types/businessHours';

/** Cada cuánto se vuelve a consultar si el local está abierto (abre o cierra con la página abierta). */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Estado del local (abierto/cerrado y horarios). Mientras carga, o si falla la consulta, devuelve
 * null y no se bloquea nada: el backend igual rechaza los pedidos fuera de horario.
 */
export function useBusinessHours(): BusinessHoursStatus | null {
  const [status, setStatus] = useState<BusinessHoursStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchBusinessHours()
        .then((data) => {
          if (!cancelled) setStatus(data);
        })
        .catch(() => {
          // Se mantiene el último estado conocido.
        });
    };

    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}
