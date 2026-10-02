export interface ProductCategory {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  category: ProductCategory;
  dietary_restrictions: string[];
}

/** Debe coincidir con MAX_QUANTITY_PER_ITEM del backend. */
export const MAX_QUANTITY_PER_ITEM = 20;

export interface CartItem {
  product: Product;
  quantity: number;
}

export type DeliveryMethod = 'domicilio' | 'retiro';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
};

export interface CheckoutFormData {
  name: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  notes: string;
}

export interface WebOrderItemPayload {
  product_id: number;
  quantity: number;
}

export interface WebOrderPayload {
  customer_name: string;
  customer_phone: string;
  delivery_method: DeliveryMethod;
  shipping_address: string | null;
  notes: string | null;
  items: WebOrderItemPayload[];
}

/** Pedido presencial: el personal registra además cómo paga el cliente. */
export interface CounterOrderPayload extends WebOrderPayload {
  payment_method: PaymentMethod | null;
  is_paid: boolean;
}

export interface WebOrderItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface WebOrderCreated {
  id: number;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string | null;
  delivery_method: DeliveryMethod;
  shipping_address: string;
  notes: string | null;
  total_amount: number;
  created_at: string;
  items: WebOrderItem[];
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

export type OrderSource = 'bot' | 'web' | 'mostrador';

export interface AdminOrder {
  id: number;
  customer_name: string;
  shipping_address: string;
  total_amount: number;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  source: OrderSource;
  customer_phone: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  created_at: string;
  item_count: number;
}

/** Detalle completo de un pedido para el panel (productos, entrega y facturación). */
export interface OrderDetail extends AdminOrder {
  items: WebOrderItem[];
  subtotal: number;
  shipping_cost: number;
  payment_method: PaymentMethod | null;
  is_paid: boolean;
}
