/** Cliente de la agenda del local (se registra al confirmar pedidos de mostrador). */
export interface Client {
  id: number;
  phone: string;
  full_name: string;
  address: string | null;
  created_at: string;
}

export interface ClientPaginatedResponse {
  items: Client[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface ClientQueryParams {
  search?: string;
  page?: number;
  per_page?: number;
}