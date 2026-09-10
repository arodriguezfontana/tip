import { useEffect, useState } from 'react';
import type { StatsParams, TopProduct } from '@/types/stats';
import { fetchStatusDistribution, fetchTopProducts, fetchBestSellingDay } from '@/services/statsService';

export function useStats(params: StatsParams = {}) {
  const [statusDistribution, setStatusDistribution] = useState<Record<string, number>>({});
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [bestDay, setBestDay] = useState<{ best_selling_day: string | null; total_revenue: number | null }>({
    best_selling_day: null,
    total_revenue: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const [statusData, topData, bestDayData] = await Promise.all([
          fetchStatusDistribution(params),
          fetchTopProducts(params),
          fetchBestSellingDay(params),
        ]);

        if (!cancelled) {
          setStatusDistribution(statusData);
          setTopProducts(topData);
          setBestDay(bestDayData);
        }
      } catch {
        if (!cancelled) {
          setError('No se pudieron cargar las estadísticas del negocio.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [params.dateFrom, params.dateTo]);

  return { statusDistribution, topProducts, bestDay, loading, error };
}