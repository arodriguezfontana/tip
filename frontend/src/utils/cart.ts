import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, IngredientExtra, OrderItemModification } from '@/types/order';
import { isAddition } from '@/utils/modifications';

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** Clave de la línea en la pantalla: su id o, si no tiene, lo que identifica a su producto o promoción. */
export function lineKeyOf(item: CartItem): string {
  if (item.id) return item.id;
  if (item.promotion) return `promo-${item.promotion.id}`;
  return item.secondary_product ? `${item.product?.id}-${item.secondary_product.id}` : `${item.product?.id}`;
}

/** Precio de una unidad sin modificaciones: el del gusto más caro en una pizza mitad y mitad, o el de la promo. */
export function basePriceOf(item: CartItem): number {
  if (item.secondary_product) return Math.max(item.product.price, item.secondary_product.price);
  return item.promotion ? item.promotion.price : item.product.price;
}

/** La línea suma esas unidades sin pasar del máximo por producto. */
export function withMoreUnits(item: CartItem, quantity: number): CartItem {
  return { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY_PER_ITEM) };
}

/** Línea de ese producto (y ese segundo gusto, si es una mitad y mitad) sin ninguna modificación. */
export function isPlainLineOf(item: CartItem, productId: number, secondaryProductId?: number): boolean {
  return (
    item.product.id === productId &&
    item.secondary_product?.id === secondaryProductId &&
    (!item.modifications || item.modifications.length === 0)
  );
}

/** Si la línea es la indicada por su id de línea (texto) o, con un número, por su producto o promoción. */
export function lineMatches(
  item: CartItem,
  idOrLineId: number | string,
  secondaryProductId: number | undefined,
  isPromotion: boolean
): boolean {
  if (typeof idOrLineId === 'string') return item.id === idOrLineId;
  return isPromotion ? item.promotion?.id === idOrLineId : isPlainLineOf(item, idOrLineId, secondaryProductId);
}

export interface CustomizationOptions {
  /** Ingredientes que se pueden quitar (los de las recetas de los productos de la línea). */
  recipeIngredients: string[];
  /** Adicionales que se pueden agregar. */
  allowedExtras: IngredientExtra[];
}

/** Qué se puede personalizar de una línea (en una pizza mitad y mitad, lo de los dos gustos). Las promos no se personalizan. */
export function customizationOptionsOf(item: CartItem): CustomizationOptions {
  if (item.promotion) return { recipeIngredients: [], allowedExtras: [] };
  const products = [item.product, item.secondary_product].filter((product) => product !== undefined);
  const recipeIngredients = products.flatMap((product) => product.recipe_ingredients ?? []);
  const extras = products.flatMap((product) => product.allowed_extras ?? []);
  return {
    recipeIngredients: [...new Set(recipeIngredients)],
    allowedExtras: extras.filter((extra, index) => extras.findIndex((other) => other.id === extra.id) === index),
  };
}

const isExclusionOf = (mod: OrderItemModification, ingredient: string): boolean =>
  mod.type === 'negative' && sameName(mod.name, ingredient);

const isExtraOf = (mod: OrderItemModification, extra: IngredientExtra): boolean =>
  isAddition(mod) && (mod.ingredient_id === extra.id || sameName(mod.name, extra.name));

export function hasExclusion(mods: OrderItemModification[] | undefined, ingredient: string): boolean {
  return Boolean(mods?.some((mod) => isExclusionOf(mod, ingredient)));
}

export function hasExtra(mods: OrderItemModification[] | undefined, extra: IngredientExtra): boolean {
  return Boolean(mods?.some((mod) => isExtraOf(mod, extra)));
}

/** Las modificaciones con el ingrediente quitado (o devuelto, si `excluded` es false). */
export function withExclusion(
  mods: OrderItemModification[] | undefined,
  ingredient: string,
  excluded: boolean
): OrderItemModification[] {
  const current = mods ?? [];
  if (!excluded) return current.filter((mod) => !isExclusionOf(mod, ingredient));
  const exclusion: OrderItemModification = {
    type: 'negative',
    action: 'remove',
    name: ingredient.toLowerCase(),
    tag: `SIN ${ingredient.toUpperCase()}`,
    price: 0,
  };
  return [...current, exclusion];
}

/** Las modificaciones con el adicional agregado (o sacado, si `added` es false). */
export function withExtra(
  mods: OrderItemModification[] | undefined,
  extra: IngredientExtra,
  added: boolean
): OrderItemModification[] {
  const current = mods ?? [];
  if (!added) return current.filter((mod) => !isExtraOf(mod, extra));
  const addition: OrderItemModification = {
    type: 'positive',
    action: 'add',
    name: extra.name.toLowerCase(),
    tag: `EXTRA ${extra.name.toUpperCase()}`,
    price: extra.extra_price,
    ingredient_id: extra.id,
  };
  return [...current, addition];
}
