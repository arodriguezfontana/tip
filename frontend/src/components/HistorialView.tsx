import { useCallback, useMemo, useState } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { AdminOrder, PaymentMethod } from '@/types/order';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import { fetchOrders } from '@/services/orderService';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { OrderDetailModal } from '@/components/OrderDetailModal';
import { PrinterIcon } from '@/components/Icons';
import { useReprint } from '@/hooks/useReprint';
import { PanelNote } from '@/components/ui/PanelNote';

function isOrderFinalized(status: string): boolean {
  const norm = (status || '').trim().toLowerCase();
  return norm === 'finalizado' || norm.includes('complet') || norm.includes('entreg');
}

function isOrderCancelled(status: string): boolean {
  const norm = (status || '').trim().toLowerCase();
  return norm.includes('cancel') || norm.includes('rechaz');
}

function statusBadgeClasses(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes('pendiente')) return 'bg-yellow-100 text-yellow-800';
  if (normalized.includes('confirm')) return 'bg-green-100 text-green-800';
  if (normalized.includes('entreg') || normalized.includes('complet')) return 'bg-green-100 text-green-800';
  if (normalized.includes('cancel') || normalized.includes('rechaz')) return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-800';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ORDERS_PAGE_SIZE = 10;

export function HistorialView() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'finalizados' | 'cancelados'>('todos');
  const [page, setPage] = useState(1);

  const [detailOrder, setDetailOrder] = useState<AdminOrder | null>(null);
  const closeDetail = useCallback(() => setDetailOrder(null), []);
  const { reprint, printingId, feedback: printFeedback } = useReprint();

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  // Con un rango personalizado incompleto no se pide nada (se siguen mostrando los últimos pedidos).
  const rangeIncomplete = preset === 'custom' && (!customFrom || !customTo);
  const load = useCallback(() => fetchOrders({ dateFrom: range.from, dateTo: range.to }), [range.from, range.to]);
  const { data: orders = [], loading, error } = useAsyncData(rangeIncomplete ? null : load, 'No se pudieron cargar los pedidos.');

  // El dinero facturado y el conteo de facturados contemplan estrictamente los pedidos finalizados
  const facturedOrders = useMemo(() => orders.filter((order) => isOrderFinalized(order.status)), [orders]);
  const totalRevenue = useMemo(
    () => facturedOrders.reduce((sum, order) => sum + order.total_amount, 0),
    [facturedOrders]
  );

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'finalizados') {
      return orders.filter((order) => isOrderFinalized(order.status));
    }
    if (statusFilter === 'cancelados') {
      return orders.filter((order) => isOrderCancelled(order.status));
    }
    return orders;
  }, [orders, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedOrders = filteredOrders.slice((currentPage - 1) * ORDERS_PAGE_SIZE, currentPage * ORDERS_PAGE_SIZE);

  const handleStatusFilterChange = (filter: 'todos' | 'finalizados' | 'cancelados') => {
    setStatusFilter(filter);
    setPage(1);
  };

  const counts = useMemo(
    () => ({
      todos: orders.length,
      finalizados: orders.filter((o) => isOrderFinalized(o.status)).length,
      cancelados: orders.filter((o) => isOrderCancelled(o.status)).length,
    }),
    [orders]
  );

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <DateRangeFilter
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={(newPreset) => {
          setPreset(newPreset);
          setPage(1);
        }}
        onCustomFromChange={(val) => {
          setCustomFrom(val);
          setPage(1);
        }}
        onCustomToChange={(val) => {
          setCustomTo(val);
          setPage(1);
        }}
      />

      <div className="shrink-0 bg-white rounded-2xl shadow-md p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dinero facturado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{facturedOrders.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filtrar por estado">
          {(
            [
              { key: 'todos', label: 'Todos', count: counts.todos },
              { key: 'finalizados', label: 'Finalizados', count: counts.finalizados },
              { key: 'cancelados', label: 'Cancelados', count: counts.cancelados },
            ] as const
          ).map((tab) => {
            const isActive = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleStatusFilterChange(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition ${
                  isActive
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {printFeedback && (
        <div
          role={printFeedback.type === 'error' ? 'alert' : 'status'}
          className={`shrink-0 rounded-xl px-4 py-3 text-sm ${
            printFeedback.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'
          }`}
        >
          {printFeedback.message}
        </div>
      )}

      {loading ? (
        <PanelNote>Cargando...</PanelNote>
      ) : orders.length === 0 ? (
        <PanelNote>No hay pedidos en el rango seleccionado.</PanelNote>
      ) : filteredOrders.length === 0 ? (
        <PanelNote>No hay pedidos que coincidan con el filtro.</PanelNote>
      ) : (
        <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col lg:min-h-48">
          <div className="overflow-auto lg:min-h-0">
            <table className="w-full text-sm table-fixed min-w-[720px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="w-20 px-4 py-3">ID</th>
                  <th className="w-40 px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="w-32 px-4 py-3">Pago</th>
                  <th className="w-28 px-4 py-3 text-right">Total</th>
                  <th className="w-32 px-4 py-3">Estado</th>
                  <th className="w-24 px-4 py-3 text-right">Comanda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedOrders.map((order) => {
                  const paymentKey = (order.payment_method || '').toLowerCase() as PaymentMethod;
                  const paymentLabel = PAYMENT_METHOD_LABEL[paymentKey] || order.payment_method || 'Efectivo';
                  return (
                    <tr key={order.id} onClick={() => setDetailOrder(order)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailOrder(order);
                          }}
                          aria-label={`Ver detalle del pedido #${order.shift_number}`}
                          className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                        >
                          #{order.shift_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(order.created_at)}</td>
                      <td className="px-4 py-3 text-gray-900 truncate" title={order.customer_name}>{order.customer_name}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                          {paymentLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(order.total_amount)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void reprint(order);
                          }}
                          disabled={printingId === order.id}
                          aria-label={`Imprimir comanda del pedido #${order.shift_number}`}
                          title="Imprimir comanda"
                          className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                        >
                          <PrinterIcon className={`w-4 h-4 ${printingId === order.id ? 'animate-pulse' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 bg-white">
            <span>
              Mostrando {pagedOrders.length} de {filteredOrders.length} pedidos
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Página anterior"
                  className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-semibold"
                >
                  &larr; Anterior
                </button>
                <span className="font-semibold text-gray-700">
                  {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Página siguiente"
                  className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-semibold"
                >
                  Siguiente &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {detailOrder && <OrderDetailModal key={detailOrder.id} order={detailOrder} onClose={closeDetail} />}
    </div>
  );
}
