import { useCallback, useEffect, useMemo, useState } from 'react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchIngredientConsumption, fetchIngredients } from '@/services/ingredientService';
import type { Ingredient } from '@/types/ingredient';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import { formatQuantity } from '@/utils/ingredients';
import { PanelNote } from '@/components/ui/PanelNote';

export function ReporteIngredientesView() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ingredientId, setIngredientId] = useState<number | null>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

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

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-1">
        <h1 className="text-lg font-bold text-gray-900">Reporte de ingredientes</h1>
        <p className="text-xs text-gray-500">
          Total de cada insumo usado en los pedidos finalizados del período, según las recetas de los productos.
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

      {loading && !report ? (
        <PanelNote>Cargando...</PanelNote>
      ) : (
        report && (
          <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
            <div className="shrink-0 bg-white rounded-2xl shadow-md p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos finalizados</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{report.completed_orders}</p>
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.items.map((item) => (
                        <tr key={item.ingredient_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-900">{item.ingredient_name}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatQuantity(item.total_quantity, item.unit)}
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
