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

export interface GrowthMetric {
  current: number;
  previous: number;
  growth_pct: number | null;
  trend: 'up' | 'down' | 'neutral';
  is_positive: boolean;
}

export interface GoalProgress {
  period_type: string;
  target_revenue: number;
  revenue_progress_pct: number;
  revenue_remaining: number;
  target_orders: number;
  orders_progress_pct: number;
  orders_remaining: number;
}

export interface TopProductKpi {
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  estimated_cost: number;
  gross_profit: number;
  margin_pct: number;
  quantity_growth_pct?: number | null;
  revenue_growth_pct?: number | null;
}

export interface DashboardKPIsResponse {
  revenue: GrowthMetric;
  orders_count: GrowthMetric;
  completed_orders_count: number;
  average_ticket: GrowthMetric;
  cancellation_rate: GrowthMetric;
  cogs: GrowthMetric;
  gross_profit: GrowthMetric;
  gross_margin_pct: number;
  goal: GoalProgress | null;
  best_selling_day: {
    day: string | null;
    revenue: number | null;
    growth_pct: number | null;
    trend: string;
  };
  status_distribution: Record<string, number>;
  top_products: TopProductKpi[];
}

export interface BusinessGoalItem {
  period_type: string;
  target_revenue: number;
  target_orders: number;
  updated_at?: string | null;
}

export interface BusinessGoalsResponse {
  goals: BusinessGoalItem[];
}

export interface UpdateBusinessGoalsPayload {
  goals: BusinessGoalItem[];
}

export interface StrategicInsightResponse {
  summary: string;
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  generated_at: string;
}
