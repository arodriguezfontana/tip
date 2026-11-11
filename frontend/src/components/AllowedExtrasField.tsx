import { LABEL_CLASS } from '@/styles/forms';
import type { Ingredient } from '@/types/ingredient';
import { formatCurrency } from '@/utils/currency';

interface AllowedExtrasFieldProps {
  ingredients: Ingredient[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

/** Ingredientes que se pueden sumar como extra con costo al pedir un producto. */
export function AllowedExtrasField({ ingredients, selectedIds, onChange }: AllowedExtrasFieldProps) {
  const toggle = (id: number, checked: boolean) =>
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((selectedId) => selectedId !== id));

  return (
    <div>
      <label className={LABEL_CLASS}>Adicionales permitidos (opcional)</label>
      <p className="text-[11px] text-gray-500 mb-2">
        Elegí qué ingredientes se pueden sumar como extra con costo al pedir este producto.
      </p>
      {ingredients.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No hay ingredientes cargados en el sistema.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto border border-gray-200 rounded-xl p-2.5 bg-gray-50/50">
          {ingredients.map((ingredient) => (
            <label key={ingredient.id} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.includes(ingredient.id)}
                onChange={(e) => toggle(ingredient.id, e.target.checked)}
                className="w-4 h-4 accent-black rounded"
              />
              <span className="truncate">
                {ingredient.name}
                <span className="text-gray-500 font-medium">
                  {ingredient.extra_price ? ` (+${formatCurrency(ingredient.extra_price)})` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
