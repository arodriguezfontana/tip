import { api } from './api';
import type { ApiErrorResponse } from './api';
import type { Client, ClientPaginatedResponse, ClientQueryParams } from '@/types/client';

/** La búsqueda es solo una ayuda: si tarda más que esto se abandona y se carga a mano. */
const LOOKUP_TIMEOUT_MS = 3000;

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as ApiErrorResponse).statusCode === 404;
}

/** Busca un cliente por teléfono. Devuelve null si el teléfono no está registrado. */
export async function lookupClientByPhone(phone: string, signal?: AbortSignal): Promise<Client | null> {
  try {
    const { data } = await api.get<Client>('/clients/lookup', {
      params: { phone },
      signal,
      timeout: LOOKUP_TIMEOUT_MS,
    });
    return data;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Obtiene el listado paginado de clientes con filtros opcionales de búsqueda. */
export async function fetchClients(params?: ClientQueryParams): Promise<ClientPaginatedResponse> {
  const { data } = await api.get<ClientPaginatedResponse>('/clients', {
    params,
  });
  return data;
}