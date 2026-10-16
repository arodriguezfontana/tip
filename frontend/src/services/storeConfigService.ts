import { api } from './api';
import type { StoreConfig, StoreConfigUpdatePayload } from '@/types/storeConfig';

/** Obtiene la configuración visual y de contacto de la tienda (acceso público). */
export async function fetchStoreConfig(signal?: AbortSignal): Promise<StoreConfig> {
  const { data } = await api.get<StoreConfig>('/store-config', { signal });
  return data;
}

/** Guarda los cambios en la configuración visual y de contacto (requiere sesión de administrador). */
export async function updateStoreConfig(payload: StoreConfigUpdatePayload): Promise<StoreConfig> {
  const { data } = await api.put<StoreConfig>('/store-config', payload);
  return data;
}

