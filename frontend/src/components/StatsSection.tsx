import { useMemo, useState } from 'react';
import { useStats } from '@/hooks/useStats';
import { formatCurrency } from '@/utils/currency';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, presetLabel, rangeForPreset } from '@/utils/dateRange';
import { PanelNote } from '@/components/ui/PanelNote';
import { BusinessGoalsModal } from '@/components/BusinessGoalsModal';
import { StrategicInsightModal } from '@/components/StrategicInsightModal';
import type { GrowthMetric } from '@/types/stats';

const PRESETS: DateRangePreset[] = ['today', 'week', 'month', 'all', 'custom'];

function GrowthIndicator({ metric, label }: { metric?: GrowthMetric; label?: string }) {
  if (!metric || metric.growth_pct === null) return null;
  const isUp = metric.trend === 'up';
  const isDown = metric.trend === 'down';
  const isPositive = metric.is_positive;

  const colorClass = isUp
    ? isPositive
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-700 bg-red-50 border-red-200'
    : isDown
    ? isPositive
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-700 bg-red-50 border-red-200'
    : 'text-gray-600 bg-gray-50 border-gray-200';

  const symbol = isUp ? '↑' : isDown ? '↓' : '•';
  const prefix = isUp ? '+' : '';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}
      title={`Período previo: ${metric.previous}`}
    >
      <span>{symbol}</span>
      <span>
        {prefix}
        {metric.growth_pct}%
      </span>
      {label && <span className="font-normal opacity-85">{label}</span>}
    </span>
  );
}

export function StatsSection() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [insightModalOpen, setInsightModalOpen] = useState(false);

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  const { statusDistribution, topProducts, bestDay, kpis, loading, error, reload } = useStats({
    dateFrom: range.from,
    dateTo: range.to,
  });

  return (
    <div className="flex flex-col gap-6 lg:h-full">
      {/* Barra superior con filtros y acciones */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Panel de Rendimiento y Ventas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Métricas clave, seguimiento de metas y evaluación de rentabilidad comercial.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={() => setGoalsModalOpen(true)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition flex items-center gap-1.5 shadow-2xs"
          >
            <span>🎯</span> Metas Comerciales
          </button>

          <button
            type="button"
            onClick={() => setInsightModalOpen(true)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 transition flex items-center gap-1.5 shadow-2xs"
          >
            <span>💡</span> Diagnóstico IA
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="shrink-0 flex items-center gap-2 bg-white p-4 rounded-2xl shadow-md border border-gray-100">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <span className="text-gray-400 text-sm font-medium">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      )}

      {loading ? (
        <PanelNote>Cargando métricas y estadísticas...</PanelNote>
      ) : error ? (
        <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-1 lg:min-h-0">
          {/* US-49: Visualización del Progreso de Metas de Negocio */}
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

          {/* US-49: Nuevos KPIs Estratégicos con Indicadores de Crecimiento */}
          {kpis && (
            <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Facturación Total */}
              <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Facturación Total</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.revenue.current)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <GrowthIndicator metric={kpis.revenue} label="vs. anterior" />
                  <span className="text-[11px] text-gray-400">{kpis.orders_count.current} pedidos</span>
                </div>
              </div>

              {/* Ticket Promedio */}
              <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ticket Promedio</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.average_ticket.current)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <GrowthIndicator metric={kpis.average_ticket} label="vs. anterior" />
                  <span className="text-[11px] text-gray-400">por pedido fin.</span>
                </div>
              </div>

              {/* Rentabilidad y Margen Bruto */}
              <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Margen Bruto</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {kpis.gross_margin_pct}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <p className="text-2xl font-bold text-gray-900">{formatCurrency(kpis.gross_profit.current)}</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Costo insumos (COGS):</span>
                  <span className="font-semibold text-gray-700">{formatCurrency(kpis.cogs.current)}</span>
                </div>
              </div>

              {/* Tasa de Rechazo / Cancelación */}
              <div className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tasa de Cancelación</span>
                  <div className="flex items-baseline justify-between mt-2">
                    <p className="text-2xl font-bold text-gray-900">{kpis.cancellation_rate.current}%</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <GrowthIndicator metric={kpis.cancellation_rate} label="vs. anterior" />
                  <span className="text-[11px] text-gray-400">rechazos y canc.</span>
                </div>
              </div>
            </div>
          )}

          {/* Sección Día más rentable y Estados de Pedidos */}
          <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col justify-between border border-gray-100">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Día más rentable</p>
                  {kpis?.best_selling_day && (
                    <GrowthIndicator
                      metric={
                        kpis.best_selling_day.growth_pct !== null
                          ? {
                              current: kpis.best_selling_day.revenue || 0,
                              previous: 0,
                              growth_pct: kpis.best_selling_day.growth_pct,
                              trend: (kpis.best_selling_day.trend as 'up' | 'down' | 'neutral') || 'neutral',
                              is_positive: true,
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
                  Recaudación: <strong className="text-black">{formatCurrency(bestDay.total_revenue)}</strong>
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
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

          {/* Top Productos más Vendidos con Rentabilidad y Márgenes */}
          <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col lg:min-h-48 border border-gray-100">
            <div className="shrink-0 flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Top Productos más Vendidos</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {kpis?.top_products?.length
                    ? 'Desglose comercial detallado con estimación de costos por receta y márgenes brutos.'
                    : 'Unidades vendidas e ingresos brutos por producto.'}
                </p>
              </div>
            </div>

            {topProducts.length === 0 ? (
              <p className="text-sm text-gray-500">No hay productos vendidos registrados en este período.</p>
            ) : (
              <div className="overflow-auto lg:min-h-0">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2">Producto</th>
                      <th className="px-4 py-2 text-right">Cantidad Vendida</th>
                      <th className="px-4 py-2 text-right">Ingresos</th>
                      {kpis?.top_products && kpis.top_products.length > 0 && (
                        <>
                          <th className="px-4 py-2 text-right">Costo Est.</th>
                          <th className="px-4 py-2 text-right">Ganancia Bruta</th>
                          <th className="px-4 py-2 text-right">Margen %</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topProducts.map((prod) => {
                      const kpiProd = kpis?.top_products?.find((p) => p.product_name === prod.product_name);
                      return (
                        <tr key={prod.product_name} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{prod.product_name}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{prod.total_quantity}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatCurrency(prod.total_revenue)}
                          </td>
                          {kpis?.top_products && kpis.top_products.length > 0 && (
                            <>
                              <td className="px-4 py-3 text-right text-gray-500 text-xs">
                                {kpiProd ? formatCurrency(kpiProd.estimated_cost) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-emerald-700 text-xs">
                                {kpiProd ? formatCurrency(kpiProd.gross_profit) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-xs">
                                {kpiProd ? (
                                  <span className="font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                                    {kpiProd.margin_pct}%
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales */}
      <BusinessGoalsModal
        isOpen={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        onSaved={reload}
      />

      <StrategicInsightModal
        isOpen={insightModalOpen}
        onClose={() => setInsightModalOpen(false)}
        params={{ dateFrom: range.from, dateTo: range.to }}
      />
    </div>
  );
}
