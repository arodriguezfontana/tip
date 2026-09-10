import { useEffect, useMemo, useState } from 'react';
import { ACTIVE_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder, OrderStatus } from '@/types/order';
import { fetchOrders, updateOrderStatus } from '@/services/orderService';
import { ComandaCard } from '@/components/ComandaCard';

const POLL_INTERVAL_MS = 10000;

const COLUMN_LABELS: Record<OrderStatus, string> = {
  Pendiente: 'Pendientes',
  Confirmado: 'Confirmados',
  'En Camino': 'En Camino',
  'Listo para Retirar': 'Listo para Retirar',
  Finalizado: 'Finalizado',
  Rechazado: 'Rechazado',
};

interface ComandasBoardProps {
  active: boolean;
}

export function ComandasBoard({ active }: ComandasBoardProps) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchOrders({ status: ACTIVE_ORDER_STATUSES });
        if (!cancelled) {
          setOrders(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('No se pudieron cargar las comandas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [active]);

  const columns = useMemo(() => {
    return ACTIVE_ORDER_STATUSES.map((status) => ({
      status,
      orders: orders.filter((order) => order.status === status),
    }));
  }, [orders]);

  const handleStatusChange = async (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => {
    try {
      const updated = await updateOrderStatus(orderId, newStatus, estimatedMinutes);
      setOrders((prev) => {
        const isTerminal = updated.status === 'Finalizado' || updated.status === 'Rechazado';
        if (isTerminal) {
          return prev.filter((order) => order.id !== orderId);
        }
        return prev.map((order) => (order.id === orderId ? updated : order));
      });
      setError(null);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
      setError(message || 'No se pudo actualizar el estado del pedido.');
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && orders.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">Cargando comandas...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((column) => (
            <div key={column.status} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">{COLUMN_LABELS[column.status]}</h3>
                <span className="bg-gray-200 text-gray-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  {column.orders.length}
                </span>
              </div>
              <div className="space-y-3">
                {column.orders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Sin pedidos</p>
                ) : (
                  column.orders.map((order) => (
                    <ComandaCard key={order.id} order={order} onStatusChange={handleStatusChange} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
