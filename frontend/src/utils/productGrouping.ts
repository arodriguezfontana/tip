import type { Product, ProductCategory } from '@/types/order';
import { groupBy } from '@/utils/collections';

export interface ProductGroup {
  category: ProductCategory;
  products: Product[];
}

export function groupByCategory(products: Product[]): ProductGroup[] {
  const productsByCategory = groupBy(products, (product) => product.category.id);
  return [...productsByCategory.values()].map((group) => ({ category: group[0].category, products: group }));
}
