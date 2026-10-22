import type { Product, ProductCategory } from '@/types/order';

export interface ProductGroup {
  category: ProductCategory;
  products: Product[];
}

export function groupByCategory(products: Product[]): ProductGroup[] {
  const groups: ProductGroup[] = [];
  for (const product of products) {
    let group = groups.find((g) => g.category.id === product.category.id);
    if (!group) {
      group = { category: product.category, products: [] };
      groups.push(group);
    }
    group.products.push(product);
  }
  return groups;
}
