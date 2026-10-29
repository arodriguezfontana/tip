import { useEffect, useRef, useState } from 'react';
import { Toast } from '@/components/ui/Toast';
import { useToast } from '@/hooks/useToast';
import {
  addMenuImage,
  deleteMenuImage,
  fetchMenuImages,
  reorderMenuImages,
  replaceMenuImage,
} from '@/services/menuImageService';
import type { MenuImages } from '@/types/menuImage';
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_MB, productImageSrc, validateImageFile } from '@/utils/catalog';
import { getErrorMessage } from '@/utils/errors';
import { PanelNote } from '@/components/ui/PanelNote';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE });
}

/** Sección del panel donde el dueño carga las imágenes del menú que el bot manda a los clientes. */
export function MenuImagenView() {
  const [menu, setMenu] = useState<MenuImages | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingRemovalOf, setConfirmingRemovalOf] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchMenuImages()
      .then((data) => {
        if (!cancelled) setMenu(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError('No se pudo cargar el menú en imagen.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // La vista previa del archivo elegido se libera al cambiarlo o al salir de la sección.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const images = menu?.images ?? [];
  const isFull = menu != null && images.length >= menu.max_images;

  /** Ejecuta un cambio sobre el menú: avisa si falla y, si sale bien, muestra el menú que devolvió el servidor. */
  const run = async (action: () => Promise<MenuImages | void>, success: string | null, failure: string) => {
    setSaving(true);
    setFormError(null);
    try {
      const updated = await action();
      if (updated) setMenu(updated);
      if (success) toast.show(success);
      return true;
    } catch (err) {
      setFormError(getErrorMessage(err, failure));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    setSelected(null);
    setPreviewUrl(null);
    setFormError(null);
    if (addInput.current) addInput.current.value = '';
  };

  const handleFile = (file: File | undefined) => {
    if (addInput.current) addInput.current.value = '';
    if (!file) return;
    const error = validateImageFile(file);
    setFormError(error);
    setSelected(error ? null : file);
    setPreviewUrl(error ? null : URL.createObjectURL(file));
  };

  const handlePublish = async () => {
    if (!selected || saving) return;
    const ok = await run(() => addMenuImage(selected), 'Se sumó la imagen al menú.', 'No se pudo guardar la imagen. Intentá nuevamente.');
    if (ok) discard();
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
    await run(
      () => replaceMenuImage(id, file),
      'La imagen se actualizó: el bot ya envía la nueva.',
      'No se pudo guardar la imagen. Intentá nuevamente.'
    );
  };

  const handleRemove = async (id: number) => {
    await run(
      async () => {
        await deleteMenuImage(id);
        return fetchMenuImages();
      },
      'Se quitó la imagen del menú.',
      'No se pudo quitar la imagen. Intentá nuevamente.'
    );
    setConfirmingRemovalOf(null);
  };

  const handleMove = async (index: number, offset: -1 | 1) => {
    const ids = images.map((image) => image.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    await run(() => reorderMenuImages(ids), null, 'No se pudo cambiar el orden. Intentá nuevamente.');
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto relative">
      <Toast message={toast.message} />

      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-1">
        <h1 className="text-lg font-bold text-gray-900">Menú en imagen</h1>
        <p className="text-xs text-gray-500">
          Son las imágenes que el bot les manda a los clientes cuando piden el menú o la carta. Si tu menú está partido
          en varias (por ejemplo, una por sección), cargalas todas: el bot las envía en el orden que ves acá. Formato
          JPG o PNG, de hasta {MAX_IMAGE_MB} MB cada una. Si no hay ninguna cargada, el bot responde con el menú en texto.
        </p>
      </div>

      {loadError && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{loadError}</div>}
      {!menu && !loadError && <PanelNote>Cargando menú...</PanelNote>}

      {menu && (
        <>
          <section aria-label="Imágenes del menú" className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">
              Imágenes del menú ({images.length} de {menu.max_images})
            </h2>

            {images.length === 0 ? (
              <p className="text-sm text-gray-400 rounded-xl border border-gray-200 bg-gray-50 px-4 py-10 text-center">
                Todavía no cargaste ninguna imagen del menú.
              </p>
            ) : (
              <ol className="grid gap-4 sm:grid-cols-2">
                {images.map((image, index) => (
                  <li key={image.id} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="rounded-lg bg-gray-50 min-h-40 flex items-center justify-center overflow-hidden">
                      <img
                        src={productImageSrc(image.image_url)}
                        alt={`Imagen ${index + 1} del menú`}
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
                          onClick={() => handleRemove(image.id)}
                          disabled={saving}
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
                          onClick={() => handleMove(index, -1)}
                          disabled={saving || index === 0}
                          aria-label={`Subir la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
                        >
                          ↑ Subir
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(index, 1)}
                          disabled={saving || index === images.length - 1}
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
                          disabled={saving}
                          aria-label={`Reemplazar la imagen ${index + 1}`}
                          className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
                        >
                          Reemplazar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingRemovalOf(image.id)}
                          disabled={saving}
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
              aria-label="Archivo para reemplazar una imagen del menú"
              onChange={(e) => handleReplaceFile(e.target.files?.[0])}
              className="hidden"
            />
          </section>

          <section aria-label="Agregar una imagen" className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-3">
            <h2 className="text-sm font-bold text-gray-900">Agregar imagen</h2>

            {isFull ? (
              <p className="text-xs text-gray-500">
                El menú ya tiene el máximo de {menu.max_images} imágenes. Quitá alguna para sumar otra.
              </p>
            ) : selected && previewUrl ? (
              <>
                <div className="rounded-xl border border-gray-200 bg-gray-50 min-h-48 flex items-center justify-center overflow-hidden">
                  <img src={previewUrl} alt="Vista previa de la imagen nueva" className="max-h-96 w-full object-contain" />
                </div>
                <p className="text-xs text-gray-500 break-all">
                  {selected.name} · {formatSize(selected.size)} · se suma al final del menú
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={saving}
                    className="font-bold text-sm rounded-xl bg-black hover:bg-gray-800 disabled:opacity-60 text-white px-4 py-2 transition"
                  >
                    {saving ? 'Guardando...' : 'Agregar al menú'}
                  </button>
                  <button
                    type="button"
                    onClick={discard}
                    disabled={saving}
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
              aria-label="Archivo de imagen del menú"
              onChange={(e) => handleFile(e.target.files?.[0])}
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
