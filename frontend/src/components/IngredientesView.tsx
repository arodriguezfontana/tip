import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { IngredientFields } from '@/components/ingredientes/IngredientFields';
import { IngredientsTable } from '@/components/ingredientes/IngredientsTable';
import { useAsyncData } from '@/hooks/useAsyncData';
import { createIngredient, deleteIngredient, fetchIngredients, updateIngredient } from '@/services/ingredientService';
import type { Ingredient, IngredientPayload } from '@/types/ingredient';
import { getErrorMessage } from '@/utils/errors';
import { EMPTY_INGREDIENT, toIngredientRequest, validateIngredient } from '@/utils/ingredientForm';
import { SUGGESTED_UNITS } from '@/utils/ingredients';

const NEW_INGREDIENT_CLASSES = { name: 'flex-1', unit: 'sm:w-32', cost: 'sm:w-28', extra: 'sm:w-28' };

export function IngredientesView() {
  // Se vuelve a pedir el listado después de cada cambio (cambia en cuántos productos se usa cada uno).
  const {
    data: ingredients = [],
    loading,
    error: loadError,
    reload,
  } = useAsyncData(fetchIngredients, 'No se pudo cargar la lista de ingredientes.');
  const [actionError, setActionError] = useState<string | null>(null);

  const [newIngredient, setNewIngredient] = useState<IngredientPayload>(EMPTY_INGREDIENT);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<IngredientPayload>(EMPTY_INGREDIENT);
  const [savingEdit, setSavingEdit] = useState(false);

  const handleCreate = async (event: SubmitEvent) => {
    event.preventDefault();
    if (creating) return;
    const error = validateIngredient(newIngredient);
    setActionError(error);
    if (error) return;

    setCreating(true);
    try {
      await createIngredient(toIngredientRequest(newIngredient));
      setNewIngredient({ ...EMPTY_INGREDIENT, unit: newIngredient.unit });
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo agregar el ingrediente.'));
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (ingredient: Ingredient) => {
    setEditingId(ingredient.id);
    setEditDraft({
      name: ingredient.name,
      unit: ingredient.unit,
      cost: ingredient.cost ?? 0,
      extra_price: ingredient.extra_price ?? 0,
    });
    setActionError(null);
  };

  const handleSaveEdit = async (id: number) => {
    if (savingEdit) return;
    const error = validateIngredient(editDraft);
    setActionError(error);
    if (error) return;

    setSavingEdit(true);
    try {
      await updateIngredient(id, toIngredientRequest(editDraft));
      setEditingId(null);
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo guardar el ingrediente.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (ingredient: Ingredient) => {
    if (!window.confirm(`¿Eliminar el ingrediente "${ingredient.name}"?`)) return;
    setActionError(null);
    try {
      await deleteIngredient(ingredient.id);
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo eliminar el ingrediente.'));
    }
  };

  const isEmpty = ingredients.length === 0;

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto lg:h-full">
      <datalist id="ingredient-units">
        {SUGGESTED_UNITS.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <div className="shrink-0 bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Ingredientes</h1>
          <p className="text-xs text-gray-500">
            Lista maestra de insumos del local. Cada ingrediente tiene una unidad de medida: en esa unidad se cargan
            las cantidades de las recetas y se informa su consumo.
          </p>
        </div>

        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2" noValidate>
          <IngredientFields
            value={newIngredient}
            onChange={setNewIngredient}
            subject="del nuevo ingrediente"
            classes={NEW_INGREDIENT_CLASSES}
          />
          <button
            type="submit"
            disabled={creating}
            style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
            className="text-white rounded-xl px-5 py-2 text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
          >
            {creating ? 'Agregando...' : 'Agregar'}
          </button>
        </form>
      </div>

      {(actionError || loadError) && (
        <div role="alert" className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {actionError || loadError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-48">
        {isEmpty && (
          <p className="text-sm text-gray-500 text-center py-16">
            {loading ? 'Cargando ingredientes...' : 'Todavía no cargaste ingredientes.'}
          </p>
        )}
        {!isEmpty && (
          <IngredientsTable
            ingredients={ingredients}
            editingId={editingId}
            draft={editDraft}
            savingEdit={savingEdit}
            onDraftChange={setEditDraft}
            onStartEditing={startEditing}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => setEditingId(null)}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}
