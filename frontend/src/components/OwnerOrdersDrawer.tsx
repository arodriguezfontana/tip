import { useEffect, useMemo, useState } from 'react';
import type { AdminOrder } from '@/types/order';
import { fetchOrders } from '@/services/orderService';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, presetLabel, rangeForPreset } from '@/utils/dateRange';
import type { GroupBy } from '@/utils/orderGrouping';
import { groupOrdersByPeriod } from '@/utils/orderGrouping';

type Tab = 'historial' | 'ingresos';

const PRESETS: DateRangePreset[] = ['today', 'week', 'month', 'all', 'custom'];
const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

function statusBadgeClasses(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes('pendiente')) return 'bg-yellow-100 text-yellow-800';
  if (normalized.includes('confirm')) return 'bg-blue-100 text-blue-800';
  if (normalized.includes('entreg') || normalized.includes('complet')) return 'bg-green-100 text-green-800';
  if (normalized.includes('cancel')) return 'bg-red-100 text-red-800';
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

export function OwnerOrdersDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('historial');
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

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
    if (!open) return;
    if (preset === 'custom' && (!customFrom || !customTo)) return;

    let cancelled = false;

    async function load() {
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
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [open, range.from, range.to, preset, customFrom, customTo]);

  const totalRevenue = useMemo(() => orders.reduce((sum, order) => sum + order.total_amount, 0), [orders]);
  const revenueGroups = useMemo(() => groupOrdersByPeriod(orders, groupBy), [orders, groupBy]);

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-xl bg-gray-50 z-50 shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="bg-black text-white px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold">Pedidos e ingresos</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="w-8 h-8 rounded-lg hover:bg-white/10 transition flex items-center justify-center text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex border-b border-gray-200 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setTab('historial')}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              tab === 'historial' ? 'text-black border-b-2 border-black' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Historial de pedidos
          </button>
          <button
            type="button"
            onClick={() => setTab('ingresos')}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              tab === 'ingresos' ? 'text-black border-b-2 border-black' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Ingresos
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Rango de fechas
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    preset === p ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {presetLabel(p)}
                </button>
              ))}
            </div>

            {preset === 'custom' && (
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
                <span className="text-gray-400 text-sm">a</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dinero facturado</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
          )}

          {loading ? (
            <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
          ) : tab === 'historial' ? (
            orders.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No hay pedidos en el rango seleccionado.
              </p>
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
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {formatDateTime(order.created_at)}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{order.customer_name}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatCurrency(order.total_amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClasses(
                                order.status
                              )}`}
                            >
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Agrupar por
                </span>
                <div className="flex gap-2">
                  {GROUP_BY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGroupBy(option.value)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                        groupBy === option.value
                          ? 'bg-black text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {revenueGroups.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No hay ingresos en el rango seleccionado.
                </p>
              ) : (
                <div className="bg-white rounded-2xl shadow-md overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Período</th>
                          <th className="px-4 py-3 text-right">Pedidos</th>
                          <th className="px-4 py-3 text-right">Ingresos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {revenueGroups.map((group) => (
                          <tr key={group.key} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900 capitalize">{group.label}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{group.orderCount}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-900">
                              {formatCurrency(group.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
