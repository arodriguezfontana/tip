import { useMemo, useState } from 'react';
import { useStats } from '@/hooks/useStats';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, presetLabel, rangeForPreset } from '@/utils/dateRange';

const PRESETS: DateRangePreset[] = ['today', 'week', 'month', 'all', 'custom'];

export function StatsSection() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  const { statusDistribution, topProducts, bestDay, loading, error } = useStats({
    dateFrom: range.from,
    dateTo: range.to,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-2xl shadow-md p-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Panel de Rendimiento y Ventas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Filtrado dinámico por período</p>
        </div>
        
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
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2 bg-white p-4 rounded-2xl shadow-md">
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

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Cargando métricas y estadísticas...</p>
      ) : error ? (
        <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Día más rentable</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">{bestDay.best_selling_day || 'Sin datos'}</p>
              </div>
              {bestDay.total_revenue !== null && (
                <p className="text-sm text-gray-600 mt-4">
                  Recaudación: <strong className="text-black">{formatCurrency(bestDay.total_revenue)}</strong>
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-md p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Estado de los Pedidos</p>
              <div className="space-y-2">
                {Object.keys(statusDistribution).length === 0 ? (
                  <p className="text-sm text-gray-500">No hay registros de pedidos en este período.</p>
                ) : (
                  Object.entries(statusDistribution).map(([status, count]) => (
                    <div key={status} className="flex justify-between items-center text-sm">
                      <span className="text-gray-700 font-medium">{status}</span>
                      <span className="bg-gray-100 text-gray-900 font-bold px-2.5 py-0.5 rounded-full text-xs">
                        {count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Top Productos más Vendidos</p>
            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">No hay productos vendidos registrados en este período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Producto</th>
                      <th className="px-4 py-2 text-right">Cantidad Vendida</th>
                      <th className="px-4 py-2 text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topProducts.map((prod) => (
                      <tr key={prod.product_name} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{prod.product_name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{prod.total_quantity}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(prod.total_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}