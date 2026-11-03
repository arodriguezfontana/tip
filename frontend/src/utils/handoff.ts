import type { HandoffSummary } from '@/types/handoff';

type Identity = Pick<HandoffSummary, 'customer_name' | 'customer_username' | 'customer_phone'>;

/** Nombre con el que se muestra al cliente: el que dio al bot, el de Telegram o, si no hay, su @usuario. */
export function handoffName(handoff: Identity): string {
  return handoff.customer_name || (handoff.customer_username ? `@${handoff.customer_username}` : 'Cliente');
}

/** Datos extra para distinguir a dos clientes con el mismo nombre (@usuario y teléfono). */
export function handoffDetails(handoff: Identity): string {
  return [handoff.customer_username && `@${handoff.customer_username}`, handoff.customer_phone]
    .filter(Boolean)
    .join(' · ');
}

// Cada chat tiene siempre el mismo color, para reconocerlo de un vistazo en la lista.
const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
  'bg-lime-100 text-lime-700',
];

export function handoffAvatarColor(id: number): string {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}
