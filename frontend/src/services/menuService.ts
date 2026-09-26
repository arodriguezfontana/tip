import { api } from './api';
import type { Product } from '@/types/order';

export async function fetchMenuProducts(): Promise<Product[]> {
  const { data } = await api.get<Product[]>('/menu/products');
  return data;
}
