import { useEffect, useMemo, useState } from 'react';
import { ACTIVE_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder, OrderStatus } from '@/types/order';
import { fetchOrders, updateOrderStatus } from '@/services/orderService';
import { ComandaCard } from '@/components/ComandaCard';
import { generarMockOrders } from '@/utils/mockOrdenes';

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
  const [isSimulating, setIsSimulating] = useState(false);

  const [pageSize, setPageSize] = useState<number>(5);
  const [pages, setPages] = useState<Record<string, number>>({
    Pendiente: 1,
    Confirmado: 1,
    'En Camino': 1,
    'Listo para Retirar': 1,
  });

  const [pendingFilter, setPendingFilter] = useState<'ahora' | 'programados'>('ahora');

  useEffect(() => {
    if (!active || isSimulating) return;

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
  }, [active, isSimulating]);

  const handleToggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
    } else {
      setOrders(generarMockOrders(55));
      setIsSimulating(true);
      setError(null);
    }
  };

  const columns = useMemo(() => {
    return ACTIVE_ORDER_STATUSES.map((status) => {
      let allOrdersForStatus = orders
        .filter((order) => order.status === status)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (status === 'Pendiente') {
        if (pendingFilter === 'ahora') {
          allOrdersForStatus = allOrdersForStatus.filter((o) => !o.scheduled_for);
        } else if (pendingFilter === 'programados') {
          allOrdersForStatus = allOrdersForStatus.filter((o) => o.scheduled_for);
        }
      }

      const currentPage = pages[status] || 1;
      const totalPages = Math.ceil(allOrdersForStatus.length / pageSize) || 1;
      
      const safePage = Math.min(currentPage, totalPages);
      const startIndex = (safePage - 1) * pageSize;
      const paginatedOrders = allOrdersForStatus.slice(startIndex, startIndex + pageSize);

      return {
        status,
        orders: paginatedOrders,
        totalCount: allOrdersForStatus.length,
        currentPage: safePage,
        totalPages,
      };
    });
  }, [orders, pages, pageSize, pendingFilter]);

  const pendingCount = useMemo(() => {
    return orders.filter((o) => o.status === 'Pendiente').length;
  }, [orders]);

  const handlePageChange = (status: string, newPage: number) => {
    setPages((prev) => ({ ...prev, [status]: newPage }));
  };

  const handleStatusChange = async (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => {
    if (isSimulating) {
      setOrders((prev) => {
        const isTerminal = newStatus === 'Finalizado' || newStatus === 'Rechazado';
        if (isTerminal) {
          return prev.filter((order) => order.id !== orderId);
        }
        return prev.map((order) => (order.id === orderId ? { ...order, status: newStatus, estimated_minutes: estimatedMinutes ?? order.estimated_minutes } : order));
      });
      return;
    }

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
      <div className="flex flex-wrap items-center justify-between bg-white px-5 py-3 rounded-2xl shadow-xs border border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${isSimulating ? 'bg-purple-500' : 'bg-amber-500'} animate-pulse`}></span>
          <span className="text-sm font-semibold text-gray-800">
            {isSimulating ? 'Panel de Comandas (Modo Simulación)' : 'Panel de Comandas'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <span className="text-xs text-gray-500 font-medium">Ver:</span>
            {[3, 5, 7].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                className={`text-xs px-2 py-0.5 rounded-lg font-bold transition ${pageSize === size ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                {size}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleToggleSimulation}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl transition shadow-xs ${isSimulating ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}
          >
            {isSimulating ? 'Salir de Simulación' : 'Simular 55 Pedidos'}
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Pendientes de aceptar:</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${pendingCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
              {pendingCount}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && orders.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">Cargando comandas...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {columns.map((column) => (
            <div key={column.status} className="bg-gray-50/50 rounded-2xl p-3 border border-gray-100 flex flex-col">
              <div className="flex items-center justify-between pb-3 px-1 border-b border-gray-200/60 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">{COLUMN_LABELS[column.status]}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${column.status === 'Pendiente' && column.totalCount > 0 ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-800'}`}>
                  {column.totalCount}
                </span>
              </div>

              {column.status === 'Pendiente' && (
                <div className="flex bg-gray-200/70 p-0.5 rounded-xl mb-3 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => { setPendingFilter('ahora'); setPages((prev) => ({ ...prev, Pendiente: 1 })); }}
                    className={`flex-1 py-1 rounded-lg transition ${pendingFilter === 'ahora' ? 'bg-white text-black font-bold shadow-xs' : 'text-gray-600 hover:text-black'}`}
                  >
                    Ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingFilter('programados'); setPages((prev) => ({ ...prev, Pendiente: 1 })); }}
                    className={`flex-1 py-1 rounded-lg transition ${pendingFilter === 'programados' ? 'bg-white text-black font-bold shadow-xs' : 'text-gray-600 hover:text-black'}`}
                  >
                    Programados
                  </button>
                </div>
              )}

              <div className="space-y-3 min-h-[220px]">
                {column.orders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-12">Sin pedidos</p>
                ) : (
                  column.orders.map((order) => (
                    <ComandaCard key={order.id} order={order} onStatusChange={handleStatusChange} />
                  ))
                )}
              </div>

              {column.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-200/60 px-1 text-xs">
                  <button
                    type="button"
                    disabled={column.currentPage === 1}
                    onClick={() => handlePageChange(column.status, column.currentPage - 1)}
                    className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
                  >
                    Anterior
                  </button>
                  <span className="text-gray-500 font-medium">
                    {column.currentPage} de {column.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={column.currentPage === column.totalPages}
                    onClick={() => handlePageChange(column.status, column.currentPage + 1)}
                    className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}