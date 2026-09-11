import { useEffect, useMemo, useState } from 'react';
import type { AdminOrder } from '@/types/order';
import { fetchOrders } from '@/services/orderService';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import type { GroupBy } from '@/utils/orderGrouping';
import { groupOrdersByPeriod } from '@/utils/orderGrouping';
import { DateRangeFilter } from '@/components/DateRangeFilter';

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];

export function IngresosView() {
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
  const revenueGroups = useMemo(() => groupOrdersByPeriod(facturedOrders, groupBy), [facturedOrders, groupBy]);

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
            <p className="text-sm text-gray-500 text-center py-8">No hay ingresos en el rango seleccionado.</p>
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
  );
}
