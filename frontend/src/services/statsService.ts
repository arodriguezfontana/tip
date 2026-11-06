import { api } from './api';
import type {
  BestSellingDayResponse,
  BusinessGoalsResponse,
  DashboardKPIsResponse,
  StatsParams,
  StrategicInsightResponse,
  TopProduct,
  UpdateBusinessGoalsPayload,
} from '@/types/stats';

export async function fetchStatusDistribution(params: StatsParams = {}): Promise<Record<string, number>> {
  const { data } = await api.get<{ status_distribution: Record<string, number> }>('/stats/status-distribution', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
    },
  });
  return data.status_distribution;
}

export async function fetchTopProducts(params: StatsParams = {}, limit: number = 5): Promise<TopProduct[]> {
  const { data } = await api.get<TopProduct[]>('/stats/top-products', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
      limit,
    },
  });
  return data;
}

export async function fetchBestSellingDay(params: StatsParams = {}): Promise<BestSellingDayResponse> {
  const { data } = await api.get<BestSellingDayResponse>('/stats/best-selling-day', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
    },
  });
  return data;
}

export async function fetchDashboardKPIs(params: StatsParams = {}): Promise<DashboardKPIsResponse> {
  const { data } = await api.get<DashboardKPIsResponse>('/stats/kpis', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
    },
  });
  return data;
}

export async function fetchBusinessGoals(): Promise<BusinessGoalsResponse> {
  const { data } = await api.get<BusinessGoalsResponse>('/stats/goals');
  return data;
}

export async function updateBusinessGoals(payload: UpdateBusinessGoalsPayload): Promise<BusinessGoalsResponse> {
  const { data } = await api.put<BusinessGoalsResponse>('/stats/goals', payload);
  return data;
}

export async function fetchStrategicInsight(params: StatsParams = {}): Promise<StrategicInsightResponse> {
  const { data } = await api.get<StrategicInsightResponse>('/stats/strategic-insight', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
    },
  });
  return data;
}
