/** Unidades sugeridas al cargar un ingrediente (se puede escribir cualquier otra). */
export const SUGGESTED_UNITS = ['gramos', 'kilogramos', 'mililitros', 'litros', 'unidades', 'hojas', 'porciones'];

const QUANTITY_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** "1.250,5 gramos" */
export function formatQuantity(quantity: number, unit: string): string {
  return `${QUANTITY_FORMAT.format(quantity)} ${unit}`;
}

/** Interpreta cantidades escritas con coma o punto decimal ("0,5" o "0.5"). */
export function parseQuantity(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
}
