import type { AdminOrder, OrderStatus } from '@/types/order';

export const ALERT_THRESHOLD_MS = 2 * 60 * 1000;

export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return `${minutes}min`;
}

/** Proporción final del tiempo estimado en la que el pedido pasa a estar "por vencer". */
const WARNING_FRACTION = 0.25;

/** Los programados no tienen demora estimada: pasan a "por vencer" en los últimos minutos antes de su horario. */
const SCHEDULED_WARNING_MS = 15 * 60000;

/** Estados en los que el pedido todavía está en curso y corre contra el tiempo estimado. */
const TIMED_STATUSES: OrderStatus[] = ['Confirmado', 'En Camino'];

export type DelayLevel = 'on-time' | 'warning' | 'late';

/**
 * Qué tan cerca está un pedido de vencer: los pedidos para ahora vencen a los `estimated_minutes`
 * de haberse hecho y los programados, en su horario. Devuelve null si no aplica.
 */
export function getDelayLevel(order: AdminOrder, now: number): DelayLevel | null {
  if (!TIMED_STATUSES.includes(order.status)) return null;

  let deadline: number;
  let warningMs: number;
  if (order.scheduled_for) {
    deadline = new Date(order.scheduled_for).getTime();
    warningMs = SCHEDULED_WARNING_MS;
  } else if (order.estimated_minutes != null) {
    const estimatedMs = order.estimated_minutes * 60000;
    deadline = new Date(order.created_at).getTime() + estimatedMs;
    warningMs = estimatedMs * WARNING_FRACTION;
  } else {
    return null;
  }

  const remainingMs = deadline - now;
  if (remainingMs < 0) return 'late';
  if (remainingMs <= warningMs) return 'warning';
  return 'on-time';
}
