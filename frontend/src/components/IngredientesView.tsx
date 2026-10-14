import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { createIngredient, deleteIngredient, fetchIngredients, updateIngredient } from '@/services/ingredientService';
import { INPUT_CLASS } from '@/styles/forms';
import type { Ingredient, IngredientPayload } from '@/types/ingredient';
import { getErrorMessage } from '@/utils/errors';
import { SUGGESTED_UNITS } from '@/utils/ingredients';

function validate(payload: IngredientPayload): string | null {
  if (!payload.name.trim()) return 'Ingresá el nombre del ingrediente.';
  if (!payload.unit.trim()) return 'Ingresá la unidad de medida (ej. gramos o unidades).';
  return null;
}

function trimmed(payload: IngredientPayload): IngredientPayload {
  return { name: payload.name.trim(), unit: payload.unit.trim() };
}

export function IngredientesView() {
  // Se vuelve a pedir el listado después de cada cambio (cambia en cuántos productos se usa cada uno).
  const {
    data: ingredients = [],
    loading,
    error: loadError,
    reload,
  } = useAsyncData(fetchIngredients, 'No se pudo cargar la lista de ingredientes.');
  const [actionError, setActionError] = useState<string | null>(null);

  const [newIngredient, setNewIngredient] = useState<IngredientPayload>({ name: '', unit: '' });
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<IngredientPayload>({ name: '', unit: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    const error = validate(newIngredient);
    setActionError(error);
    if (error) return;

    setCreating(true);
    try {
      await createIngredient(trimmed(newIngredient));
      setNewIngredient({ name: '', unit: newIngredient.unit });
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo agregar el ingrediente.'));
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (ingredient: Ingredient) => {
    setEditingId(ingredient.id);
    setEditDraft({ name: ingredient.name, unit: ingredient.unit });
    setActionError(null);
  };

  const handleSaveEdit = async (id: number) => {
    if (savingEdit) return;
    const error = validate(editDraft);
    setActionError(error);
    if (error) return;

    setSavingEdit(true);
    try {
      await updateIngredient(id, trimmed(editDraft));
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
          <input
            type="text"
            aria-label="Nombre del nuevo ingrediente"
            placeholder="Nombre (ej. Harina 000)"
            value={newIngredient.name}
            onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
            maxLength={100}
            className={`${INPUT_CLASS} flex-1`}
          />
          <input
            type="text"
            aria-label="Unidad del nuevo ingrediente"
            placeholder="Unidad (ej. gramos)"
            list="ingredient-units"
            value={newIngredient.unit}
            onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
            maxLength={30}
            className={`${INPUT_CLASS} sm:w-44`}
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-black text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60"
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

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-0">
        {loading && ingredients.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando ingredientes...</p>
        ) : ingredients.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Todavía no cargaste ingredientes.</p>
        ) : (
          <div className="overflow-auto lg:min-h-0">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5">Ingrediente</th>
                  <th className="py-3 px-5">Unidad</th>
                  <th className="py-3 px-5">Usado en</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ingredients.map((ingredient) =>
                  editingId === ingredient.id ? (
                    <tr key={ingredient.id} className="bg-gray-50/50">
                      <td className="py-2 px-5">
                        <input
                          type="text"
                          aria-label="Nombre del ingrediente"
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          maxLength={100}
                          className={`${INPUT_CLASS} w-full`}
                        />
                      </td>
                      <td className="py-2 px-5">
                        <input
                          type="text"
                          aria-label="Unidad del ingrediente"
                          list="ingredient-units"
                          value={editDraft.unit}
                          onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
                          maxLength={30}
                          className={`${INPUT_CLASS} w-full`}
                        />
                      </td>
                      <td className="py-2 px-5 text-gray-500">{ingredient.products_count} productos</td>
                      <td className="py-2 px-5 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(ingredient.id)}
                          disabled={savingEdit}
                          className="text-xs font-semibold rounded-lg bg-black text-white px-3 py-1.5 hover:bg-gray-800 disabled:opacity-60"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-200"
                        >
                          Cancelar
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={ingredient.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-5 font-semibold text-gray-900">{ingredient.name}</td>
                      <td className="py-3 px-5 text-gray-600">{ingredient.unit}</td>
                      <td className="py-3 px-5 text-gray-500">
                        {ingredient.products_count === 1 ? '1 producto' : `${ingredient.products_count} productos`}
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => startEditing(ingredient)}
                          aria-label={`Editar ${ingredient.name}`}
                          className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-200"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ingredient)}
                          aria-label={`Eliminar ${ingredient.name}`}
                          className="text-xs font-semibold rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
