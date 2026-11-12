import { formatCurrency } from '@/utils/currency';
import type { useStats } from '@/hooks/useStats';

interface GoalsProgressProps {
  kpis: ReturnType<typeof useStats>['kpis'];
  setGoalsModalOpen: (open: boolean) => void;
}

/** Seguimiento del avance contra las metas comerciales del período. */
export function GoalsProgress({ kpis, setGoalsModalOpen }: GoalsProgressProps) {
  return (
    <>
        {kpis?.goal && (
          <div className="shrink-0 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>🎯</span> Seguimiento de Metas Comerciales
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 uppercase tracking-wider">
                    {kpis.goal.period_type === 'daily'
                      ? 'Meta Diaria'
                      : kpis.goal.period_type === 'weekly'
                      ? 'Meta Semanal'
                      : 'Meta Mensual'}
                  </span>
                </h4>
                <p className="text-xs text-gray-500">
                  Comparación del rendimiento real contra la meta configurada para este período.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGoalsModalOpen(true)}
                className="text-xs font-semibold text-gray-700 hover:text-black underline"
              >
                Modificar metas
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Meta de Facturación */}
              <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-200/60">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Facturación</span>
                  <span className="text-xs font-bold text-gray-900">
                    {formatCurrency(kpis.revenue.current)} / {formatCurrency(kpis.goal.target_revenue)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden my-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      kpis.goal.revenue_progress_pct >= 100
                        ? 'bg-emerald-500'
                        : kpis.goal.revenue_progress_pct >= 60
                        ? 'bg-blue-600'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, kpis.goal.revenue_progress_pct)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span className="font-bold text-gray-800">{kpis.goal.revenue_progress_pct}% alcanzado</span>
                  {kpis.goal.revenue_remaining > 0 ? (
                    <span>Faltan {formatCurrency(kpis.goal.revenue_remaining)}</span>
                  ) : (
                    <span className="text-emerald-700 font-bold">¡Objetivo alcanzado! 🎉</span>
                  )}
                </div>
              </div>

              {/* Meta de Pedidos */}
              <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-200/60">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Cantidad de Pedidos</span>
                  <span className="text-xs font-bold text-gray-900">
                    {kpis.completed_orders_count} / {kpis.goal.target_orders} pedidos
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden my-2">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      kpis.goal.orders_progress_pct >= 100
                        ? 'bg-emerald-500'
                        : kpis.goal.orders_progress_pct >= 60
                        ? 'bg-blue-600'
                        : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min(100, kpis.goal.orders_progress_pct)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span className="font-bold text-gray-800">{kpis.goal.orders_progress_pct}% alcanzado</span>
                  {kpis.goal.orders_remaining > 0 ? (
                    <span>Faltan {kpis.goal.orders_remaining} pedidos</span>
                  ) : (
                    <span className="text-emerald-700 font-bold">¡Objetivo alcanzado! 🎉</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
