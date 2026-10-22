const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

export function formatCurrency(amount: number): string {
  return formatter.format(amount);
}
