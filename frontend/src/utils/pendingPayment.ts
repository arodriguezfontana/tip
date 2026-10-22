import type { CheckoutFormData, WebOrderCreated } from '@/types/order';

/** Lo que se muestra en la confirmación del pedido. */
export interface PendingPaymentOrder {
  order: WebOrderCreated;
  form: CheckoutFormData;
}

const keyFor = (orderId: number | string) => `pendingPayment:${orderId}`;

/**
 * Guarda el pedido antes de mandar al cliente a pagar en MercadoPago: al volver la página se carga de
 * nuevo y, sin esto, no tendría los datos del pedido para mostrar en la confirmación. Vale solo para esta
 * pestaña (sessionStorage); si no está disponible, la confirmación se muestra sin el detalle.
 */
export function savePendingPaymentOrder(data: PendingPaymentOrder): void {
  try {
    sessionStorage.setItem(keyFor(data.order.id), JSON.stringify(data));
  } catch {
    // Sin storage disponible solo se pierde el detalle del pedido en la confirmación.
  }
}

export function loadPendingPaymentOrder(orderId: number | string): PendingPaymentOrder | null {
  try {
    const raw = sessionStorage.getItem(keyFor(orderId));
    return raw ? (JSON.parse(raw) as PendingPaymentOrder) : null;
  } catch {
    return null;
  }
}

export function clearPendingPaymentOrder(orderId: number | string): void {
  try {
    sessionStorage.removeItem(keyFor(orderId));
  } catch {
    // Nada que limpiar.
  }
}
