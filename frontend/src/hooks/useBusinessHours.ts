import { useEffect } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchBusinessHours } from '@/services/businessHoursService';
import type { BusinessHoursStatus } from '@/types/businessHours';

/** Cada cuánto se vuelve a consultar si el local está abierto (abre o cierra con la página abierta). */
const REFRESH_INTERVAL_MS = 60_000;

/**
 * Estado del local (abierto/cerrado y horarios). Mientras carga, o si falla la consulta, devuelve
 * null y no se bloquea nada: el backend igual rechaza los pedidos fuera de horario. Si una consulta
 * posterior falla se mantiene el último estado conocido.
 */
export function useBusinessHours(): BusinessHoursStatus | null {
  const { data, reload } = useAsyncData(fetchBusinessHours, 'No se pudo consultar el horario del local.');

  useEffect(() => {
    const interval = setInterval(reload, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reload]);

  return data ?? null;
}
