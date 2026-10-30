import { api } from './api';
import type { PromotionImages } from '@/types/promotion';

const fileRequest = (file: File) => ({
  headers: { 'Content-Type': file.type || 'application/octet-stream' },
  timeout: 30000,
});

export async function fetchPromotionImages(): Promise<PromotionImages> {
  const { data } = await api.get<PromotionImages>('/promotion-images');
  return data;
}

export async function addPromotionImage(file: File): Promise<PromotionImages> {
  const { data } = await api.post<PromotionImages>('/promotion-images', file, fileRequest(file));
  return data;
}

export async function replacePromotionImage(id: number, file: File): Promise<PromotionImages> {
  const { data } = await api.put<PromotionImages>(`/promotion-images/${id}`, file, fileRequest(file));
  return data;
}

export async function deletePromotionImage(id: number): Promise<void> {
  await api.delete(`/promotion-images/${id}`);
}

export async function reorderPromotionImages(ids: number[]): Promise<PromotionImages> {
  const { data } = await api.put<PromotionImages>('/promotion-images/order', { ids });
  return data;
}

