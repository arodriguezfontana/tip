import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { AllowedExtrasField } from '@/components/AllowedExtrasField';
import { ImageChoiceField } from '@/components/ui/ImageChoiceField';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useImageChoice } from '@/hooks/useImageChoice';
import { INPUT_FULL_CLASS as INPUT_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { AdminCategory, AdminProduct, ImageChange, ProductPayload } from '@/types/catalog';
import type { Ingredient } from '@/types/ingredient';
import { getErrorMessage } from '@/utils/errors';
import { parseRestrictions } from '@/utils/catalog';

interface ProductFormModalProps {
  /** null para crear un producto nuevo. */
  product: AdminProduct | null;
  categories: AdminCategory[];
  availableIngredients?: Ingredient[];
  onClose: () => void;
  onSave: (payload: ProductPayload, image: ImageChange) => Promise<void>;
}

export function ProductFormModal({ product, categories, availableIngredients = [], onClose, onSave }: ProductFormModalProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [categoryId, setCategoryId] = useState<number | null>(product?.category?.id ?? null);
  const [restrictions, setRestrictions] = useState(product?.dietary_restrictions.join(', ') ?? '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [allowedExtraIds, setAllowedExtraIds] = useState<number[]>(
    product?.allowed_extras?.map((e) => e.id) ?? []
  );
  const imageChoice = useImageChoice(product?.image_url);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving) return;

    const parsedPrice = Number(price);
    let error: string | null = null;
    if (!name.trim()) error = 'Ingresá el nombre del producto.';
    else if (!description.trim()) error = 'Ingresá la descripción del producto.';
    else if (price.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice <= 0) error = 'Ingresá un precio mayor a cero.';
    else if (categoryId === null) error = 'Elegí la categoría del producto.';
    setFormError(error);
    if (error || categoryId === null) return;

    setSaving(true);
    try {
      const payload: ProductPayload = {
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        category_id: categoryId,
        is_active: isActive,
        dietary_restrictions: parseRestrictions(restrictions),
      };
      if (allowedExtraIds.length > 0) {
        payload.allowed_extra_ids = allowedExtraIds;
      }
      await onSave(payload, imageChoice.image);
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar el producto.'));
      setSaving(false);
    }
  };

  const title = product ? `Editar ${product.name}` : 'Crear producto';

  return (
    <Modal
      title={title}
      subtitle="Los cambios se ven al instante en el menú web y en el chatbot."
      onClose={onClose}
      closeDisabled={saving}
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0" noValidate>
        <ModalBody>
          <div>
            <label htmlFor="product-name" className={LABEL_CLASS}>
              Nombre *
            </label>
            <input
              id="product-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={150}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label htmlFor="product-description" className={LABEL_CLASS}>
              Descripción *
            </label>
            <textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              className={`${INPUT_CLASS} resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="product-price" className={LABEL_CLASS}>
                Precio *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                <input
                  id="product-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`${INPUT_CLASS} pl-7`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="product-category" className={LABEL_CLASS}>
                Categoría *
              </label>
              <select
                id="product-category"
                value={categoryId ?? ''}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                className={`${INPUT_CLASS} bg-white`}
              >
                <option value="">Elegí una categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1">Primero creá una categoría en la pestaña Categorías.</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="product-restrictions" className={LABEL_CLASS}>
              Restricciones alimentarias
            </label>
            <input
              id="product-restrictions"
              type="text"
              placeholder="Separadas por coma (ej. vegetariano, sin TACC)"
              value={restrictions}
              onChange={(e) => setRestrictions(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <AllowedExtrasField ingredients={availableIngredients} selectedIds={allowedExtraIds} onChange={setAllowedExtraIds} />

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-black"
            />
            Disponible para pedir
          </label>

          <ImageChoiceField choice={imageChoice} previewAlt="Vista previa de la imagen" inputLabel="Archivo de imagen" />
        </ModalBody>
        <ModalFooter
          error={formError}
          onCancel={onClose}
          submitLabel={product ? 'Guardar cambios' : 'Crear producto'}
          saving={saving}
        />
      </form>
    </Modal>
  );
}
