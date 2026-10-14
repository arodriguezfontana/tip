import { api } from './api';
import type {
  Ingredient,
  IngredientConsumptionParams,
  IngredientConsumptionReport,
  IngredientPayload,
  ProductWithRecipe,
  RecipeItemPayload,
} from '@/types/ingredient';

export async function fetchIngredients(): Promise<Ingredient[]> {
  const { data } = await api.get<Ingredient[]>('/ingredients');
  return data;
}

export async function createIngredient(payload: IngredientPayload): Promise<Ingredient> {
  const { data } = await api.post<Ingredient>('/ingredients', payload);
  return data;
}

export async function updateIngredient(id: number, payload: IngredientPayload): Promise<Ingredient> {
  const { data } = await api.put<Ingredient>(`/ingredients/${id}`, payload);
  return data;
}

export async function deleteIngredient(id: number): Promise<void> {
  await api.delete(`/ingredients/${id}`);
}

/** Todos los productos (también los no disponibles) con su receta. */
export async function fetchProductsWithRecipes(): Promise<ProductWithRecipe[]> {
  const { data } = await api.get<ProductWithRecipe[]>('/products');
  return data;
}

/** Reemplaza la receta completa del producto. */
export async function updateProductRecipe(productId: number, items: RecipeItemPayload[]): Promise<ProductWithRecipe> {
  const { data } = await api.put<ProductWithRecipe>(`/products/${productId}/recipe`, { items });
  return data;
}

export async function fetchIngredientConsumption(
  params: IngredientConsumptionParams = {}
): Promise<IngredientConsumptionReport> {
  const { data } = await api.get<IngredientConsumptionReport>('/stats/ingredient-consumption', {
    params: {
      date_from: params.dateFrom?.toISOString(),
      date_to: params.dateTo?.toISOString(),
      ingredient_id: params.ingredientId,
    },
  });
  return data;
}
