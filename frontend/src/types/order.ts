import type { Promotion } from './promotion';

export interface ProductCategory {
  id: number;
  name: string;
}

export interface IngredientExtra {
  id: number;
  name: string;
  extra_price: number;
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
  recipe_ingredients?: string[];
  allowed_extras?: IngredientExtra[];
}

/** Debe coincidir con MAX_QUANTITY_PER_ITEM del backend. */
export const MAX_QUANTITY_PER_ITEM = 20;

export interface CartItem {
  id?: string;
  product: Product;
  promotion?: Promotion;
  quantity: number;
  secondary_product?: Product;
  custom_name?: string;
  unit_price?: number;
  modifications?: OrderItemModification[];
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
  product_id?: number;
  promotion_id?: number;
  quantity: number;
  secondary_product_id?: number;
  custom_name?: string;
  modifications?: OrderItemModification[];
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

export interface OrderItemModification {
  type: 'positive' | 'negative';
  action?: 'add' | 'remove';
  name: string;
  tag?: string;
  price?: number;
  ingredient_id?: number | null;
}

export interface PromotionProductDetail {
  product_id: number;
  product_name: string;
  quantity: number;
  sector: PreparationSector | string;
}

export interface WebOrderItem {
  id?: number;
  product_id?: number | null;
  promotion_id?: number | null;
  is_promotion?: boolean;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  sector?: PreparationSector | string;
  is_prepared?: boolean;
  /** Lo agregó el cliente después de registrar el pedido. */
  added_later?: boolean;
  modifications?: OrderItemModification[];
  promotion_products?: PromotionProductDetail[];
  promotion_description?: string | null;
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
  /** Solo en pedidos de mostrador: por qué no se pudo imprimir la comanda (el pedido se guardó igual). */
  print_error?: string | null;
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
  /** El pedido salió de un chat del bot: se puede hablar con el cliente desde el panel. */
  has_chat?: boolean;
  customer_phone: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  /** De dónde salió la demora: historial del local, la cargó el personal o la estándar. */
  estimate_source?: 'smart' | 'manual' | 'default' | null;
  /** Demora real en minutos (desde que ingresó hasta que se finalizó); vacía mientras el pedido no terminó. */
  actual_minutes?: number | null;
  scheduled_for: string | null;
  created_at: string;
  item_count: number;
  delivery_driver_id?: number | null;
  /** Viaje en el que salió el pedido, su parada y la llegada estimada; vacíos mientras el viaje se está armando. */
  trip_id?: number | null;
  trip_stop?: number | null;
  eta_minutes?: number | null;
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
  /** Solo al confirmar el pedido: por qué no se pudo imprimir la comanda (el pedido se guardó igual). */
  print_error?: string | null;
}

/** Detalle completo de un pedido para el panel (productos, entrega y facturación). */
export interface OrderDetail extends AdminOrder {
  items: WebOrderItem[];
  subtotal: number;
  shipping_cost: number;
  payment_method: PaymentMethod | null;
  is_paid: boolean;
}

/** Cómo se estimará la demora al aceptar un pedido. */
export interface OrderDelayEstimate {
  /** 'smart': la calcula el sistema con el historial del local; 'manual': la tiene que indicar el empleado. */
  mode: 'smart' | 'manual';
  estimated_minutes: number | null;
  /** Pedidos parecidos con los que se calculó (o los que hay hasta ahora) y los que hacen falta. */
  samples: number;
  min_samples: number;
  queue_size: number;
  /** Demora estándar del local, para sugerirla al cargarla a mano. */
  suggested_minutes: number;
}

/** Una parada del viaje de un repartidor con la llegada estimada al domicilio. */
export interface TripStop {
  order_id: number;
  stop: number;
  address: string;
  customer_name: string;
  eta_minutes: number | null;
}

/** Viaje despachado: la ruta calculada sobre todos los pedidos del lote. */
export interface DeliveryTrip {
  id: number;
  delivery_driver_id: number | null;
  delivery_driver_name: string | null;
  dispatched_at: string;
  total_minutes: number | null;
  /** Por qué el viaje salió sin tiempos estimados (solo si no se pudo calcular la ruta). */
  warning?: string | null;
  stops: TripStop[];
}
