import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_CLASS } from '@/styles/forms';
import type { AdminProduct } from '@/types/catalog';
import type { Ingredient, RecipeItemPayload } from '@/types/ingredient';
import { getErrorMessage } from '@/utils/errors';
import { parseQuantity } from '@/utils/ingredients';

interface DraftRow {
  /** Identificador estable de la fila para React (las filas se agregan y se quitan). */
  key: number;
  ingredientId: number | null;
  quantity: string;
}

interface RecipeEditModalProps {
  product: AdminProduct;
  ingredients: Ingredient[];
  onClose: () => void;
  onSave: (items: RecipeItemPayload[]) => Promise<void>;
}

export function RecipeEditModal({ product, ingredients, onClose, onSave }: RecipeEditModalProps) {
  const [rows, setRows] = useState<DraftRow[]>(() =>
    product.recipe.map((item, index) => ({
      key: index,
      ingredientId: item.ingredient_id,
      quantity: String(item.quantity).replace('.', ','),
    }))
  );
  const [nextKey, setNextKey] = useState(product.recipe.length);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const updateRow = (key: number, changes: Partial<DraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
    setFormError(null);
  };

  const addRow = () => {
    setRows((current) => [...current, { key: nextKey, ingredientId: null, quantity: '' }]);
    setNextKey((key) => key + 1);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    if (rows.some((row) => row.ingredientId === null)) {
      setFormError('Elegí el ingrediente de cada fila (o quitá las filas vacías).');
      return;
    }
    const items = rows.map((row) => ({ ingredient_id: row.ingredientId as number, quantity: parseQuantity(row.quantity) }));
    if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      setFormError('Ingresá una cantidad mayor a cero para cada ingrediente.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave(items);
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar la receta.'));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Receta de ${product.name}`}
      subtitle="Cantidades necesarias para preparar una unidad del producto."
      onClose={onClose}
      closeDisabled={saving}
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
        <ModalBody>
          {ingredients.length === 0 ? (
            <p className="text-sm text-gray-500">
              Todavía no hay ingredientes cargados. Agregalos primero en la sección Ingredientes.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500">Este producto no tiene receta. Agregá sus ingredientes.</p>
          ) : (
            rows.map((row, index) => {
              const usedByOtherRows = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.ingredientId));
              const unit = row.ingredientId !== null ? ingredientsById.get(row.ingredientId)?.unit : null;
              return (
                <div key={row.key} className="flex items-center gap-2">
                  <select
                    aria-label={`Ingrediente ${index + 1}`}
                    value={row.ingredientId ?? ''}
                    onChange={(e) => updateRow(row.key, { ingredientId: e.target.value ? Number(e.target.value) : null })}
                    className={`${INPUT_CLASS} flex-1 min-w-0 bg-white`}
                  >
                    <option value="">Elegí un ingrediente</option>
                    {ingredients
                      .filter((ingredient) => !usedByOtherRows.has(ingredient.id))
                      .map((ingredient) => (
                        <option key={ingredient.id} value={ingredient.id}>
                          {ingredient.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Cantidad del ingrediente ${index + 1}`}
                    placeholder="Cantidad"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    className={`${INPUT_CLASS} w-24 text-right`}
                  />
                  <span className="w-20 text-xs text-gray-500 truncate">{unit ?? ''}</span>
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    aria-label={`Quitar el ingrediente ${index + 1}`}
                    className="w-8 h-8 shrink-0 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}

          {ingredients.length > 0 && rows.length < ingredients.length && (
            <button
              type="button"
              onClick={addRow}
              className="text-xs font-semibold rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition"
            >
              + Agregar ingrediente
            </button>
          )}
        </ModalBody>
        <ModalFooter error={formError} onCancel={onClose} submitLabel="Guardar receta" saving={saving} />
      </form>
    </Modal>
  );
}
