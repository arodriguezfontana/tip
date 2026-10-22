import { api } from './api';

/**
 * Le pide al backend que verifique con MercadoPago el pago con el que el cliente volvió del checkout
 * (y, si se aprobó, marque el pedido como abonado). Devuelve el estado según MercadoPago
 * ('approved', 'pending', 'rejected', ...) o null si no se pudo consultar.
 */
export async function confirmMercadoPagoPayment(paymentId: string): Promise<string | null> {
  const { data } = await api.post<{ status: string | null }>('/mercadopago/confirm', { payment_id: paymentId });
  return data.status;
}

/** Lleva al navegador al checkout de MercadoPago (fuera de la app). */
export function redirectToCheckout(url: string): void {
  window.location.assign(url);
}
