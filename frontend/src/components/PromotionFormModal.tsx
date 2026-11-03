import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_FULL_CLASS as INPUT_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { AdminProduct, ImageChange } from '@/types/catalog';
import type { Promotion, PromotionPayload } from '@/types/promotion';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_MB, productImageSrc, validateImageFile } from '@/utils/catalog';
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

  const [image, setImage] = useState<ImageChange>({ type: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const currentImage =
    image.type === 'upload'
      ? previewUrl
      : image.type === 'keep' && promotion?.image_url
      ? productImageSrc(promotion.image_url)
      : null;

  const handleFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const error = validateImageFile(file);
    setImageError(error);
    if (error) return;
    setImage({ type: 'upload', file });
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageError(null);
    setPreviewUrl(null);
    setImage(promotion?.image_url ? { type: 'remove' } : { type: 'keep' });
  };

  const [productToAdd, setProductToAdd] = useState<number | ''>('');
  const [qtyToAdd, setQtyToAdd] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddItem = () => {
    if (productToAdd === '') return;
    const prodId = Number(productToAdd);
    const existingIndex = selectedItems.findIndex((it) => it.product_id === prodId);
    if (existingIndex >= 0) {
      setSelectedItems((prev) =>
        prev.map((it, idx) => (idx === existingIndex ? { ...it, quantity: it.quantity + qtyToAdd } : it))
      );
    } else {
      setSelectedItems((prev) => [...prev, { product_id: prodId, quantity: qtyToAdd }]);
    }
    setProductToAdd('');
    setQtyToAdd(1);
  };

  const handleRemoveItem = (productId: number) => {
    setSelectedItems((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const handleUpdateQuantity = (productId: number, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((it) => {
          if (it.product_id === productId) {
            const newQty = it.quantity + delta;
            return newQty > 0 ? { ...it, quantity: newQty } : null;
          }
          return it;
        })
        .filter(Boolean) as { product_id: number; quantity: number }[]
    );
  };

  const handleSubmit = async (event: FormEvent) => {
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
        image
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

          {/* Imagen opcional */}
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <span className={LABEL_CLASS}>Imagen (opcional)</span>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                {currentImage ? (
                  <img src={currentImage} alt="Vista previa de la promoción" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-gray-400 text-center px-1">Sin imagen</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="text-xs font-semibold rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition"
                  >
                    {currentImage ? 'Cambiar imagen' : 'Elegir imagen'}
                  </button>
                  {currentImage && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-xs font-semibold rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50 transition"
                    >
                      Quitar imagen
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">JPG o PNG, hasta {MAX_IMAGE_MB} MB.</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  aria-label="Archivo de imagen de la promoción"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
              </div>
            </div>
            {imageError && <p className="text-xs text-red-600 mt-2">{imageError}</p>}
          </div>

          {/* Sección de productos incluidos */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-900">Productos incluidos</h3>
            <p className="text-xs text-gray-500">
              Elegí los productos y las cantidades que componen esta promo. Se unifican en la comanda de cocina.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Producto a agregar"
                value={productToAdd}
                onChange={(e) => setProductToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                className={`flex-1 ${INPUT_CLASS} bg-white`}
              >
                <option value="">Seleccionar un producto del catálogo...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatCurrency(p.price)})
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="20"
                  aria-label="Cantidad"
                  value={qtyToAdd}
                  onChange={(e) => setQtyToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`w-20 ${INPUT_CLASS} text-center`}
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  disabled={productToAdd === ''}
                  className="px-4 py-2 bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition"
                >
                  Agregar
                </button>
              </div>
            </div>

            {/* Lista de productos seleccionados */}
            <div className="space-y-2 mt-2">
              {selectedItems.length === 0 ? (
                <p className="text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl p-4 text-center">
                  Todavía no sumaste ningún producto a esta promoción.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
                  {selectedItems.map((item) => {
                    const prod = productMap.get(item.product_id);
                    return (
                      <li key={item.product_id} className="p-3 flex items-center justify-between text-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">
                            {prod ? prod.name : `Producto #${item.product_id}`}
                          </span>
                          {prod && (
                            <span className="text-xs text-gray-500">
                              {formatCurrency(prod.price)} c/u
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.product_id, -1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-xs font-bold"
                            >
                              -
                            </button>
                            <span className="px-2 py-1 text-xs font-bold min-w-6 text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.product_id, 1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-100 text-xs font-bold"
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.product_id)}
                            className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition"
                            title="Quitar de la promo"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
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
