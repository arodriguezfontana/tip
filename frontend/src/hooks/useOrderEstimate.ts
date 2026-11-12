import { useEffect, useMemo } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchOrderDelayEstimate } from '@/services/orderService';

/** Cada cuánto se vuelve a consultar la estimación de un pedido pendiente (cambia con los pedidos en cola). */
export const ESTIMATE_REFRESH_INTERVAL_MS = 15000;

/**
 * La demora estimada con la que se aceptaría un pedido pendiente para ahora: sale del historial del local o,
 * si todavía no hay datos, la tiene que indicar el empleado.
 */
export function useOrderEstimate(orderId: number, needsEstimate: boolean) {
  const loadEstimate = useMemo(
    () => (needsEstimate ? () => fetchOrderDelayEstimate(orderId) : null),
    [needsEstimate, orderId]
  );
  const { data: estimate, loading, reload } = useAsyncData(loadEstimate, 'No se pudo calcular la demora estimada.');
  // Solo la primera carga muestra "calculando": al refrescar en segundo plano se sigue viendo lo anterior (sin parpadeos).
  const estimateLoading = loading && estimate === undefined;

  useEffect(() => {
    if (!needsEstimate) return;
    const intervalId = setInterval(reload, ESTIMATE_REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [needsEstimate, reload]);

  const smartMinutes = estimate?.mode === 'smart' ? estimate.estimated_minutes : null;
  return {
    estimate,
    estimateLoading,
    smartMinutes,
    // Sin estimación automática (o si no se pudo consultar) el empleado tiene que cargar la demora.
    manualRequired: needsEstimate && !estimateLoading && smartMinutes == null,
  };
}
