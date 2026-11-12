import type { AdminOrder } from '@/types/order';

/** Minúsculas y sin acentos, para comparar sin distinguir "José" de "jose". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const digitsOf = (text: string) => text.replace(/\D/g, '');

/**
 * Indica si el pedido coincide con lo que se escribió en el buscador del tablero. Compara (sin distinguir
 * mayúsculas ni acentos, y de forma parcial) contra el número de pedido ("#66" o "66"), el nombre del cliente,
 * la dirección de entrega y el teléfono. Sin texto, todos los pedidos coinciden.
 */
export function orderMatchesSearch(order: AdminOrder, rawTerm: string): boolean {
  const term = normalize(rawTerm.trim());
  if (!term) return true;

  const withoutHash = term.replace(/^#/, '').trim();
  if (withoutHash && /^\d+$/.test(withoutHash) && String(order.shift_number).includes(withoutHash)) return true;

  if (normalize(order.customer_name ?? '').includes(term)) return true;
  if (normalize(order.shipping_address ?? '').includes(term)) return true;

  // El teléfono se compara solo por sus dígitos, así "11 6293-9338" y "1162939338" coinciden.
  const termDigits = digitsOf(term);
  const phoneDigits = digitsOf(order.customer_phone ?? '');
  return termDigits.length > 0 && /^[\d\s()+-]+$/.test(term) && phoneDigits.includes(termDigits);
}
