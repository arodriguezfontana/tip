import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchMenuProducts } from '@/services/menuService';
import type { Product } from '@/types/order';

const NO_PRODUCTS: Product[] = [];

/** Productos disponibles del menú (los que se pueden pedir), para la web del cliente y el mostrador. */
export function useMenuProducts(errorMessage = 'No se pudo cargar el menú.') {
  const { data, loading, error, reload } = useAsyncData(fetchMenuProducts, errorMessage, { useServerMessage: true });
  return { products: data ?? NO_PRODUCTS, loading, error, reload };
}
