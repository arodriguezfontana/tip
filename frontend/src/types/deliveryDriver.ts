export interface DeliveryDriver {
  id: number;
  name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryDriverPayload {
  name: string;
  phone: string;
  is_active?: boolean;
}

