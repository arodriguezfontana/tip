import { useCallback, useEffect, useState } from 'react';
import { fetchAvailablePromotions } from '@/services/promotionService';
import type { Promotion } from '@/types/promotion';

/** Promociones vigentes que se pueden pedir. Si no se pueden cargar, simplemente no se muestran. */
export function useAvailablePromotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    fetchAvailablePromotions()
      .then((data) => setPromotions(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    fetchAvailablePromotions()
      .then((data) => {
        if (active) setPromotions(data ?? []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return { promotions, loading, reload };
}
