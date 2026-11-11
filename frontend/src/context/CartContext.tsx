import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, OrderItemModification, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';
import { CartContext } from '@/context/cart-context';
import { basePriceOf, isPlainLineOf, lineMatches, withMoreUnits } from '@/utils/cart';
import { additionsCost } from '@/utils/modifications';
import { formatPizzaHalfName } from '@/utils/pizzaHalf';

let nextCartLineId = 1;
function createLineId(prefix: string | number): string {
  return `${prefix}-${Date.now()}-${nextCartLineId++}`;
}

/** Suma las unidades a la línea que cumple la condición o, si no hay, agrega la línea nueva. */
function addOrIncrease(
  lines: CartItem[],
  isSameLine: (item: CartItem) => boolean,
  quantity: number,
  newLine: () => CartItem
): CartItem[] {
  if (!lines.some(isSameLine)) return [...lines, newLine()];
  return lines.map((item) => (isSameLine(item) ? withMoreUnits(item, quantity) : item));
}

/** La línea con una sola unidad menos y, a continuación, esa unidad suelta (sin modificaciones) para personalizarla. */
function splitOneUnit(lines: CartItem[], lineId: string): CartItem[] {
  const index = lines.findIndex((line) => line.id === lineId);
  const line = lines[index];
  if (!line || line.quantity <= 1) return lines;

  const separated: CartItem = {
    ...line,
    id: createLineId(line.product.id),
    quantity: 1,
    modifications: [],
    unit_price: basePriceOf(line),
  };
  return [...lines.slice(0, index), { ...line, quantity: line.quantity - 1 }, separated, ...lines.slice(index + 1)];
}

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((product: Product, quantity = 1, secondaryProduct?: Product, customName?: string) => {
    const secondaryId = secondaryProduct?.id;
    const customLineName = secondaryProduct
      ? customName || formatPizzaHalfName(product.name, secondaryProduct.name)
      : undefined;
    const newLine = (): CartItem => ({
      id: createLineId(product.id),
      product,
      quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
      secondary_product: secondaryProduct,
      custom_name: customLineName,
      unit_price: secondaryProduct ? Math.max(product.price, secondaryProduct.price) : product.price,
      modifications: [],
    });
    setItems((prev) =>
      addOrIncrease(prev, (item) => isPlainLineOf(item, product.id, secondaryId), quantity, newLine)
    );
  }, []);

  const addPromotion = useCallback((promotion: Promotion, quantity = 1) => {
    const promoProduct: Product = {
      id: -promotion.id,
      name: promotion.name,
      description: promotion.description,
      price: promotion.price,
      category: { id: 0, name: 'Promociones' },
      dietary_restrictions: [],
      image_url: promotion.image_url,
    };
    const newLine = (): CartItem => ({
      id: createLineId(`promo-${promotion.id}`),
      product: promoProduct,
      promotion,
      quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
      custom_name: promotion.name,
      unit_price: promotion.price,
      modifications: [],
    });
    setItems((prev) => addOrIncrease(prev, (item) => item.promotion?.id === promotion.id, quantity, newLine));
  }, []);

  const removeItem = useCallback((idOrLineId: number | string, secondaryProductId?: number, isPromotion = false) => {
    setItems((prev) => prev.filter((item) => !lineMatches(item, idOrLineId, secondaryProductId, isPromotion)));
  }, []);

  const updateQuantity = useCallback((
    idOrLineId: number | string,
    quantity: number,
    secondaryProductId?: number,
    isPromotion = false
  ) => {
    if (quantity <= 0) {
      removeItem(idOrLineId, secondaryProductId, isPromotion);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        lineMatches(item, idOrLineId, secondaryProductId, isPromotion)
          ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) }
          : item
      )
    );
  }, [removeItem]);

  const updateItemModifications = useCallback((lineId: string, modifications: OrderItemModification[]) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === lineId ? { ...item, modifications, unit_price: basePriceOf(item) + additionsCost(modifications) } : item
      )
    );
  }, []);

  const splitItem = useCallback((lineId: string) => {
    setItems((prev) => splitOneUnit(prev, lineId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const total = items.reduce((sum, item) => sum + (item.unit_price ?? item.product.price) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const value = useMemo(
    () => ({
      items,
      addItem,
      addPromotion,
      removeItem,
      updateQuantity,
      updateItemModifications,
      splitItem,
      clearCart,
      total,
      itemCount,
    }),
    [items, addItem, addPromotion, removeItem, updateQuantity, updateItemModifications, splitItem, clearCart, total, itemCount]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
