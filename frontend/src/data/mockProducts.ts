import type { Product, ProductCategory } from '@/types/order';

const CATEGORIA_PIZZAS: ProductCategory = { id: 1, name: 'Pizzas' };
const CATEGORIA_BEBIDAS: ProductCategory = { id: 2, name: 'Bebidas' };
const CATEGORIA_POSTRES: ProductCategory = { id: 3, name: 'Postres' };

export const mockProducts: Product[] = [
  {
    id: 1,
    name: 'Pizza Muzzarella',
    description: 'La clásica: salsa de tomate, muzzarella y albahaca fresca.',
    price: 8500,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: ['vegetariano'],
  },
  {
    id: 2,
    name: 'Pizza Napolitana',
    description: 'Muzzarella, tomate en rodajas, ajo y albahaca.',
    price: 9500,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: ['vegetariano'],
  },
  {
    id: 3,
    name: 'Pizza Fugazzeta',
    description: 'Doble muzzarella con abundante cebolla.',
    price: 9800,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: ['vegetariano'],
  },
  {
    id: 4,
    name: 'Pizza Especial',
    description: 'Salsa de tomate, muzzarella, jamón y morrones.',
    price: 10500,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: [],
  },
  {
    id: 5,
    name: 'Pizza Calabresa',
    description: 'Muzzarella con longaniza calabresa y aceitunas negras.',
    price: 10200,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: [],
  },
  {
    id: 6,
    name: 'Pizza Roquefort',
    description: 'Muzzarella con generosas porciones de queso roquefort.',
    price: 10800,
    category: CATEGORIA_PIZZAS,
    dietary_restrictions: ['vegetariano'],
  },
  {
    id: 7,
    name: 'Coca-Cola 500ml',
    description: 'Botella de 500ml.',
    price: 2500,
    category: CATEGORIA_BEBIDAS,
    dietary_restrictions: [],
  },
  {
    id: 8,
    name: 'Agua Mineral 500ml',
    description: 'Sin gas o con gas.',
    price: 1800,
    category: CATEGORIA_BEBIDAS,
    dietary_restrictions: [],
  },
  {
    id: 9,
    name: 'Cerveza Quilmes 1L',
    description: 'Botella retornable de 1 litro.',
    price: 3200,
    category: CATEGORIA_BEBIDAS,
    dietary_restrictions: [],
  },
  {
    id: 10,
    name: 'Flan casero',
    description: 'Con dulce de leche y crema.',
    price: 3500,
    category: CATEGORIA_POSTRES,
    dietary_restrictions: ['vegetariano'],
  },
  {
    id: 11,
    name: 'Helado 2 bochas',
    description: 'A elección de sabores disponibles.',
    price: 4000,
    category: CATEGORIA_POSTRES,
    dietary_restrictions: ['vegetariano'],
  },
];

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
