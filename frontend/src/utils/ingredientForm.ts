import type { IngredientPayload } from '@/types/ingredient';

export const EMPTY_INGREDIENT: IngredientPayload = { name: '', unit: '', cost: 0, extra_price: 0 };

const isInvalidAmount = (amount: number | undefined) => amount !== undefined && (isNaN(amount) || amount < 0);

/** El primer problema de los datos del ingrediente, o null si están bien. */
export function validateIngredient(payload: IngredientPayload): string | null {
  if (!payload.name.trim()) return 'Ingresá el nombre del ingrediente.';
  if (!payload.unit.trim()) return 'Ingresá la unidad de medida (ej. gramos o unidades).';
  if (isInvalidAmount(payload.cost)) return 'El costo unitario debe ser mayor o igual a cero.';
  if (isInvalidAmount(payload.extra_price)) return 'El precio extra debe ser mayor o igual a cero.';
  return null;
}

/** Los datos listos para guardar: sin espacios sobrantes y sin costos ni precios en cero. */
export function toIngredientRequest(payload: IngredientPayload): IngredientPayload {
  const hasValue = (amount: number | undefined) => amount !== undefined && !isNaN(amount) && amount > 0;
  return {
    name: payload.name.trim(),
    unit: payload.unit.trim(),
    ...(hasValue(payload.cost) ? { cost: Number(payload.cost) } : {}),
    ...(hasValue(payload.extra_price) ? { extra_price: Number(payload.extra_price) } : {}),
  };
}
