import { useEffect, useMemo, useState } from 'react';
import type { AdminOrder } from '@/types/order';
import { fetchOrders } from '@/services/orderService';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import { DateRangeFilter } from '@/components/DateRangeFilter';

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

export function HistorialView() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  useEffect(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOrders({ dateFrom: range.from, dateTo: range.to });
        if (!cancelled) setOrders(data);
      } catch {
        if (!cancelled) setError('No se pudieron cargar los pedidos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, preset, customFrom, customTo]);

  const facturedOrders = useMemo(() => orders.filter((order) => order.status !== 'Rechazado'), [orders]);
  const totalRevenue = useMemo(
    () => facturedOrders.reduce((sum, order) => sum + order.total_amount, 0),
    [facturedOrders]
  );

  return (
    <div className="space-y-4">
      <DateRangeFilter
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        onPresetChange={setPreset}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      <div className="bg-white rounded-2xl shadow-md p-6 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dinero facturado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{facturedOrders.length}</p>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No hay pedidos en el rango seleccionado.</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">#{order.id}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateTime(order.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900">{order.customer_name}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
