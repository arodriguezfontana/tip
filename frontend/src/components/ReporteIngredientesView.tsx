import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchIngredientConsumption, fetchIngredients } from '@/services/ingredientService';
import { fetchStrategicInsight } from '@/services/statsService';
import type { Ingredient } from '@/types/ingredient';
import type { StrategicInsightResponse } from '@/types/stats';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import { formatQuantity } from '@/utils/ingredients';
import { formatCurrency } from '@/utils/currency';
import { PanelNote } from '@/components/ui/PanelNote';

export function ReporteIngredientesView() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ingredientId, setIngredientId] = useState<number | null>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const [aiData, setAiData] = useState<StrategicInsightResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  const handleRequestAi = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetchStrategicInsight({
        dateFrom: range.from,
        dateTo: range.to,
      });
      setAiData(res);
    } catch {
      setAiError('El servicio de Inteligencia Artificial tardó demasiado o no pudo responder. Podés reintentar.');
    } finally {
      setAiLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    fetchIngredients()
      .then(setIngredients)
      .catch(() => {
        // Sin la lista solo se pierde el filtro por ingrediente: el reporte se muestra igual.
      });
  }, []);

  // Con un rango personalizado incompleto no se pide nada (se sigue mostrando el último reporte).
  const rangeIncomplete = preset === 'custom' && (!customFrom || !customTo);
  const load = useCallback(
    () => fetchIngredientConsumption({ dateFrom: range.from, dateTo: range.to, ingredientId: ingredientId ?? undefined }),
    [range.from, range.to, ingredientId]
  );
  const { data: report = null, loading, error } = useAsyncData(
    rangeIncomplete ? null : load,
    'No se pudo cargar el reporte de ingredientes.'
  );

  const totalSpending = useMemo(() => {
    if (!report?.items) return 0;
    return report.items.reduce((sum, item) => sum + (item.total_cost ?? (item.total_quantity * (item.unit_cost ?? 0))), 0);
  }, [report?.items]);

  return (
    <div className="flex flex-col gap-4 lg:h-full pb-16">
      <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-1">
        <h1 className="text-lg font-bold text-gray-900">Reporte de ingredientes</h1>
        <p className="text-xs text-gray-500">
          Total de cada insumo usado y gasto total en el período, según las recetas de los productos.
        </p>
      </div>

      <div className="shrink-0 flex flex-col sm:flex-row sm:items-stretch gap-4">
        <div className="flex-1">
          <DateRangeFilter
            preset={preset}
            customFrom={customFrom}
            customTo={customTo}
            onPresetChange={setPreset}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
          />
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-100">
          <label
            htmlFor="ingredient-filter"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2"
          >
            Ingrediente
          </label>
          <SearchableSelect
            id="ingredient-filter"
            emptyLabel="Todos los ingredientes"
            value={ingredientId}
            onChange={setIngredientId}
            options={ingredients.map((ingredient) => ({ value: ingredient.id, label: ingredient.name }))}
            className="w-full sm:w-56"
          />
        </div>
      </div>

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {/* Sección de Consejos de IA para Compras y Control de Gastos */}
      <div className="shrink-0 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Consejos de IA</h2>
            <p className="text-xs text-gray-500 mt-0.5">Análisis operativo para compras, rotación de platos e insumos.</p>
          </div>
          {(aiData || aiLoading) && (
            <button
              type="button"
              onClick={handleRequestAi}
              disabled={aiLoading}
              aria-label={aiLoading ? 'Analizando...' : 'Actualizar consejos'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 cursor-pointer"
            >
              {aiLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <span>Actualizar consejos</span>
              )}
            </button>
          )}
        </div>

        {aiError && (
          <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-2">
            <span>{aiError}</span>
            <button
              type="button"
              onClick={handleRequestAi}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs transition shrink-0 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {aiLoading ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2 bg-gray-50/60 rounded-xl border border-gray-100">
            <div className="w-7 h-7 border-3 border-gray-300 border-t-violet-600 rounded-full animate-spin" />
            <p className="text-xs font-bold text-gray-800">Analizando compras y consumo con IA...</p>
            <p className="text-[11px] text-gray-500">Evaluando rotación en recetas, gasto unitario y uso total.</p>
          </div>
        ) : aiData ? (
          (() => {
            const gastos = (aiData.spending_recommendations ?? []).slice(0, 6);
            return gastos.length === 0 ? (
              <div className="py-6 px-4 bg-gray-50/70 rounded-xl border border-gray-200 text-center">
                <p className="text-xs font-bold text-gray-800">Sin recomendaciones disponibles</p>
                <p className="text-xs text-gray-600 mt-1">No hay suficiente consumo de ingredientes en este período para generar sugerencias de abastecimiento.</p>
              </div>
            ) : (
              <div className="bg-violet-50/70 border border-violet-200/70 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-violet-900">
                    Compras y Control de Gastos
                  </span>
                  <span className="text-[11px] text-violet-700 font-semibold">Insumos y rotación de platos</span>
                </div>
                <p className="text-[11px] text-violet-800/80 mb-2.5">
                  El análisis con IA se genera solo a pedido para el período seleccionado.
                </p>
                <ul className="space-y-2.5 text-xs text-violet-950 font-medium">
                  {gastos.map((g, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-violet-600 font-bold shrink-0">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()
        ) : (
          <div className="py-6 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <p className="text-xs font-semibold text-gray-700">Consejos inteligentes para optimizar compras y materias primas</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Elegí el rango de fechas arriba y presioná el botón para obtenersugerencias prácticas basadas en recetas, costos unitarios, gasto total y demanda de platos.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRequestAi}
              className="px-3.5 py-1.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer"
            >
              Analizar compras con IA
            </button>
          </div>
        )}
      </div>

      {loading && !report ? (
        <PanelNote>Cargando...</PanelNote>
      ) : (
        report && (
          <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
            <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Gasto total en ingredientes</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalSpending)}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Insumos utilizados</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{report.items.length}</p>
              </div>
            </div>

            {report.items.length === 0 ? (
              <PanelNote>No hay consumo de ingredientes en el rango seleccionado.</PanelNote>
            ) : (
              <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col lg:min-h-48">
                <div className="overflow-auto lg:min-h-0">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <th className="px-4 py-3">Ingrediente</th>
                        <th className="px-4 py-3 text-right">Consumo total</th>
                        <th className="px-4 py-3 text-right">Costo unitario</th>
                        <th className="px-4 py-3 text-right">Gasto total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.items.map((item) => (
                        <tr key={item.ingredient_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900 font-medium">{item.ingredient_name}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatQuantity(item.total_quantity, item.unit)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {item.unit_cost && item.unit_cost > 0 ? (
                              formatCurrency(item.unit_cost)
                            ) : (
                              <span className="text-gray-400 text-xs italic">Sin costo</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">
                            {formatCurrency(item.total_cost ?? (item.total_quantity * (item.unit_cost ?? 0)))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
