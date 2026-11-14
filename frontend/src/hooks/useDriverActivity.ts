import { useCallback, useEffect } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchDriverActivity } from '@/services/deliveryDriverService';
import type { DriverActivityParams } from '@/services/deliveryDriverService';

const POLL_INTERVAL_MS = 10000;

/**
 * El historial de viajes de un repartidor en el período indicado. Se refresca cada pocos segundos para reflejar los
 * viajes que salen y los pedidos que se finalizan en el tablero de comandas (igual que el propio tablero).
 * Con `driverId` nulo (todavía no se eligió repartidor) no se pide nada.
 */
export function useDriverActivity(driverId: number | null, { dateFrom, dateTo, currentShift }: DriverActivityParams) {
  const load = useCallback(
    () => fetchDriverActivity(driverId as number, { dateFrom, dateTo, currentShift }),
    [driverId, dateFrom, dateTo, currentShift]
  );
  const result = useAsyncData(driverId === null ? null : load, 'No se pudo cargar el historial de viajes.');
  const { reload } = result;

  useEffect(() => {
    if (driverId === null) return;
    const intervalId = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [driverId, reload]);

  return result;
}
