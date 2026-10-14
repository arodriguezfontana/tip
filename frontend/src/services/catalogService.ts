import { api } from './api';
import type { AdminCategory, AdminProduct, CategoryPayload, ProductPayload } from '@/types/catalog';

/** Todos los productos (también los no disponibles y los sin categoría) con su receta. */
export async function fetchAdminProducts(): Promise<AdminProduct[]> {
  const { data } = await api.get<AdminProduct[]>('/products');
  return data;
}

export async function createProduct(payload: ProductPayload): Promise<AdminProduct> {
  const { data } = await api.post<AdminProduct>('/products', payload);
  return data;
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<AdminProduct> {
  const { data } = await api.put<AdminProduct>(`/products/${id}`, payload);
  return data;
}

/** Carga o reemplaza la imagen. El archivo viaja tal cual en el cuerpo del pedido. */
export async function uploadProductImage(id: number, file: File): Promise<AdminProduct> {
  const { data } = await api.put<AdminProduct>(`/products/${id}/image`, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    timeout: 30000,
  });
  return data;
}

export async function deleteProductImage(id: number): Promise<AdminProduct> {
  const { data } = await api.delete<AdminProduct>(`/products/${id}/image`);
  return data;
}

export async function fetchCategories(): Promise<AdminCategory[]> {
  const { data } = await api.get<AdminCategory[]>('/categories');
  return data;
}

export async function createCategory(payload: CategoryPayload): Promise<AdminCategory> {
  const { data } = await api.post<AdminCategory>('/categories', payload);
  return data;
}

export async function updateCategory(id: number, payload: CategoryPayload): Promise<AdminCategory> {
  const { data } = await api.put<AdminCategory>(`/categories/${id}`, payload);
  return data;
}

/** Sus productos quedan sin categoría (no se borran). */
export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/categories/${id}`);
}
