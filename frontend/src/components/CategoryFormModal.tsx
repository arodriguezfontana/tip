import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_FULL_CLASS as INPUT_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { AdminCategory, AdminProduct, CategoryPayload } from '@/types/catalog';
import type { PreparationSector } from '@/types/order';
import { getErrorMessage } from '@/utils/errors';

interface CategoryFormModalProps {
  /** null para crear una categoría nueva. */
  category: AdminCategory | null;
  products: AdminProduct[];
  onClose: () => void;
  onSave: (payload: CategoryPayload) => Promise<void>;
}

export function CategoryFormModal({ category, products, onClose, onSave }: CategoryFormModalProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [sector, setSector] = useState<PreparationSector>(category?.sector ?? 'cocina');
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
      await onSave({
        name: name.trim(),
        sector,
        product_ids: products.filter((p) => selected.has(p.id)).map((p) => p.id),
      });
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
    <Modal
      title={category ? `Editar ${category.name}` : 'Nueva categoría'}
      subtitle="Cada producto pertenece a una sola categoría."
      onClose={onClose}
      closeDisabled={saving}
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
        <ModalBody>
          <div>
            <label htmlFor="category-name" className={LABEL_CLASS}>
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

          <div>
            <label htmlFor="category-sector" className={LABEL_CLASS}>
              Sector de preparación *
            </label>
            <select
              id="category-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value as PreparationSector)}
              className={INPUT_CLASS}
            >
              <option value="cocina">🍳 Cocina</option>
              <option value="pizzeria">🍕 Pizzería</option>
              <option value="barra">🍺 Barra</option>
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Área de trabajo del tablero donde se visualizan y preparan los platos de esta categoría.
            </p>
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
        </ModalBody>
        <ModalFooter
          note={
            (moved > 0 || removed > 0) && (
              <p className="text-xs text-gray-600">
                {moved > 0 && `${moved === 1 ? '1 producto se moverá' : `${moved} productos se moverán`} desde otra categoría. `}
                {removed > 0 &&
                  `${removed === 1 ? '1 producto quedará' : `${removed} productos quedarán`} sin categoría y no se mostrará${removed === 1 ? '' : 'n'} en el menú.`}
              </p>
            )
          }
          error={formError}
          onCancel={onClose}
          submitLabel={category ? 'Guardar cambios' : 'Crear categoría'}
          saving={saving}
        />
      </form>
    </Modal>
  );
}
