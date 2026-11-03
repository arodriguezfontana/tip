/** Una de las imágenes del menú (la carta puede estar partida en varias). */
export interface MenuImageItem {
  id: number;
  /** Ruta de la imagen en la API; cambia al reemplazarla, así nunca se muestra una copia vieja. */
  image_url: string;
  content_type: string;
  size_bytes: number;
  updated_at: string;
}

/** Imágenes del menú en el orden en que el bot las manda cuando un cliente pide la carta. */
export interface MenuImages {
  images: MenuImageItem[];
  max_images: number;
}
