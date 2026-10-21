/** Lee un archivo como Data URL tal cual viene. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Lectura inválida')));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    image.src = src;
  });
}

/**
 * Achica una foto para usarla de fondo (lado mayor de `maxSize` px, JPEG) y la devuelve como Data URL.
 * Así una foto del celular de varios MB queda en unos cientos de KB. Si el navegador no puede
 * procesarla, se usa la imagen original.
 */
export async function resizeImageToDataUrl(file: File, maxSize = 1920, quality = 0.85): Promise<string> {
  const original = await readFileAsDataUrl(file);
  try {
    const image = await loadImage(original);
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context || canvas.width === 0 || canvas.height === 0) return original;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const resized = canvas.toDataURL('image/jpeg', quality);
    return resized.length < original.length ? resized : original;
  } catch {
    return original;
  }
}
