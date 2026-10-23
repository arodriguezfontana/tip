import { useEffect, useState } from 'react';
import { fetchHandoffs } from '@/services/handoffService';
import type { HandoffSummary } from '@/types/handoff';

export const HANDOFF_POLL_INTERVAL_MS = 4000;

/** Conversaciones derivadas a un empleado, consultadas periódicamente. */
export function useHandoffs() {
  const [handoffs, setHandoffs] = useState<HandoffSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchHandoffs()
        .then((data) => {
          if (!cancelled) setHandoffs(data);
        })
        // Un fallo puntual no borra las notificaciones: se reintenta en la próxima consulta.
        .catch(() => undefined);
    };
    load();
    const intervalId = setInterval(load, HANDOFF_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return handoffs;
}
