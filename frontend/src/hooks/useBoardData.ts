import { useEffect, useState } from 'react';
import { fetchDeliveryDrivers } from '@/services/deliveryDriverService';
import { fetchOrders } from '@/services/orderService';
import { ACTIVE_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder } from '@/types/order';
import type { DeliveryDriver } from '@/types/deliveryDriver';

const POLL_INTERVAL_MS = 10000;

/**
 * Los pedidos en curso y los repartidores activos del tablero de comandas. Se piden al abrir y se refrescan cada
 * pocos segundos, salvo en el modo simulación, donde los datos son locales.
 */
export function useBoardData(isSimulating: boolean) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [activeDrivers, setActiveDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(false);
  // "Cargando..." solo en la primera carga: los refrescos periódicos no tienen que reemplazar el tablero (parpadeo).
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isSimulating) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [ordersData, driversData] = await Promise.all([
          fetchOrders({ status: ACTIVE_ORDER_STATUSES }),
          fetchDeliveryDrivers({ active_only: true }).catch(() => [] as DeliveryDriver[]),
        ]);
        if (!cancelled) {
          setOrders(ordersData);
          setActiveDrivers(driversData);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('No se pudieron cargar las comandas.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHasLoaded(true);
        }
      }
    };

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isSimulating]);

  return { orders, setOrders, activeDrivers, setActiveDrivers, loading, hasLoaded, error, setError };
}
