import { GrowthIndicator } from '@/components/stats/GrowthIndicator';
import { formatCurrency } from '@/utils/currency';
import type { useStats } from '@/hooks/useStats';

interface KpiCardsProps {
  kpis: ReturnType<typeof useStats>['kpis'];
}

/** Facturación, ticket promedio, rentabilidad y tasa de rechazo, con su variación. */
export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <>
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
    </>
  );
}
