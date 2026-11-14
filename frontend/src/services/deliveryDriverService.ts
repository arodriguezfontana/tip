import { api } from './api';
import type { DeliveryDriver, DeliveryDriverPayload, DriverActivity, DriverReviewsDetail } from '@/types/deliveryDriver';

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


export interface DriverActivityParams {
  dateFrom?: Date;
  dateTo?: Date;
  /** Solo los viajes del turno de caja abierto. */
  currentShift?: boolean;
}

/** Historial de viajes de un repartidor en un período, con el resumen y el efectivo que debe rendir. */
export async function fetchDriverActivity(driverId: number, params: DriverActivityParams = {}): Promise<DriverActivity> {
  const { data } = await api.get<DriverActivity>(`/delivery-drivers/${driverId}/trips`, {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
      current_shift: params.currentShift || undefined,
    },
  });
  return data;
}

/** Obtiene las reseñas anónimas y métricas de calificación de un repartidor. */
export async function fetchDriverReviews(driverId: number): Promise<DriverReviewsDetail> {
  const { data } = await api.get<DriverReviewsDetail>(`/delivery-drivers/${driverId}/reviews`);
  return data;
}
