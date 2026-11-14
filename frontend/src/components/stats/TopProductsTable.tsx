import { useMemo } from 'react';
import { formatCurrency } from '@/utils/currency';
import type { useStats } from '@/hooks/useStats';

interface TopProductsTableProps {
  kpis: ReturnType<typeof useStats>['kpis'];
  topProducts: ReturnType<typeof useStats>['topProducts'];
}

/** 5 más vendidos (con ganancias), 5 más rentables y 5 promos más vendidas en 3 columnas. */
export function TopProductsTable({ kpis, topProducts }: TopProductsTableProps) {
  // 1. Top 5 más vendidos
  const displayProducts = topProducts.slice(0, 5);

  // 2. Top 5 más rentables (ordenados por margen % y ganancia)
  const topProductsList = kpis?.top_products;
  const topRentables = useMemo(() => {
    if (!topProductsList) return [];
    return [...topProductsList]
      .sort((a, b) => b.margin_pct - a.margin_pct || b.gross_profit - a.gross_profit)
      .slice(0, 5);
  }, [topProductsList]);

  // 3. Top 5 promociones más vendidas
  const topPromos = (kpis?.top_promotions ?? []).slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* 1. Más Vendidos (Top 5) */}
      <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col justify-between border border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Más vendidos</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Top 5 por unidades pedidas.</p>
            </div>
          </div>

          {displayProducts.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No hay productos vendidos registrados en este período.</p>
          ) : (
            <div className="space-y-2" role="table">
              {displayProducts.map((prod) => {
                const kpiProd = kpis?.top_products?.find((p) => p.product_name === prod.product_name);
                return (
                  <div
                    key={prod.product_name}
                    role="row"
                    className="flex items-center justify-between p-2 rounded-xl bg-gray-50/70 border border-gray-100 text-xs"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{prod.product_name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {kpiProd ? (
                          <>
                            <span>Ganancias</span>: <strong className="text-emerald-700">{formatCurrency(kpiProd.gross_profit)}</strong>
                          </>
                        ) : (
                          <>
                            <span>Ingresos</span>: <strong className="text-gray-900">{formatCurrency(prod.total_revenue)}</strong>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                      {prod.total_quantity} pedidos
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. Más Rentables (Top 5) */}
      <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col justify-between border border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Más rentables</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Top 5 con mayor margen y ganancia.</p>
            </div>
          </div>

          {topRentables.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">No hay datos de rentabilidad en este período.</p>
          ) : (
            <div className="space-y-2">
              {topRentables.map((p) => {
                const marginBadge =
                  p.margin_pct > 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : p.margin_pct < 0
                    ? 'bg-red-50 text-red-800 border-red-200'
                    : 'bg-gray-50 text-gray-800 border-gray-200';
                return (
                  <div
                    key={p.product_name}
                    className="flex items-center justify-between p-2 rounded-xl bg-gray-50/70 border border-gray-100 text-xs"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{p.product_name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Ganancia: <strong className="text-emerald-700">{formatCurrency(p.gross_profit)}</strong> ({p.total_quantity} u.)
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${marginBadge}`}>
                      {p.margin_pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Promociones Más Vendidas (Top 5) */}
      <div className="bg-white rounded-2xl shadow-md p-5 flex flex-col justify-between border border-gray-100">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Promociones más vendidas</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Top 5 combos y promociones pedidas.</p>
            </div>
          </div>

          {topPromos.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">Sin promociones vendidas en este período.</p>
          ) : (
            <div className="space-y-2">
              {topPromos.map((promo) => (
                <div
                  key={promo.promotion_name}
                  className="flex items-center justify-between p-2 rounded-xl bg-gray-50/70 border border-gray-100 text-xs"
                >
                  <div>
                    <p className="font-medium text-gray-900">{promo.promotion_name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Recaudado: <strong className="text-gray-900">{formatCurrency(promo.total_revenue)}</strong>
                    </p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                    {promo.total_quantity} pedidos
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
