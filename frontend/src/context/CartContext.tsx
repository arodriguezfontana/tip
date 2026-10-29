import { useState } from 'react';
import type { ReactNode } from 'react';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, Product } from '@/types/order';
import { CartContext } from '@/context/cart-context';
import { formatPizzaHalfName } from '@/utils/pizzaHalf';

function isSameItem(item: CartItem, productId: number, secondaryProductId?: number): boolean {
  return item.product.id === productId && item.secondary_product?.id === (secondaryProductId ?? undefined);
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

  const removeItem = (productId: number, secondaryProductId?: number) => {
    setItems((prev) => prev.filter((item) => !isSameItem(item, productId, secondaryProductId)));
  };

  const updateQuantity = (productId: number, quantity: number, secondaryProductId?: number) => {
    if (quantity <= 0) {
      removeItem(productId, secondaryProductId);
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        isSameItem(item, productId, secondaryProductId)
          ? { ...item, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = items.reduce((sum, item) => sum + (item.unit_price ?? item.product.price) * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}
