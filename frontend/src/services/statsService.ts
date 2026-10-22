import { api } from './api';
import type { BestSellingDayResponse, StatsParams, TopProduct } from '@/types/stats';

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