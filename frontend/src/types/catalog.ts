import type { RecipeItem } from '@/types/ingredient';
import type { ProductCategory } from '@/types/order';

/** Producto tal como lo ve el panel: incluye los no disponibles, los sin categoría y su receta. */
export interface AdminProduct {
  id: number;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  dietary_restrictions: string[];
  /** null si se lo quitó de su categoría: mientras tanto no se muestra en el menú. */
  category: ProductCategory | null;
  /** Ruta relativa a la API (ver productImageSrc). */
  image_url: string | null;
  recipe: RecipeItem[];
}

export interface ProductPayload {
  name: string;
  description: string;
  price: number;
  category_id: number;
  is_active: boolean;
  dietary_restrictions: string[];
}

/** Qué hacer con la imagen al guardar el formulario del producto. */
export type ImageChange = { type: 'keep' } | { type: 'upload'; file: File } | { type: 'remove' };

export interface CategoryProduct {
  id: number;
  name: string;
  is_active: boolean;
}

export interface AdminCategory {
  id: number;
  name: string;
  products: CategoryProduct[];
}

export interface CategoryPayload {
  name: string;
  /** Productos que forman la categoría. Los que estaban en otra se mueven a esta. */
  product_ids: number[];
}
