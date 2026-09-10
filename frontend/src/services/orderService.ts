import { api } from './api';
import type { AdminOrder, OrderStatus } from '@/types/order';

export interface FetchOrdersParams {
  dateFrom?: Date;
  dateTo?: Date;
  status?: OrderStatus[];
}

export async function fetchOrders(params: FetchOrdersParams = {}): Promise<AdminOrder[]> {
  const { data } = await api.get<AdminOrder[]>('/orders', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
      status: params.status,
    },
    // FastAPI's `status: list[str] = Query(None)` binds repeated `status=a&status=b`,
    // not axios's default bracketed `status[]=a&status[]=b`.
    paramsSerializer: { indexes: null },
  });
  return data;
}

export async function updateOrderStatus(orderId: number, status: OrderStatus): Promise<AdminOrder> {
  const { data } = await api.patch<AdminOrder>(`/orders/${orderId}/status`, { status });
  return data;
}