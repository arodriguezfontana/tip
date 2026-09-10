export interface ProductCategory {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  dietary_restrictions: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type DeliveryMethod = 'domicilio' | 'retiro';

export interface CheckoutFormData {
  name: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  notes: string;
}

export interface CheckoutFormErrors {
  name?: string;
  phone?: string;
  address?: string;
}

export type OrderStatus =
  | 'Pendiente'
  | 'Confirmado'
  | 'En Camino'
  | 'Listo para Retirar'
  | 'Finalizado'
  | 'Rechazado';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'Pendiente',
  'Confirmado',
  'En Camino',
  'Listo para Retirar',
];

export interface AdminOrder {
  id: number;
  customer_name: string;
  shipping_address: string;
  total_amount: number;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  created_at: string;
  item_count: number;
}
