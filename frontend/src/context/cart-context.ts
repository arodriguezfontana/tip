import { createContext } from 'react';
import type { CartItem, OrderItemModification, Product } from '@/types/order';
import type { Promotion } from '@/types/promotion';

export interface CartContextValue {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, secondaryProduct?: Product, customName?: string) => void;
  addPromotion: (promotion: Promotion, quantity?: number) => void;
  removeItem: (idOrLineId: number | string, secondaryProductId?: number, isPromotion?: boolean) => void;
  updateQuantity: (idOrLineId: number | string, quantity: number, secondaryProductId?: number, isPromotion?: boolean) => void;
  updateItemModifications: (lineId: string, modifications: OrderItemModification[]) => void;
  splitItem?: (lineId: string) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

export const CartContext = createContext<CartContextValue | undefined>(undefined);
