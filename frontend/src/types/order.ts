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
