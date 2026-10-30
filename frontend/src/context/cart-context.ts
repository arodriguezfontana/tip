import { createContext } from 'react';
import type { CartItem, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';

export interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, secondaryProduct?: Product, customName?: string) => void;
  addPromotion: (promotion: Promotion, quantity?: number) => void;
  removeItem: (id: number, secondaryProductId?: number, isPromotion?: boolean) => void;
  updateQuantity: (id: number, quantity: number, secondaryProductId?: number, isPromotion?: boolean) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);
