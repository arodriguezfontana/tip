export interface PromotionItem {
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface Promotion {
  id: number;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  is_available: boolean;
  image_url: string | null;
  items: PromotionItem[];
  created_at?: string;
  updated_at?: string;
}

export interface PromotionPayload {
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  items: {
    product_id: number;
    quantity: number;
  }[];
  image_url?: string | null;
}

export interface PromotionImageItem {
  id: number;
  image_url: string;
  content_type: string;
  size_bytes: number;
  updated_at: string;
}

export interface PromotionImages {
  images: PromotionImageItem[];
  max_images: number;
}

export interface MenuConfig {
  menu_link: string | null;
}

export interface PromotionsConfig {
  promotions_link: string | null;
}

