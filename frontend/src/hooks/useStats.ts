import { useCallback } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { StatsParams } from '@/types/stats';
import { fetchStatusDistribution, fetchTopProducts, fetchBestSellingDay } from '@/services/statsService';

const NO_BEST_DAY = { best_selling_day: null, total_revenue: null };

export function useStats({ dateFrom, dateTo }: StatsParams = {}) {
  const load = useCallback(async () => {
    const params = { dateFrom, dateTo };
    const [statusDistribution, topProducts, bestDay] = await Promise.all([
      fetchStatusDistribution(params),
      fetchTopProducts(params),
      fetchBestSellingDay(params),
    ]);
    return { statusDistribution, topProducts, bestDay };
  }, [dateFrom, dateTo]);
  const { data, loading, error } = useAsyncData(load, 'No se pudieron cargar las estadísticas del negocio.');

  return {
    statusDistribution: data?.statusDistribution ?? {},
    topProducts: data?.topProducts ?? [],
    bestDay: data?.bestDay ?? NO_BEST_DAY,
    loading,
    error,
  };
}