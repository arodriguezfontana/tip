import { useEffect, useRef, useState } from 'react';
import type { ImageChange } from '@/types/catalog';
import { productImageSrc, validateImageFile } from '@/utils/catalog';

/**
 * La imagen de un producto o promoción en su formulario: la guardada, una nueva que se eligió (con vista previa)
 * o ninguna. `image` es el cambio que hay que mandar al guardar.
 */
export function useImageChoice(savedImageUrl: string | null | undefined) {
  const [image, setImage] = useState<ImageChange>({ type: 'keep' });
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Vista previa del archivo elegido: se libera al elegir otro o al cerrar el formulario.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  const keepsSavedImage = image.type === 'keep' && savedImageUrl;
  const shownImage = image.type === 'upload' ? previewUrl : keepsSavedImage ? productImageSrc(savedImageUrl) : null;

  const chooseFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    const error = validateImageFile(file);
    setImageError(error);
    if (error) return;
    setImage({ type: 'upload', file });
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageError(null);
    setPreviewUrl(null);
    // Sin imagen guardada no hay nada que borrar: solo se descarta el archivo elegido.
    setImage(savedImageUrl ? { type: 'remove' } : { type: 'keep' });
  };

  return { image, imageError, shownImage, fileInput, chooseFile, removeImage };
}

export type ImageChoice = ReturnType<typeof useImageChoice>;
