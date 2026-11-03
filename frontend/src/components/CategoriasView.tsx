import { useState } from 'react';
import { CategoryFormModal } from '@/components/CategoryFormModal';
import { Toast } from '@/components/ui/Toast';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useToast } from '@/hooks/useToast';
import { createCategory, deleteCategory, fetchAdminProducts, fetchCategories, updateCategory } from '@/services/catalogService';
import type { AdminCategory, AdminProduct, CategoryPayload } from '@/types/catalog';
import { SECTOR_CONFIG } from '@/types/order';
import type { PreparationSector } from '@/types/order';
import { SectorIcon } from '@/components/Icons';
import { getErrorMessage } from '@/utils/errors';

/** El formulario abierto: categoría a editar, o null para crear una nueva. */
type CategoryForm = { category: AdminCategory | null } | null;

async function loadCategories(): Promise<{ categories: AdminCategory[]; products: AdminProduct[] }> {
  const [categories, products] = await Promise.all([fetchCategories(), fetchAdminProducts()]);
  return { categories, products };
}

export function CategoriasView() {
  // Después de cada cambio se vuelve a pedir todo: mover productos afecta a varias categorías.
  const { data, loading, error: loadError, reload } = useAsyncData(loadCategories, 'No se pudieron cargar las categorías.');
  const { categories = [], products = [] } = data ?? {};
  const [actionError, setActionError] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(null);
  const { message: toastMessage, show: showToast } = useToast();

  const handleSave = async (payload: CategoryPayload) => {
    const editing = categoryForm?.category ?? null;
    const saved = editing ? await updateCategory(editing.id, payload) : await createCategory(payload);
    setCategoryForm(null);
    setActionError(null);
    reload();
    showToast(editing ? `Se guardaron los cambios de ${saved.name}.` : `Se creó la categoría ${saved.name}.`);
  };

  const handleDelete = async (category: AdminCategory) => {
    const count = category.products.length;
    const warning =
      count === 0
        ? ''
        : count === 1
          ? ' Su producto quedará sin categoría y no se mostrará en el menú.'
          : ` Sus ${count} productos quedarán sin categoría y no se mostrarán en el menú.`;
    if (!window.confirm(`¿Eliminar la categoría "${category.name}"?${warning}`)) return;
    setActionError(null);
    try {
      await deleteCategory(category.id);
      reload();
      showToast(`Se eliminó la categoría ${category.name}.`);
    } catch (err) {
      setActionError(getErrorMessage(err, 'No se pudo eliminar la categoría.'));
    }
  };

  const withoutCategory = products.filter((product) => product.category === null);

  return (
    <div className="flex flex-col gap-4 lg:flex-1 lg:min-h-0">
      <Toast message={toastMessage} />

      <div className="shrink-0 bg-white p-4 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 text-xs text-gray-500">
          Las categorías ordenan el menú web y el del chatbot. Al crear o editar una podés elegir qué productos la
          forman; si un producto estaba en otra categoría, se mueve.
        </p>
        <button
          type="button"
          onClick={() => setCategoryForm({ category: null })}
          disabled={loading}
          className="bg-black text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60 whitespace-nowrap"
        >
          + Nueva categoría
        </button>
      </div>

      {withoutCategory.length > 0 && (
        <div className="shrink-0 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 px-4 py-3 text-sm">
          Sin categoría (no se muestran en el menú):{' '}
          <strong>{withoutCategory.map((product) => product.name).join(', ')}</strong>. Agregalos a una categoría para
          volver a ofrecerlos.
        </div>
      )}

      {(actionError || loadError) && (
        <div role="alert" className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {actionError || loadError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden flex flex-col lg:min-h-48">
        {loading && categories.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Cargando categorías...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">Todavía no creaste categorías.</p>
        ) : (
          <div className="overflow-auto lg:min-h-0">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5">Categoría</th>
                  <th className="py-3 px-5">Productos</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50/50 align-top">
                    <td className="py-3 px-5 whitespace-nowrap">
                      <p className="font-semibold text-gray-900">{category.name}</p>
                      {category.sector && SECTOR_CONFIG[category.sector as PreparationSector] && (
                        <div className="mt-0.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              SECTOR_CONFIG[category.sector as PreparationSector].badgeClass
                            }`}
                          >
                            <SectorIcon sector={category.sector} className="w-3.5 h-3.5 shrink-0" />
                            <span>{SECTOR_CONFIG[category.sector as PreparationSector].label}</span>
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        {category.products.length === 1 ? '1 producto' : `${category.products.length} productos`}
                      </p>
                    </td>
                    <td className="py-3 px-5">
                      {category.products.length === 0 ? (
                        <span className="text-gray-400 italic">Sin productos</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {category.products.map((product) => (
                            <span
                              key={product.id}
                              title={product.is_active ? undefined : 'No disponible'}
                              className={`rounded-full px-2 py-0.5 text-xs ${
                                product.is_active ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400 line-through'
                              }`}
                            >
                              {product.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setCategoryForm({ category })}
                        aria-label={`Editar ${category.name}`}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-200"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(category)}
                        aria-label={`Eliminar ${category.name}`}
                        className="text-xs font-semibold rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {categoryForm && (
        <CategoryFormModal
          category={categoryForm.category}
          products={products}
          onClose={() => setCategoryForm(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
