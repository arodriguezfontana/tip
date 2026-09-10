import { api } from './api';
import type { AdminOrder } from '@/types/order';

export interface FetchOrdersParams {
  dateFrom?: Date;
  dateTo?: Date;
}

export async function fetchOrders(params: FetchOrdersParams = {}): Promise<AdminOrder[]> {
  const { data } = await api.get<AdminOrder[]>('/orders', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
    },
  });
  return data;
}

export async function updateOrderStatus(orderId: number, status: string): Promise<AdminOrder> {
  const { data } = await api.patch<AdminOrder>(`/orders/${orderId}/status`, { status });
  return data;
}