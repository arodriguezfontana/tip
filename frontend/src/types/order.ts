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
  /** Ruta de la imagen relativa a la API (ver productImageSrc), o null si no tiene. */
  image_url: string | null;
}

/** Debe coincidir con MAX_QUANTITY_PER_ITEM del backend. */
export const MAX_QUANTITY_PER_ITEM = 20;

export interface CartItem {
  product: Product;
  quantity: number;
  secondary_product?: Product;
  custom_name?: string;
  unit_price?: number;
}

export type DeliveryMethod = 'domicilio' | 'retiro';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'mercadopago';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mercadopago: 'MercadoPago',
};

/** Medios que se ofrecen al tomar un pedido (los demás quedan solo para mostrar pedidos viejos). */
export const COUNTER_PAYMENT_METHODS: PaymentMethod[] = ['efectivo', 'mercadopago'];

/** Medios con los que el cliente puede pagar un pedido hecho desde la web. */
export type WebPaymentMethod = Extract<PaymentMethod, 'efectivo' | 'mercadopago'>;
export const WEB_PAYMENT_METHODS: WebPaymentMethod[] = ['efectivo', 'mercadopago'];

export interface CheckoutFormData {
  name: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  notes: string;
  paymentMethod: WebPaymentMethod;
}

export interface WebOrderItemPayload {
  product_id: number;
  quantity: number;
  secondary_product_id?: number;
  custom_name?: string;
}

export interface WebOrderPayload {
  customer_name: string;
  customer_phone: string;
  delivery_method: DeliveryMethod;
  shipping_address: string | null;
  notes: string | null;
  items: WebOrderItemPayload[];
  payment_method: WebPaymentMethod;
}

/** Pedido presencial: el personal registra además cómo paga el cliente. */
export interface CounterOrderPayload extends Omit<WebOrderPayload, 'payment_method'> {
  payment_method: PaymentMethod | null;
  is_paid: boolean;
}

export type PreparationSector = 'cocina' | 'pizzeria' | 'barra';

export type SectorFilter = 'todos' | PreparationSector;

export interface SectorMeta {
  key: PreparationSector;
  label: string;
  icon: string;
  badgeClass: string;
  activeTabClass: string;
}

export const SECTOR_CONFIG: Record<PreparationSector, SectorMeta> = {
  pizzeria: {
    key: 'pizzeria',
    label: 'Pizzería',
    icon: 'pizzeria',
    badgeClass: 'bg-amber-100 text-amber-800 border border-amber-200',
    activeTabClass: 'bg-amber-600 text-white shadow-xs',
  },
  cocina: {
    key: 'cocina',
    label: 'Cocina',
    icon: 'cocina',
    badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
    activeTabClass: 'bg-emerald-600 text-white shadow-xs',
  },
  barra: {
    key: 'barra',
    label: 'Barra',
    icon: 'barra',
    badgeClass: 'bg-sky-100 text-sky-800 border border-sky-200',
    activeTabClass: 'bg-sky-600 text-white shadow-xs',
  },
};

export interface WebOrderItem {
  id?: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sector?: PreparationSector | string;
  is_prepared?: boolean;
  /** Lo agregó el cliente después de registrar el pedido. */
  added_later?: boolean;
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
  payment_method: PaymentMethod | null;
  is_paid: boolean;
  /** Link de Checkout Pro de MercadoPago al que se redirige al cliente (solo si eligió MercadoPago). */
  payment_url: string | null;
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
  | 'Rechazado'
  | 'Cancelado';

/** Estados en los que el pedido ya terminó (sale del tablero de comandas). */
export const FINISHED_ORDER_STATUSES: OrderStatus[] = ['Finalizado', 'Rechazado', 'Cancelado'];

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'Pendiente',
  'Confirmado',
  'En Camino',
  'Listo para Retirar',
];

export type OrderSource = 'bot' | 'web' | 'mostrador';

/** Canal de chat de los pedidos del bot. */
export type OrderChannel = 'telegram' | 'whatsapp';

export interface AdminOrder {
  id: number;
  customer_name: string;
  shipping_address: string;
  total_amount: number;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  source: OrderSource;
  channel?: OrderChannel | null;
  customer_phone: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  scheduled_for: string | null;
  created_at: string;
  item_count: number;
  delivery_driver_id?: number | null;
  delivery_driver_name?: string | null;
  payment_method?: PaymentMethod | null;
  is_paid?: boolean;
  /** Pago parcial (se agregaron productos a un pedido ya abonado): lo cobrado, lo que falta y cómo se salda. */
  paid_amount?: number;
  pending_amount?: number;
  balance_payment_method?: PaymentMethod | null;
  /** Se agregaron productos y cocina todavía no lo vio. */
  kitchen_update_pending?: boolean;
  items?: WebOrderItem[];
  items_prepared_count?: number;
  is_all_prepared?: boolean;
  sectors?: (PreparationSector | string)[];
}

/** Detalle completo de un pedido para el panel (productos, entrega y facturación). */
export interface OrderDetail extends AdminOrder {
  items: WebOrderItem[];
  subtotal: number;
  shipping_cost: number;
  payment_method: PaymentMethod | null;
  is_paid: boolean;
}
