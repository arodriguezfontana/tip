import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AdminCategory, AdminProduct, CategoryPayload } from '@/types/catalog';
import { getErrorMessage } from '@/utils/customerValidation';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black';

interface CategoryFormModalProps {
  /** null para crear una categoría nueva. */
  category: AdminCategory | null;
  products: AdminProduct[];
  onClose: () => void;
  onSave: (payload: CategoryPayload) => Promise<void>;
}

export function CategoryFormModal({ category, products, onClose, onSave }: CategoryFormModalProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [selected, setSelected] = useState<Set<number>>(() => new Set(category?.products.map((p) => p.id)));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isInThisCategory = (product: AdminProduct) => category !== null && product.category?.id === category.id;

  const toggle = (productId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const text = search.trim().toLowerCase();
  const visibleProducts = products
    .filter((product) => !text || product.name.toLowerCase().includes(text))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const moved = products.filter((p) => selected.has(p.id) && p.category !== null && !isInThisCategory(p)).length;
  const removed = products.filter((p) => !selected.has(p.id) && isInThisCategory(p)).length;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setFormError('Ingresá el nombre de la categoría.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      // Se envían en el orden del catálogo para que el pedido sea siempre el mismo.
      await onSave({ name: name.trim(), product_ids: products.filter((p) => selected.has(p.id)).map((p) => p.id) });
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar la categoría.'));
      setSaving(false);
    }
  };

  const productHint = (product: AdminProduct) => {
    const isSelected = selected.has(product.id);
    if (isInThisCategory(product)) {
      return isSelected ? null : <span className="text-amber-700">Quedará sin categoría</span>;
    }
    if (!product.category) return <span className="text-gray-400">Sin categoría</span>;
    return isSelected ? (
      <span className="text-blue-700">Se moverá desde {product.category.name}</span>
    ) : (
      <span className="text-gray-400">En {product.category.name}</span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-modal-title"
        className="bg-white rounded-2xl shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div>
            <h2 id="category-modal-title" className="text-base font-bold text-gray-900">
              {category ? `Editar ${category.name}` : 'Nueva categoría'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Cada producto pertenece a una sola categoría.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-700 text-lg font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
          <div className="px-6 py-4 space-y-4 overflow-y-auto min-h-0">
            <div>
              <label htmlFor="category-name" className="block text-xs font-medium text-gray-700 mb-1">
                Nombre *
              </label>
              <input
                id="category-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700">Productos (opcional)</span>
                <span className="text-xs text-gray-500">
                  {selected.size === 1 ? '1 seleccionado' : `${selected.size} seleccionados`}
                </span>
              </div>
              <input
                type="search"
                aria-label="Buscar producto para la categoría"
                placeholder="Buscar producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Enter en el buscador no debe guardar la categoría.
                  if (e.key === 'Enter') e.preventDefault();
                }}
                className={INPUT_CLASS}
              />
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {products.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">Todavía no hay productos en el catálogo.</p>
                ) : visibleProducts.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No hay productos que coincidan.</p>
                ) : (
                  visibleProducts.map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() => toggle(product.id)}
                        className="w-4 h-4 accent-black shrink-0"
                      />
                      <span className="flex-1 min-w-0 font-medium text-gray-900 truncate">{product.name}</span>
                      <span className="text-[11px] text-right shrink-0">{productHint(product)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 px-6 py-4 space-y-3 shrink-0">
            {(moved > 0 || removed > 0) && (
              <p className="text-xs text-gray-600">
                {moved > 0 && `${moved === 1 ? '1 producto se moverá' : `${moved} productos se moverán`} desde otra categoría. `}
                {removed > 0 &&
                  `${removed === 1 ? '1 producto quedará' : `${removed} productos quedarán`} sin categoría y no se mostrará${removed === 1 ? '' : 'n'} en el menú.`}
              </p>
            )}
            {formError && (
              <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-black text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60"
              >
                {saving ? 'Guardando...' : category ? 'Guardar cambios' : 'Crear categoría'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
