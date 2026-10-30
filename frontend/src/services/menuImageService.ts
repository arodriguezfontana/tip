import { api } from './api';
import type { MenuImages } from '@/types/menuImage';
import type { MenuConfig } from '@/types/promotion';

/** El archivo viaja tal cual en el cuerpo del pedido. */
const fileRequest = (file: File) => ({
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
  timeout: 30000,
});

export async function fetchMenuImages(): Promise<MenuImages> {
  const { data } = await api.get<MenuImages>('/menu-image');
  return data;
}

/** Suma una imagen al final del menú. */
export async function addMenuImage(file: File): Promise<MenuImages> {
  const { data } = await api.post<MenuImages>('/menu-image', file, fileRequest(file));
  return data;
}

/** Cambia el contenido de una imagen sin moverla de lugar. */
export async function replaceMenuImage(id: number, file: File): Promise<MenuImages> {
  const { data } = await api.put<MenuImages>(`/menu-image/${id}`, file, fileRequest(file));
  return data;
}

export async function deleteMenuImage(id: number): Promise<void> {
  await api.delete(`/menu-image/${id}`);
}

/** Deja las imágenes en el orden indicado (tienen que estar todas). */
export async function reorderMenuImages(ids: number[]): Promise<MenuImages> {
  const { data } = await api.put<MenuImages>('/menu-image/order', { ids });
  return data;
}

export async function fetchMenuConfig(): Promise<MenuConfig> {
  const { data } = await api.get<MenuConfig>('/menu-images/config');
  return data;
}

export async function updateMenuConfig(menuLink: string | null): Promise<MenuConfig> {
  const { data } = await api.put<MenuConfig>('/menu-images/config', { menu_link: menuLink });
  return data;
}
