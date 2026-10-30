import { api } from './api';
import type { Promotion, PromotionPayload, PromotionsConfig } from '@/types/promotion';

export async function fetchPromotions(): Promise<Promotion[]> {
  const { data } = await api.get<Promotion[]>('/promotions');
  return data;
}

export async function fetchAvailablePromotions(): Promise<Promotion[]> {
  const { data } = await api.get<Promotion[]>('/promotions/available');
  return data;
}

export async function getPromotion(id: number): Promise<Promotion> {
  const { data } = await api.get<Promotion>(`/promotions/${id}`);
  return data;
}

export async function createPromotion(payload: PromotionPayload): Promise<Promotion> {
  const { data } = await api.post<Promotion>('/promotions', payload);
  return data;
}

export async function updatePromotion(id: number, payload: PromotionPayload): Promise<Promotion> {
  const { data } = await api.put<Promotion>(`/promotions/${id}`, payload);
  return data;
}

export async function deletePromotion(id: number): Promise<void> {
  await api.delete(`/promotions/${id}`);
}

/** Carga o reemplaza la foto de la promoción. El archivo viaja tal cual en el cuerpo. */
export async function uploadPromotionImage(id: number, file: File): Promise<Promotion> {
  const { data } = await api.put<Promotion>(`/promotions/${id}/image`, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    timeout: 30000,
  });
  return data;
}

export async function deletePromotionImage(id: number): Promise<Promotion> {
  const { data } = await api.delete<Promotion>(`/promotions/${id}/image`);
  return data;
}

export async function fetchPromotionsConfig(): Promise<PromotionsConfig> {
  const { data } = await api.get<PromotionsConfig>('/promotions/config');
  return data;
}

export async function updatePromotionsConfig(promotionsLink: string | null): Promise<PromotionsConfig> {
  const { data } = await api.put<PromotionsConfig>('/promotions/config', { promotions_link: promotionsLink });
  return data;
}

