import { useEffect, useRef, useState } from 'react';
import { PanelNote } from '@/components/ui/PanelNote';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import {
  addMenuImage,
  deleteMenuImage,
  fetchMenuConfig,
  fetchMenuImages,
  reorderMenuImages,
  replaceMenuImage,
  updateMenuConfig,
} from '@/services/menuImageService';
import {
  addPromotionImage,
  deletePromotionImage,
  fetchPromotionImages,
  reorderPromotionImages,
  replacePromotionImage,
} from '@/services/promotionImageService';
import {
  fetchPromotionsConfig,
  updatePromotionsConfig,
} from '@/services/promotionService';
import { INPUT_CLASS } from '@/styles/forms';
import type { MenuImages } from '@/types/menuImage';
import type { PromotionImages } from '@/types/promotion';
import { ACCEPTED_IMAGE_TYPES, productImageSrc, validateImageFile } from '@/utils/catalog';
import { getErrorMessage } from '@/utils/errors';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE });
}

type ConfigTab = 'menu' | 'promociones';

export function MenuImagenView() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('menu');

  // Estado Menú
  const [menu, setMenu] = useState<MenuImages | null>(null);
  const [menuLink, setMenuLink] = useState<string>('');
  const [savedMenuLink, setSavedMenuLink] = useState<string>('');
  const [savingMenuLink, setSavingMenuLink] = useState(false);

  // Estado Promociones
  const [promoImages, setPromoImages] = useState<PromotionImages | null>(null);
  const [promoLink, setPromoLink] = useState<string>('');
  const [savedPromoLink, setSavedPromoLink] = useState<string>('');
  const [savingPromoLink, setSavingPromoLink] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Upload y reemplazo
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [confirmingRemovalOf, setConfirmingRemovalOf] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);

  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(fetchMenuImages())
      .then((data) => {
        if (!cancelled && data) setMenu(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('No se pudo cargar el menú en imagen.');
      });

    Promise.resolve(fetchMenuConfig?.())
      .then((cfg) => {
        if (!cancelled && cfg) {
          setMenuLink(cfg.menu_link ?? '');
          setSavedMenuLink(cfg.menu_link ?? '');
        }
      })
      .catch(() => {});

    Promise.resolve(fetchPromotionImages?.())
      .then((data) => {
        if (!cancelled && data) setPromoImages(data);
      })
      .catch(() => {});

    Promise.resolve(fetchPromotionsConfig?.())
      .then((cfg) => {
        if (!cancelled && cfg) {
          setPromoLink(cfg.promotions_link ?? '');
          setSavedPromoLink(cfg.promotions_link ?? '');
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const discardFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormError(null);
    if (addInput.current) addInput.current.value = '';
  };

  const handleFileChange = (file: File | undefined) => {
    if (addInput.current) addInput.current.value = '';
    if (!file) return;
    const error = validateImageFile(file);
    setFormError(error);
    setSelectedFile(error ? null : file);
    setPreviewUrl(error ? null : URL.createObjectURL(file));
  };

  const handleSaveMenuLink = async () => {
    setSavingMenuLink(true);
    setFormError(null);
    try {
      const val = menuLink.trim() || null;
      const res = await updateMenuConfig(val);
      setMenuLink(res.menu_link ?? '');
      setSavedMenuLink(res.menu_link ?? '');
      toast.show(val ? 'Link del menú guardado.' : 'Se eliminó el link del menú.');
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar el link del menú.'));
    } finally {
      setSavingMenuLink(false);
    }
  };

  const handleSavePromoLink = async () => {
    setSavingPromoLink(true);
    setFormError(null);
    try {
      const val = promoLink.trim() || null;
      const res = await updatePromotionsConfig(val);
      setPromoLink(res.promotions_link ?? '');
      setSavedPromoLink(res.promotions_link ?? '');
      toast.show(val ? 'Link de promociones guardado.' : 'Se eliminó el link de promociones.');
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar el link de promociones.'));
    } finally {
      setSavingPromoLink(false);
    }
  };

  const handlePublishFile = async () => {
    if (!selectedFile || savingFile) return;
    setSavingFile(true);
    setFormError(null);
    try {
      if (activeTab === 'menu') {
        const updated = await addMenuImage(selectedFile);
        if (updated) setMenu(updated);
        toast.show('Se sumó la imagen al menú.');
      } else {
        const updated = await addPromotionImage(selectedFile);
        if (updated) setPromoImages(updated);
        toast.show('Se sumó la imagen a promociones.');
      }
      discardFile();
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar la imagen. Intentá nuevamente.'));
    } finally {
      setSavingFile(false);
    }
  };

  const handleReplaceFile = async (file: File | undefined) => {
    const id = replacingId;
    if (replaceInput.current) replaceInput.current.value = '';
    setReplacingId(null);
    if (!file || id == null) return;
    const error = validateImageFile(file);
    if (error) {
      setFormError(error);
      return;
    }
    setSavingFile(true);
    setFormError(null);
    try {
      if (activeTab === 'menu') {
        const updated = await replaceMenuImage(id, file);
        if (updated) setMenu(updated);
        toast.show('La imagen se actualizó: el bot ya envía la nueva.');
      } else {
        const updated = await replacePromotionImage(id, file);
        if (updated) setPromoImages(updated);
        toast.show('La imagen de promoción se actualizó.');
      }
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo guardar la imagen. Intentá nuevamente.'));
    } finally {
      setSavingFile(false);
    }
  };

  const handleRemoveImage = async (id: number) => {
    setSavingFile(true);
    setFormError(null);
    try {
      if (activeTab === 'menu') {
        await deleteMenuImage(id);
        const updated = await fetchMenuImages();
        if (updated) setMenu(updated);
        toast.show('Se quitó la imagen del menú.');
      } else {
        await deletePromotionImage(id);
        const updated = await fetchPromotionImages();
        if (updated) setPromoImages(updated);
        toast.show('Se quitó la imagen de promoción.');
      }
      setConfirmingRemovalOf(null);
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo quitar la imagen. Intentá nuevamente.'));
    } finally {
      setSavingFile(false);
    }
  };

  const handleMoveImage = async (index: number, offset: -1 | 1) => {
    setSavingFile(true);
    setFormError(null);
    try {
      if (activeTab === 'menu') {
        const images = menu?.images ?? [];
        const ids = images.map((i) => i.id);
        [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
        const updated = await reorderMenuImages(ids);
        if (updated) setMenu(updated);
      } else {
        const images = promoImages?.images ?? [];
        const ids = images.map((i) => i.id);
        [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
        const updated = await reorderPromotionImages(ids);
        if (updated) setPromoImages(updated);
      }
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudo cambiar el orden. Intentá nuevamente.'));
    } finally {
      setSavingFile(false);
    }
  };

  const currentImages = activeTab === 'menu' ? (menu?.images ?? []) : (promoImages?.images ?? []);
  const maxImages = activeTab === 'menu' ? (menu?.max_images ?? 10) : (promoImages?.max_images ?? 10);
  const isFull = currentImages.length >= maxImages;
  const currentLink = activeTab === 'menu' ? menuLink : promoLink;
  const savedLink = activeTab === 'menu' ? savedMenuLink : savedPromoLink;
  const hasLinkChanged = currentLink.trim() !== savedLink.trim();

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto relative">
      <Toast message={toast.message} />

      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Menú y promociones</h1>
          <p className="text-xs text-gray-500">
            Son las imágenes y links que el bot les manda a los clientes cuando piden el menú o las promociones.
          </p>
        </div>

        <div role="tablist" aria-label="Secciones" className="inline-flex rounded-xl bg-gray-100 p-1 self-start sm:self-auto">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'menu'}
            onClick={() => {
              setActiveTab('menu');
              discardFile();
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === 'menu' ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Menú
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'promociones'}
            onClick={() => {
              setActiveTab('promociones');
              discardFile();
            }}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === 'promociones' ? 'bg-black text-white shadow-md' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Promociones
          </button>
        </div>
      </div>

      {loadError && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{loadError}</div>}
      {!menu && !loadError && <PanelNote>Cargando menú...</PanelNote>}

      {menu && (
        <>
          {/* Link externo */}
          <section className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-2">
            <h2 className="text-sm font-bold text-gray-900">
              Link externo {activeTab === 'menu' ? 'del menú' : 'de promociones'}
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                placeholder={
                  activeTab === 'menu'
                    ? 'https://mi-restaurante.com/menu'
                    : 'https://instagram.com/promos'
                }
                value={activeTab === 'menu' ? menuLink : promoLink}
                onChange={(e) =>
                  activeTab === 'menu' ? setMenuLink(e.target.value) : setPromoLink(e.target.value)
                }
                className={`flex-1 ${INPUT_CLASS}`}
              />
              <button
                type="button"
                onClick={activeTab === 'menu' ? handleSaveMenuLink : handleSavePromoLink}
                disabled={(activeTab === 'menu' ? savingMenuLink : savingPromoLink) || !hasLinkChanged}
                className="px-4 py-2 bg-black hover:bg-gray-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                Guardar link
              </button>
            </div>
          </section>

          {/* Imágenes */}
          <section
            aria-label={activeTab === 'menu' ? 'Imágenes del menú' : 'Imágenes de promociones'}
            className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3"
          >
            <h2 className="text-sm font-bold text-gray-900">
              {activeTab === 'menu'
                ? `Imágenes del menú (${currentImages.length} de ${maxImages})`
                : `Imágenes de promociones (${currentImages.length} de ${maxImages})`}
            </h2>

            {currentImages.length === 0 ? (
              <p className="text-sm text-gray-400 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center">
                {activeTab === 'menu'
                  ? 'Todavía no cargaste ninguna imagen del menú.'
                  : 'Todavía no cargaste ninguna imagen de promociones.'}
              </p>
            ) : (
              <ol className="grid gap-4 sm:grid-cols-2">
                {currentImages.map((image, index) => (
                  <li key={image.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="rounded-lg bg-gray-50 min-h-40 flex items-center justify-center overflow-hidden">
                      <img
                        src={productImageSrc(image.image_url)}
                        alt={activeTab === 'menu' ? `Imagen ${index + 1} del menú` : `Imagen ${index + 1} de promociones`}
                        className="max-h-64 w-full object-contain"
                      />
                    </div>
                    <p className="text-xs text-gray-500">
                      <span className="font-bold text-gray-700">Imagen {index + 1}</span> · {formatSize(image.size_bytes)} ·
                      actualizada el {formatUpdatedAt(image.updated_at)}
                    </p>

                    {confirmingRemovalOf === image.id ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-gray-700">¿Quitar esta imagen?</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(image.id)}
                          disabled={savingFile}
                          className="font-semibold rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-3 py-1.5 transition"
                        >
                          Sí, quitar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemovalOf(null)}
                          className="font-semibold rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-100 transition"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => handleMoveImage(index, -1)}
                          disabled={savingFile || index === 0}
                          aria-label={`Subir la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
                        >
                          ↑ Subir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveImage(index, 1)}
                          disabled={savingFile || index === currentImages.length - 1}
                          aria-label={`Bajar la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
                        >
                          ↓ Bajar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplacingId(image.id);
                            replaceInput.current?.click();
                          }}
                          disabled={savingFile}
                          aria-label={`Reemplazar la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
                        >
                          Reemplazar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemovalOf(image.id)}
                          disabled={savingFile}
                          aria-label={`Quitar la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30 transition"
                        >
                          Quitar
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <input
              ref={replaceInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              aria-label={
                activeTab === 'menu'
                  ? 'Archivo para reemplazar una imagen del menú'
                  : 'Archivo para reemplazar una imagen de promociones'
              }
              onChange={(e) => handleReplaceFile(e.target.files?.[0])}
              className="hidden"
            />
          </section>

          {/* Agregar imagen */}
          <section
            aria-label="Agregar una imagen"
            className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3"
          >
            <h2 className="text-sm font-bold text-gray-900">Agregar imagen</h2>

            {isFull ? (
              <p className="text-xs text-gray-500">
                El menú ya tiene el máximo de {maxImages} imágenes. Quitá alguna para sumar otra.
              </p>
            ) : selectedFile && previewUrl ? (
              <>
                <div className="rounded-xl border border-gray-200 bg-gray-50 min-h-48 flex items-center justify-center overflow-hidden">
                  <img src={previewUrl} alt="Vista previa de la imagen nueva" className="max-h-96 w-full object-contain" />
                </div>
                <p className="text-xs text-gray-500 break-all">
                  {selectedFile.name} · {formatSize(selectedFile.size)} · se suma al final del menú
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePublishFile}
                    disabled={savingFile}
                    className="font-bold text-sm rounded-xl bg-black hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-2 transition"
                  >
                    {savingFile ? 'Guardando...' : 'Agregar al menú'}
                  </button>
                  <button
                    type="button"
                    onClick={discardFile}
                    disabled={savingFile}
                    className="font-semibold text-sm rounded-xl px-4 py-2 text-gray-600 hover:bg-gray-100 transition"
                  >
                    Descartar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => addInput.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 px-4 py-10 text-sm font-semibold text-gray-600 transition"
              >
                Elegir imagen (JPG o PNG)
              </button>
            )}

            <input
              ref={addInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              aria-label={
                activeTab === 'menu'
                  ? 'Archivo de imagen del menú'
                  : 'Archivo de imagen de promociones'
              }
              onChange={(e) => handleFileChange(e.target.files?.[0])}
              className="hidden"
            />
            {formError && (
              <p role="alert" className="text-xs text-red-600">
                {formError}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
