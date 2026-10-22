import { API_URL } from '@/services/api';

/** Debe coincidir con MAX_IMAGE_BYTES del backend. */
export const MAX_IMAGE_MB = 5;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

/** Motivo por el que no se puede usar el archivo como imagen del producto, o null si está bien. */
export function validateImageFile(file: File): string | null {
  const byExtension = /\.(jpe?g|png)$/i.test(file.name);
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type) && !(file.type === '' && byExtension)) {
    return 'La imagen tiene que ser un archivo JPG o PNG.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `La imagen no puede pesar más de ${MAX_IMAGE_MB} MB.`;
  }
  return null;
}

/** URL completa de la imagen de un producto a partir de la ruta que devuelve la API. */
export function productImageSrc(imageUrl: string): string {
  return `${API_URL}${imageUrl}`;
}

/** "sin TACC, vegano" -> ["sin TACC", "vegano"] */
export function parseRestrictions(value: string): string[] {
  return value
    .split(',')
    .map((restriction) => restriction.trim())
    .filter(Boolean);
}
