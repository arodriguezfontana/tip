import { api } from './api';
import type { AdminProduct } from '@/types/catalog';
import type {
  Ingredient,
  IngredientConsumptionParams,
  IngredientConsumptionReport,
  IngredientPayload,
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

/** Reemplaza la receta completa del producto. */
export async function updateProductRecipe(productId: number, items: RecipeItemPayload[]): Promise<AdminProduct> {
  const { data } = await api.put<AdminProduct>(`/products/${productId}/recipe`, { items });
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
