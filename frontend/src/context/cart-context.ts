import { createContext } from 'react';
import type { CartItem, Product } from '@/types/order';

export interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);
