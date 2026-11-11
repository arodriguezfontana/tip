import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { PromotionItemsEditor } from '@/components/PromotionItemsEditor';
import { ImageChoiceField } from '@/components/ui/ImageChoiceField';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useImageChoice } from '@/hooks/useImageChoice';
import { INPUT_FULL_CLASS as INPUT_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { AdminProduct, ImageChange } from '@/types/catalog';
import type { Promotion, PromotionPayload } from '@/types/promotion';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';

interface PromotionFormModalProps {
  promotion: Promotion | null;
  products: AdminProduct[];
  onClose: () => void;
  onSave: (payload: PromotionPayload, image: ImageChange) => Promise<void>;
}

export function PromotionFormModal({ promotion, products, onClose, onSave }: PromotionFormModalProps) {
  const [name, setName] = useState(promotion?.name ?? '');
  const [description, setDescription] = useState(promotion?.description ?? '');
  const [price, setPrice] = useState(promotion ? String(promotion.price) : '');
  const [isActive, setIsActive] = useState(promotion?.is_active ?? true);
  const [selectedItems, setSelectedItems] = useState<{ product_id: number; quantity: number }[]>(
    promotion?.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })) ?? []
  );

  const imageChoice = useImageChoice(promotion?.image_url);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving) return;

    const parsedPrice = Number(price);
    if (!name.trim()) {
      setFormError('El nombre de la promoción es obligatorio.');
      return;
    }
    if (!price || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('El precio debe ser un número mayor a cero.');
      return;
    }
    if (selectedItems.length === 0) {
      setFormError('Tenés que incluir al menos un producto en la promoción.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim() || null,
          price: parsedPrice,
          is_active: isActive,
          items: selectedItems,
        },
        imageChoice.image
      );
      onClose();
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar la promoción.'));
    } finally {
      setSaving(false);
    }
  };

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Suma regular de los productos
  const regularTotal = selectedItems.reduce((acc, item) => {
    const prod = productMap.get(item.product_id);
    return acc + (prod ? prod.price * item.quantity : 0);
  }, 0);

  return (
    <Modal
      title={promotion ? 'Editar promoción' : 'Nueva promoción'}
      subtitle="Definí el nombre, precio, imagen y los productos incluidos en la promo."
      onClose={onClose}
      closeDisabled={saving}
      width="xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
        <ModalBody>
          <div>
            <label htmlFor="promo-name" className={LABEL_CLASS}>
              Nombre de la promoción <span className="text-red-500">*</span>
            </label>
            <input
              id="promo-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Promo 2 Muzzas + Coca"
              className={INPUT_CLASS}
              required
            />
          </div>

          <div>
            <label htmlFor="promo-desc" className={LABEL_CLASS}>
              Descripción (opcional)
            </label>
            <textarea
              id="promo-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aclaraciones, detalles o condiciones de la promo"
              className={INPUT_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="promo-price" className={LABEL_CLASS}>
                Precio de la promoción ($) <span className="text-red-500">*</span>
              </label>
              <input
                id="promo-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                className={INPUT_CLASS}
                required
              />
              {regularTotal > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Suma regular de productos: <span className="font-semibold">{formatCurrency(regularTotal)}</span>
                </p>
              )}
            </div>

            <div className="flex items-center pt-6">
              <label className="relative inline-flex items-center cursor-pointer gap-2 select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
                <span className="text-sm font-semibold text-gray-700">
                  {isActive ? 'Promoción activa' : 'Pausada'}
                </span>
              </label>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <ImageChoiceField choice={imageChoice} previewAlt="Vista previa de la promoción" inputLabel="Archivo de imagen de la promoción" />
          </div>

          <PromotionItemsEditor products={products} items={selectedItems} onChange={setSelectedItems} />
        </ModalBody>

        <ModalFooter
          error={formError}
          onCancel={onClose}
          submitLabel={promotion ? 'Guardar cambios' : 'Crear promoción'}
          saving={saving}
        />
      </form>
    </Modal>
  );
}
