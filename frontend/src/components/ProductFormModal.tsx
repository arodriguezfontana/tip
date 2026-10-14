import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { INPUT_FULL_CLASS as INPUT_CLASS, LABEL_CLASS } from '@/styles/forms';
import type { AdminCategory, AdminProduct, ImageChange, ProductPayload } from '@/types/catalog';
import { getErrorMessage } from '@/utils/errors';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_MB, parseRestrictions, productImageSrc, validateImageFile } from '@/utils/catalog';

interface ProductFormModalProps {
  /** null para crear un producto nuevo. */
  product: AdminProduct | null;
  categories: AdminCategory[];
  onClose: () => void;
  onSave: (payload: ProductPayload, image: ImageChange) => Promise<void>;
}

export function ProductFormModal({ product, categories, onClose, onSave }: ProductFormModalProps) {
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [categoryId, setCategoryId] = useState<number | null>(product?.category?.id ?? null);
  const [restrictions, setRestrictions] = useState(product?.dietary_restrictions.join(', ') ?? '');
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [image, setImage] = useState<ImageChange>({ type: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Vista previa del archivo elegido: se libera al elegir otro o al cerrar el modal.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const currentImage =
    image.type === 'upload' ? previewUrl : image.type === 'keep' && product?.image_url ? productImageSrc(product.image_url) : null;

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
    // Sin imagen guardada no hay nada que borrar: solo se descarta el archivo elegido.
    setImage(product?.image_url ? { type: 'remove' } : { type: 'keep' });
  };

  const handleSubmit = async (event: FormEvent) => {
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
      await onSave(
        {
          name: name.trim(),
          description: description.trim(),
          price: parsedPrice,
          category_id: categoryId,
          is_active: isActive,
          dietary_restrictions: parseRestrictions(restrictions),
        },
        image
      );
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

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-black"
            />
            Disponible para pedir
          </label>

          <div>
            <span className={LABEL_CLASS}>Imagen (opcional)</span>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
                {currentImage ? (
                  <img src={currentImage} alt="Vista previa de la imagen" className="w-full h-full object-cover" />
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
                  aria-label="Archivo de imagen"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  className="hidden"
                />
              </div>
            </div>
            {imageError && <p className="text-xs text-red-600 mt-2">{imageError}</p>}
          </div>
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
