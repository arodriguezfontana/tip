import { GrowthIndicator } from '@/components/stats/GrowthIndicator';
import { formatCurrency } from '@/utils/currency';
import { Tooltip } from '@/components/ui/Tooltip';
import type { useStats } from '@/hooks/useStats';

interface KpiCardsProps {
  kpis: ReturnType<typeof useStats>['kpis'];
  bestDay: ReturnType<typeof useStats>['bestDay'];
  statusDistribution: ReturnType<typeof useStats>['statusDistribution'];
}

/** Facturación, ticket promedio, margen bruto, cancelaciones, mejor día y estado de pedidos (3 y 3). */
export function KpiCards({ kpis, bestDay, statusDistribution }: KpiCardsProps) {
  const kpiData = kpis ?? {
    revenue: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    average_ticket: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    gross_profit: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    gross_margin_pct: 0,
    cogs: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    orders_count: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    completed_orders_count: 0,
    cancelled_orders_count: 0,
    cancellation_rate: { current: 0, previous: 0, growth_pct: null, trend: 'neutral' as const, is_positive: true },
    best_selling_day: null,
    top_products: [],
    goal: null,
  };

  const marginVal = Number(kpiData.gross_margin_pct);
  const marginBadgeClass =
    marginVal > 0
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : marginVal < 0
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-gray-600 bg-gray-50 border-gray-200';

  return (
    <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 1. Facturación */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Facturación</span>
            <Tooltip content="Ingresos totales generados por pedidos en el período." />
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpiData.revenue.current)}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <GrowthIndicator metric={kpiData.revenue} label="vs. anterior" />
          <span className="text-[11px] text-gray-400">{kpiData.orders_count.current} pedidos</span>
        </div>
      </div>

      {/* 2. Ticket Promedio */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ticket Promedio</span>
            <Tooltip content="Monto promedio facturado por cada pedido finalizado." />
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpiData.average_ticket.current)}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <GrowthIndicator metric={kpiData.average_ticket} label="vs. anterior" />
          <span className="text-[11px] text-gray-400">por pedido</span>
        </div>
      </div>

      {/* 3. Margen Bruto */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Margen Bruto</span>
              <Tooltip content="Rentabilidad bruta descontando el costo registrado de insumos." />
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${marginBadgeClass}`}>
              {kpiData.gross_margin_pct}%
            </span>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpiData.gross_profit.current)}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Costo insumos:</span>
          <span className="font-semibold text-gray-700">{formatCurrency(kpiData.cogs.current)}</span>
        </div>
      </div>

      {/* 4. Cancelaciones */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cancelaciones</span>
            <Tooltip content="Tasa de pedidos cancelados respecto al total recibido." />
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{kpiData.cancellation_rate.current}%</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <GrowthIndicator metric={kpiData.cancellation_rate} label="vs. anterior" />
        </div>
      </div>

      {/* 5. Mejor día */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mejor día</span>
            {kpiData.best_selling_day && (
              <GrowthIndicator
                metric={
                  kpiData.best_selling_day.growth_pct !== null
                    ? {
                        current: kpiData.best_selling_day.revenue || 0,
                        previous: 0,
                        growth_pct: kpiData.best_selling_day.growth_pct,
                        trend: (kpiData.best_selling_day.trend as 'up' | 'down' | 'neutral') || 'neutral',
                        is_positive: (kpiData.best_selling_day.growth_pct ?? 0) >= 0,
                      }
                    : undefined
                }
                label="vs. anterior"
              />
            )}
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-gray-900">{bestDay.best_selling_day || 'Sin datos'}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          {bestDay.total_revenue !== null ? (
            <>
              <span>Total:</span>
              <strong className="text-black font-semibold">{formatCurrency(bestDay.total_revenue)}</strong>
            </>
          ) : (
            <span className="text-gray-400">Sin ventas</span>
          )}
        </div>
      </div>

      {/* 6. Estado de pedidos */}
      <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between hover:shadow-lg transition">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 block">Estado de pedidos</span>
            <Tooltip content="Desglose del estado actual de todos los pedidos ingresados." />
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto">
            {Object.keys(statusDistribution).length === 0 ? (
              <p className="text-xs text-gray-500">No hay registros de pedidos en este período.</p>
            ) : (
              Object.entries(statusDistribution).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center text-xs">
                  <span className="text-gray-700 font-medium">{status}</span>
                  <span className="bg-gray-100 text-gray-900 font-bold px-2 py-0.5 rounded-full text-[11px]">
                    {count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
