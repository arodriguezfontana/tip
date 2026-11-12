import type { PromotionProductDetail, WebOrderItem } from '@/types/order';
import { getModificationsKey } from '@/utils/modifications';

type Modifications = NonNullable<WebOrderItem['modifications']>;

export interface ModificationVariant {
  quantity: number;
  modifications: Modifications;
}

/** Fila de un sector en el detalle del pedido: un producto con todas las unidades que se piden de él. */
export interface SectorRowItem {
  id: string | number;
  product_id?: number | null;
  total_quantity: number;
  normal_quantity: number;
  promo_quantity: number;
  product_name: string;
  has_normal_units: boolean;
  has_promo_units: boolean;
  normal_subtotal: number;
  added_later?: boolean;
  variants: ModificationVariant[];
  promo_names: string[];
}

export interface OrderSectorGroups {
  itemsBySector: [string, SectorRowItem[]][];
  promoItems: WebOrderItem[];
}

/** Lo que un ítem del pedido (o un producto de una promoción) aporta a la fila de un producto. */
interface RowContribution {
  rowId: string | number;
  productId?: number | null;
  productName: string;
  quantity: number;
  /** Lo que cuestan esas unidades fuera de una promoción (las de promo no suman al subtotal normal). */
  subtotal: number;
  isPromo: boolean;
  promoName?: string;
  addedLater?: boolean;
  modifications: Modifications;
  sector: string;
}

const DEFAULT_SECTOR = 'cocina';

export function normalizeProductName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isPromotionItem = (item: WebOrderItem): boolean => Boolean(item.promotion_id || item.is_promotion);

const sectorOf = (item: WebOrderItem): string => item.sector?.toLowerCase() || DEFAULT_SECTOR;

const productIdKey = (productId: number) => `id:${productId}`;

/** Sector de cada producto suelto del pedido (por nombre y por id), para ubicar a los de las promociones. */
function buildProductSectorLookup(items: WebOrderItem[]): Map<string, string> {
  const regularItems = items.filter((item) => !isPromotionItem(item));
  const entries = regularItems.flatMap((item): [string, string][] => [
    [normalizeProductName(item.product_name), sectorOf(item)],
    ...(item.product_id ? ([[productIdKey(item.product_id), sectorOf(item)]] as [string, string][]) : []),
  ]);
  return new Map(entries);
}

function promoProductSector(
  lookup: Map<string, string>,
  product: { product_name: string; product_id?: number | null; sector?: string },
): string {
  const byId = product.product_id ? lookup.get(productIdKey(product.product_id)) : undefined;
  return lookup.get(normalizeProductName(product.product_name)) ?? byId ?? product.sector?.toLowerCase() ?? DEFAULT_SECTOR;
}

function regularContribution(item: WebOrderItem, index: number): RowContribution {
  return {
    rowId: item.id ?? item.product_id ?? `item-${index}`,
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    subtotal: item.subtotal,
    isPromo: false,
    addedLater: item.added_later,
    modifications: item.modifications || [],
    sector: sectorOf(item),
  };
}

function promoProductContribution(
  promo: WebOrderItem,
  product: PromotionProductDetail,
  index: number,
  lookup: Map<string, string>,
): RowContribution {
  return {
    rowId: `promo-${promo.id ?? promo.promotion_id}-${product.product_id}-${index}`,
    productId: product.product_id,
    productName: product.product_name,
    quantity: product.quantity,
    subtotal: 0,
    isPromo: true,
    promoName: promo.product_name,
    addedLater: promo.added_later,
    modifications: [],
    sector: promoProductSector(lookup, product),
  };
}

/** Promoción que no detalla sus productos: se cuenta como un producto más. */
function promoWithoutProductsContribution(promo: WebOrderItem, index: number, lookup: Map<string, string>): RowContribution {
  return {
    rowId: promo.id ?? `promo-${promo.promotion_id}-${index}`,
    productId: promo.product_id,
    productName: promo.product_name,
    quantity: promo.quantity,
    subtotal: 0,
    isPromo: true,
    promoName: promo.product_name,
    addedLater: promo.added_later,
    modifications: promo.modifications || [],
    sector: promoProductSector(lookup, promo),
  };
}

function contributionsOf(item: WebOrderItem, index: number, lookup: Map<string, string>): RowContribution[] {
  if (!isPromotionItem(item)) return [regularContribution(item, index)];
  const products = item.promotion_products ?? [];
  if (products.length === 0) return [promoWithoutProductsContribution(item, index, lookup)];
  return products.map((product) => promoProductContribution(item, product, index, lookup));
}

function isSameProduct(row: SectorRowItem, productId: number | null | undefined, normalizedName: string): boolean {
  const sameId = Boolean(productId && row.product_id && row.product_id === productId);
  return sameId || normalizeProductName(row.product_name) === normalizedName;
}

function addToVariants(variants: ModificationVariant[], quantity: number, modifications: Modifications): void {
  const key = getModificationsKey(modifications);
  const existing = variants.find((variant) => getModificationsKey(variant.modifications) === key);
  if (existing) existing.quantity += quantity;
  else variants.push({ quantity, modifications });
}

function newRow(c: RowContribution): SectorRowItem {
  return {
    id: c.rowId,
    product_id: c.productId,
    total_quantity: c.quantity,
    normal_quantity: c.isPromo ? 0 : c.quantity,
    promo_quantity: c.isPromo ? c.quantity : 0,
    product_name: c.productName,
    has_normal_units: !c.isPromo,
    has_promo_units: c.isPromo,
    normal_subtotal: c.isPromo ? 0 : c.subtotal,
    added_later: c.addedLater,
    variants: [{ quantity: c.quantity, modifications: c.modifications }],
    promo_names: c.promoName ? [c.promoName] : [],
  };
}

function mergeIntoRow(row: SectorRowItem, c: RowContribution): void {
  row.total_quantity += c.quantity;
  if (c.isPromo) {
    row.promo_quantity += c.quantity;
    row.has_promo_units = true;
  } else {
    row.normal_quantity += c.quantity;
    row.has_normal_units = true;
    row.normal_subtotal += c.subtotal;
  }
  if (!row.product_id && c.productId) row.product_id = c.productId;
  if (c.addedLater) row.added_later = true;
  if (c.promoName && !row.promo_names.includes(c.promoName)) row.promo_names.push(c.promoName);
  addToVariants(row.variants, c.quantity, c.modifications);
}

function addContribution(rowsBySector: Map<string, SectorRowItem[]>, c: RowContribution): void {
  const rows = rowsBySector.get(c.sector) ?? [];
  rowsBySector.set(c.sector, rows);
  const existing = rows.find((row) => isSameProduct(row, c.productId, normalizeProductName(c.productName)));
  if (existing) mergeIntoRow(existing, c);
  else rows.push(newRow(c));
}

/** Agrupa los productos del pedido por sector de preparación (los de las promociones van al sector de cada
 * producto) y aparte las promociones pedidas. */
export function groupItemsBySector(items: WebOrderItem[]): OrderSectorGroups {
  const lookup = buildProductSectorLookup(items);
  const rowsBySector = new Map<string, SectorRowItem[]>();
  items
    .flatMap((item, index) => contributionsOf(item, index, lookup))
    .forEach((contribution) => addContribution(rowsBySector, contribution));
  return { itemsBySector: Array.from(rowsBySector.entries()), promoItems: items.filter(isPromotionItem) };
}
