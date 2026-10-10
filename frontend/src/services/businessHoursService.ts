import { api } from './api';
import type { BusinessHoursRange, BusinessHoursStatus } from '@/types/businessHours';

/** Horarios de atención y si el local está abierto para recibir pedidos (endpoint público). */
export async function fetchBusinessHours(): Promise<BusinessHoursStatus> {
  const { data } = await api.get<BusinessHoursStatus>('/business-hours');
  return data;
}

/** Reemplaza los horarios de atención del local (solo administradores). */
export async function updateBusinessHours(ranges: BusinessHoursRange[]): Promise<BusinessHoursStatus> {
  const { data } = await api.put<BusinessHoursStatus>('/business-hours', { ranges });
  return data;
}
