import { useEffect, useMemo, useState } from 'react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { fetchIngredientConsumption, fetchIngredients } from '@/services/ingredientService';
import type { Ingredient, IngredientConsumptionReport } from '@/types/ingredient';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';
import { formatQuantity } from '@/utils/ingredients';

export function ReporteIngredientesView() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [ingredientId, setIngredientId] = useState<number | null>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [report, setReport] = useState<IngredientConsumptionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (preset === 'custom' && (!customFrom || !customTo)) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchIngredientConsumption({
          dateFrom: range.from,
          dateTo: range.to,
          ingredientId: ingredientId ?? undefined,
        });
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError('No se pudo cargar el reporte de ingredientes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, preset, customFrom, customTo, ingredientId]);

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <div className="shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Reporte de ingredientes</h1>
        <p className="text-xs text-gray-500">
          Total de cada insumo usado en los pedidos finalizados del período, según las recetas de los productos.
        </p>
      </div>

      <div className="shrink-0 flex flex-col sm:flex-row sm:items-end gap-4">
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
        <div>
          <label
            htmlFor="ingredient-filter"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2"
          >
            Ingrediente
          </label>
          <select
            id="ingredient-filter"
            value={ingredientId ?? ''}
            onChange={(e) => setIngredientId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-56 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Todos los ingredientes</option>
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && !report ? (
        <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
      ) : (
        report && (
          <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
            <div className="shrink-0 bg-white rounded-2xl shadow-md p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pedidos finalizados</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{report.completed_orders}</p>
            </div>

            {report.products_without_recipe.length > 0 && (
              <div className="shrink-0 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm">
                Estos productos se vendieron pero no tienen receta, así que su consumo no está incluido:{' '}
                {report.products_without_recipe.join(', ')}.
              </div>
            )}

            {report.items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No hay consumo de ingredientes en el rango seleccionado.
              </p>
            ) : (
              <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col lg:min-h-0">
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
