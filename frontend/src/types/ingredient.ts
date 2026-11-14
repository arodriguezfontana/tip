export interface Ingredient {
  id: number;
  name: string;
  /** Unidad en la que se expresan todas sus cantidades (ej. "gramos"). */
  unit: string;
  /** Costo unitario aproximado del insumo. */
  cost?: number;
  /** Precio adicional opcional cuando se agrega como extra a un producto. */
  extra_price?: number;
  /** Cantidad de productos en cuya receta figura. */
  products_count: number;
}

export interface IngredientPayload {
  name: string;
  unit: string;
  cost?: number;
  extra_price?: number;
}

export interface RecipeItem {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  /** Por unidad de producto, en la unidad del ingrediente. */
  quantity: number;
}

export interface RecipeItemPayload {
  ingredient_id: number;
  quantity: number;
}

export interface IngredientConsumption {
  ingredient_id: number;
  ingredient_name: string;
  unit: string;
  total_quantity: number;
  unit_cost?: number;
  total_cost?: number;
}

export interface IngredientConsumptionReport {
  completed_orders: number;
  items: IngredientConsumption[];
  /** Productos vendidos en el período sin receta cargada: su consumo no figura en el reporte. */
  products_without_recipe: string[];
}

export interface IngredientConsumptionParams {
  dateFrom?: Date;
  dateTo?: Date;
  ingredientId?: number;
}
