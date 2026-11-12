import type { DifferenceType } from '@/types/cashShift';

/** Categorías sugeridas para un movimiento manual; "Otro" permite escribir una propia. */
export const MOVEMENT_CATEGORIES = [
  'Pago a proveedor',
  'Adelanto de sueldo',
  'Compra de insumos',
  'Retiro de efectivo',
  'Aporte de cambio',
  'Otro',
];

export const OTHER_CATEGORY = 'Otro';

/** Diferencias menores a medio centavo se consideran exactas. */
const EXACT_TOLERANCE = 0.005;

/** El número que escribió el usuario, o null si el texto no es un número. */
export function parseAmount(text: string): number | null {
  const amount = parseFloat(text);
  return Number.isNaN(amount) ? null : amount;
}

/** Si el efectivo contado supera a lo esperado (sobrante), no llega (faltante) o coincide (exacta). */
export function classifyDifference(difference: number): DifferenceType {
  if (difference > EXACT_TOLERANCE) return 'sobrante';
  return difference < -EXACT_TOLERANCE ? 'faltante' : 'exacta';
}

/** Clase de color según el signo de una diferencia de caja. */
export function differenceTextClass(difference: number): string {
  if (difference > 0) return 'text-emerald-600';
  return difference < 0 ? 'text-rose-600' : 'text-gray-900';
}
