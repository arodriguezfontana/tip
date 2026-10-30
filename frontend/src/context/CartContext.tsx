import { useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';
import { CartContext } from '@/context/cart-context';
import { formatPizzaHalfName } from '@/utils/pizzaHalf';

function isSameItem(
  item: CartItem,
  productId?: number,
  secondaryProductId?: number,
  promotionId?: number
): boolean {
  if (promotionId !== undefined) {
    return item.promotion?.id === promotionId;
  }
  return (
    item.product.id === productId &&
    item.secondary_product?.id === (secondaryProductId ?? undefined)
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
          product,
          quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
          secondary_product: secondaryProduct,
          custom_name: finalCustomName,
          unit_price: unitPrice,
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
          product: promoProduct,
          promotion,
          quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
          custom_name: promotion.name,
          unit_price: promotion.price,
        },
      ];
    });
  };

  const removeItem = (id: number, secondaryProductId?: number, isPromotion = false) => {
    setItems((prev) =>
      prev.filter((item) =>
        isPromotion ? item.promotion?.id !== id : !isSameItem(item, id, secondaryProductId)
      )
    );
  };

  const updateQuantity = (id: number, quantity: number, secondaryProductId?: number, isPromotion = false) => {
    if (quantity <= 0) {
      removeItem(id, secondaryProductId, isPromotion);
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        const match = isPromotion
          ? item.promotion?.id === id
          : isSameItem(item, id, secondaryProductId);
        return match
          ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) }
          : item;
      })
    );
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
      value={{ items, addItem, addPromotion, removeItem, updateQuantity, clearCart, total, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}
