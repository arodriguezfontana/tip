const OPEN_ORDER_CHAT_EVENT = 'restoit:open-order-chat';

/** Pide abrir el chat con el cliente de un pedido en la columna de conversaciones del panel. */
export function openOrderChat(orderId: number): void {
  window.dispatchEvent(new CustomEvent<number>(OPEN_ORDER_CHAT_EVENT, { detail: orderId }));
}

/** Escucha los pedidos de abrir un chat; devuelve la función para dejar de escuchar. */
export function onOpenOrderChat(listener: (orderId: number) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<number>).detail);
  window.addEventListener(OPEN_ORDER_CHAT_EVENT, handler);
  return () => window.removeEventListener(OPEN_ORDER_CHAT_EVENT, handler);
}
