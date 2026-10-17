import { api } from './api';
import type { DeliveryDriver, DeliveryDriverPayload } from '@/types/deliveryDriver';

/** Obtiene la lista de repartidores, opcionalmente filtrada por activos o término de búsqueda. */
export async function fetchDeliveryDrivers(params?: {
  active_only?: boolean;
  search?: string;
}): Promise<DeliveryDriver[]> {
  const { data } = await api.get<DeliveryDriver[]>('/delivery-drivers', { params });
  return data;
}

/** Registra un nuevo repartidor en el sistema. */
export async function createDeliveryDriver(payload: DeliveryDriverPayload): Promise<DeliveryDriver> {
  const { data } = await api.post<DeliveryDriver>('/delivery-drivers', payload);
  return data;
}

/** Modifica los datos de un repartidor existente. */
export async function updateDeliveryDriver(
  id: number,
  payload: DeliveryDriverPayload
): Promise<DeliveryDriver> {
  const { data } = await api.put<DeliveryDriver>(`/delivery-drivers/${id}`, payload);
  return data;
}

