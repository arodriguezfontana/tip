import type { OrderItemModification } from '@/types/order';

/** Texto de una modificación sin los corchetes, ej. "SIN CEBOLLA". */
export function cleanModTag(mod: OrderItemModification): string {
  const label = mod.tag || (mod.type === 'negative' ? `SIN ${mod.name.toUpperCase()}` : `EXTRA ${mod.name.toUpperCase()}`);
  return label.split('[').join('').split(']').join('').trim();
}

/** Identifica un conjunto de modificaciones sin importar el orden, para juntar las unidades iguales. */
export function getModificationsKey(mods?: OrderItemModification[]): string {
  if (!mods || mods.length === 0) return '';
  return [...mods]
    .map((m) => `${m.type}:${(m.name || '').trim().toLowerCase()}:${(m.tag || '').trim()}`)
    .sort()
    .join('|');
}

/** Si la modificación suma algo al plato (un extra) en lugar de quitarle un ingrediente. */
export function isAddition(mod: OrderItemModification): boolean {
  return mod.type === 'positive' || mod.action === 'add';
}

/** Lo que suman al precio unitario las modificaciones que agregan algo. */
export function additionsCost(mods: OrderItemModification[] | undefined): number {
  return (mods ?? []).filter((mod) => isAddition(mod) && mod.price).reduce((total, mod) => total + (mod.price ?? 0), 0);
}
