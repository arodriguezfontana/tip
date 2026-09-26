import { api } from './api';
import type { AdminOrder, OrderStatus, WebOrderCreated, WebOrderPayload } from '@/types/order';

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

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  estimatedMinutes?: number
): Promise<AdminOrder> {
  const { data } = await api.patch<AdminOrder>(`/orders/${orderId}/status`, {
    status,
    ...(estimatedMinutes !== undefined ? { estimated_minutes: estimatedMinutes } : {}),
  });
  return data;
}

/** Pedido presencial cargado por el personal desde el panel (entra directamente confirmado). */
export async function createCounterOrder(payload: WebOrderPayload): Promise<WebOrderCreated> {
  const { data } = await api.post<WebOrderCreated>('/orders/counter', payload);
  return data;
}

export async function createWebOrder(payload: WebOrderPayload): Promise<WebOrderCreated> {
  const { data } = await api.post<WebOrderCreated>('/orders/web', payload);
  return data;
}
