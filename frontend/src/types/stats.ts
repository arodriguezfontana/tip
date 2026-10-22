export interface TopProduct {
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

export interface StatusDistributionResponse {
  status_distribution: Record<string, number>;
}

export interface BestSellingDayResponse {
  best_selling_day: string | null;
  total_revenue: number | null;
}

export interface StatsParams {
  dateFrom?: Date;
  dateTo?: Date;
}