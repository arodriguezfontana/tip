import { GrowthIndicator } from '@/components/stats/GrowthIndicator';
import { formatCurrency } from '@/utils/currency';
import type { useStats } from '@/hooks/useStats';

interface BestDayAndStatusesProps {
  kpis: ReturnType<typeof useStats>['kpis'];
  bestDay: ReturnType<typeof useStats>['bestDay'];
  statusDistribution: ReturnType<typeof useStats>['statusDistribution'];
}

/** Mejor día de ventas y pedidos por estado. */
export function BestDayAndStatuses({ kpis, bestDay, statusDistribution }: BestDayAndStatusesProps) {
  return (
    <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col justify-between border border-gray-100">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mejor día</p>
            {kpis?.best_selling_day && (
              <GrowthIndicator
                metric={
                  kpis.best_selling_day.growth_pct !== null
                    ? {
                        current: kpis.best_selling_day.revenue || 0,
                        previous: 0,
                        growth_pct: kpis.best_selling_day.growth_pct,
                        trend: (kpis.best_selling_day.trend as 'up' | 'down' | 'neutral') || 'neutral',
                        is_positive: (kpis.best_selling_day.growth_pct ?? 0) >= 0,
                      }
                    : undefined
                }
                label="vs. anterior"
              />
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{bestDay.best_selling_day || 'Sin datos'}</p>
        </div>
        {bestDay.total_revenue !== null && (
          <p className="text-sm text-gray-600 mt-4">
            Total: <strong className="text-black">{formatCurrency(bestDay.total_revenue)}</strong>
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Estado de pedidos</p>
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
  );
}
