import { useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, OrderItemModification, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';
import { CartContext } from '@/context/cart-context';
import { formatPizzaHalfName } from '@/utils/pizzaHalf';

let nextCartLineId = 1;
function createLineId(prefix: string | number): string {
  return `${prefix}-${Date.now()}-${nextCartLineId++}`;
}

function isSameItem(
  item: CartItem,
  productId?: number,
  secondaryProductId?: number,
  promotionId?: number,
  lineId?: string
): boolean {
  if (lineId && item.id) {
    return item.id === lineId;
  }
  if (promotionId !== undefined) {
    return item.promotion?.id === promotionId;
  }
  return (
    item.product.id === productId &&
    item.secondary_product?.id === (secondaryProductId ?? undefined) &&
    (!item.modifications || item.modifications.length === 0)
  );
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (product: Product, quantity = 1, secondaryProduct?: Product, customName?: string) => {
    const secId = secondaryProduct?.id;
    const unitPrice = secondaryProduct ? Math.max(product.price, secondaryProduct.price) : product.price;
    const finalCustomName = secondaryProduct
      ? (customName || formatPizzaHalfName(product.name, secondaryProduct.name))
      : undefined;

    setItems((prev) => {
      const existing = prev.find((item) => isSameItem(item, product.id, secId));
      if (existing) {
        return prev.map((item) =>
          isSameItem(item, product.id, secId)
            ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY_PER_ITEM) }
            : item
        );
      }
      return [
        ...prev,
        {
          id: createLineId(product.id),
          product,
          quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
          secondary_product: secondaryProduct,
          custom_name: finalCustomName,
          unit_price: unitPrice,
          modifications: [],
        },
      ];
    });
  };

  const addPromotion = (promotion: Promotion, quantity = 1) => {
    const promoProduct: Product = {
      id: -promotion.id,
      name: promotion.name,
      description: promotion.description,
      price: promotion.price,
      category: { id: 0, name: 'Promociones' },
      dietary_restrictions: [],
      image_url: promotion.image_url,
    };

    setItems((prev) => {
      const existing = prev.find((item) => item.promotion?.id === promotion.id);
      if (existing) {
        return prev.map((item) =>
          item.promotion?.id === promotion.id
            ? { ...item, quantity: Math.min(item.quantity + quantity, MAX_QUANTITY_PER_ITEM) }
            : item
        );
      }
      return [
        ...prev,
        {
          id: createLineId(`promo-${promotion.id}`),
          product: promoProduct,
          promotion,
          quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
          custom_name: promotion.name,
          unit_price: promotion.price,
          modifications: [],
        },
      ];
    });
  };

  const removeItem = (idOrLineId: number | string, secondaryProductId?: number, isPromotion = false) => {
    setItems((prev) =>
      prev.filter((item) => {
        if (typeof idOrLineId === 'string') {
          return item.id !== idOrLineId;
        }
        return isPromotion ? item.promotion?.id !== idOrLineId : !isSameItem(item, idOrLineId, secondaryProductId);
      })
    );
  };

  const updateQuantity = (
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
      prev.map((item) => {
        const match =
          typeof idOrLineId === 'string'
            ? item.id === idOrLineId
            : isPromotion
            ? item.promotion?.id === idOrLineId
            : isSameItem(item, idOrLineId, secondaryProductId);
        return match
          ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) }
          : item;
      })
    );
  };

  const updateItemModifications = (lineId: string, modifications: OrderItemModification[]) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== lineId) return item;
        const basePrice = item.secondary_product
          ? Math.max(item.product.price, item.secondary_product.price)
          : item.promotion
          ? item.promotion.price
          : item.product.price;
        const extraCost = (modifications || []).reduce((acc, m) => {
          if ((m.type === 'positive' || m.action === 'add') && m.price) {
            return acc + m.price;
          }
          return acc;
        }, 0);
        return {
          ...item,
          modifications,
          unit_price: basePrice + extraCost,
        };
      })
    );
  };

  const splitItem = (lineId: string) => {
    setItems((prev) => {
      const itemIndex = prev.findIndex((i) => i.id === lineId);
      if (itemIndex === -1) return prev;
      const currentItem = prev[itemIndex];
      if (currentItem.quantity <= 1) return prev;

      const updatedCurrent = {
        ...currentItem,
        quantity: currentItem.quantity - 1,
      };

      const basePrice = currentItem.secondary_product
        ? Math.max(currentItem.product.price, currentItem.secondary_product.price)
        : currentItem.promotion
        ? currentItem.promotion.price
        : currentItem.product.price;

      const newItem: CartItem = {
        ...currentItem,
        id: createLineId(currentItem.product.id),
        quantity: 1,
        modifications: [],
        unit_price: basePrice,
      };

      const nextItems = [...prev];
      nextItems[itemIndex] = updatedCurrent;
      nextItems.splice(itemIndex + 1, 0, newItem);
      return nextItems;
    });
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce(
    (sum, item) => sum + (item.unit_price ?? item.product.price) * item.quantity,
    0
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
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
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
