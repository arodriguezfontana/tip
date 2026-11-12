import { useState } from 'react';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';

const productLineKey = (productId: number) => `prod-${productId}`;
const promotionLineKey = (promotionId: number) => `promo-${promotionId}`;

/** Clave de la línea del pedido: un producto o una promoción (una sola línea de cada uno). */
export const orderLineKey = (line: CartItem): string =>
  line.promotion ? promotionLineKey(line.promotion.id) : productLineKey(line.product.id);

/** Producto que representa a una promoción en el pedido. */
function promotionAsProduct(promotion: Promotion): Product {
  return {
    id: -promotion.id,
    name: promotion.name,
    description: promotion.description,
    price: promotion.price,
    category: { id: -1, name: 'Promociones' },
    dietary_restrictions: [],
    image_url: promotion.image_url,
  };
}

/** Suma una unidad a la línea que cumple la condición o, si no hay, agrega la línea nueva. */
function addUnit(lines: CartItem[], isSameLine: (line: CartItem) => boolean, newLine: CartItem): CartItem[] {
  if (!lines.some(isSameLine)) return [...lines, newLine];
  return lines.map((line) =>
    isSameLine(line) ? { ...line, quantity: Math.min(line.quantity + 1, MAX_QUANTITY_PER_ITEM) } : line
  );
}

/** Las líneas del pedido que se está cargando en el mostrador y sus totales. */
export function useOrderLines() {
  const [lines, setLines] = useState<CartItem[]>([]);

  const addProduct = (product: Product) =>
    setLines((prev) =>
      addUnit(prev, (line) => !line.promotion && line.product.id === product.id, {
        product,
        quantity: 1,
        unit_price: product.price,
      })
    );

  const addPromotion = (promotion: Promotion) =>
    setLines((prev) =>
      addUnit(prev, (line) => line.promotion?.id === promotion.id, {
        id: promotionLineKey(promotion.id),
        product: promotionAsProduct(promotion),
        promotion,
        quantity: 1,
        unit_price: promotion.price,
      })
    );

  const removeLine = (lineKey: string) => setLines((prev) => prev.filter((line) => orderLineKey(line) !== lineKey));

  const changeQuantity = (lineKey: string, quantity: number) => {
    if (quantity <= 0) {
      removeLine(lineKey);
      return;
    }
    setLines((prev) =>
      prev.map((line) =>
        orderLineKey(line) === lineKey ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) } : line
      )
    );
  };

  const total = lines.reduce(
    (sum, line) => sum + (line.promotion ? line.promotion.price : line.product.price) * line.quantity,
    0
  );
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);

  return { lines, addProduct, addPromotion, removeLine, changeQuantity, clear: () => setLines([]), total, units };
}
