import { formatCurrency } from '@/utils/currency';
import type { useStats } from '@/hooks/useStats';

interface TopProductsTableProps {
  kpis: ReturnType<typeof useStats>['kpis'];
  topProducts: ReturnType<typeof useStats>['topProducts'];
}

/** Productos más vendidos con su rentabilidad y margen. */
export function TopProductsTable({ kpis, topProducts }: TopProductsTableProps) {
  return (
    <>
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
    </>
  );
}
