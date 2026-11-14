import type { PaymentMethod } from '@/types/order';

export interface DeliveryDriver {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rating_average?: number | null;
  ratings_count?: number;
  reviews_count?: number;
}

export interface DeliveryDriverPayload {
  name: string;
  phone: string;
  is_active?: boolean;
}


/** Pedido que forma parte de un viaje del repartidor. */
export interface TripOrder {
  id: number;
  shift_number: number;
  customer_name: string;
  shipping_address: string;
  payment_method: PaymentMethod | null;
  total_amount: number;
  status: string;
}

/** Recorrido del repartidor: un envío individual o una ruta con varias paradas. */
export interface DriverTrip {
  id: number;
  dispatched_at: string;
  finished_at: string | null;
  is_in_progress: boolean;
  stops_count: number;
  orders: TripOrder[];
}

export interface DriverActivity {
  trips_count: number;
  delivered_orders_count: number;
  cash_to_hand_over: number;
  trips: DriverTrip[];
}

export interface DriverReview {
  id: number;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

export interface DriverReviewsDetail {
  driver_id: number;
  driver_name: string;
  delivered_orders_count: number;
  rating_average: number | null;
  ratings_count: number;
  reviews_count: number;
  reviews: DriverReview[];
}
