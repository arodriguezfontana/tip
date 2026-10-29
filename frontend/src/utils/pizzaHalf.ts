export function cleanPizzaFlavor(name: string): string {
  let cleaned = name.replace(/^(?:pizza(?:s)?\s+)?(?:de\s+)?/i, '').trim();
  cleaned = cleaned.replace(/\s+(?:grande|chica|individual)$/i, '').trim();
  if (!cleaned) return name;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function formatPizzaHalfName(p1Name: string, p2Name: string, sizeHint = ''): string {
  const sabor1 = cleanPizzaFlavor(p1Name);
  const sabor2 = cleanPizzaFlavor(p2Name);
  const hint = (sizeHint || '').toLowerCase();
  const p1Lower = p1Name.toLowerCase();
  const p2Lower = p2Name.toLowerCase();
  let base = 'Pizza Grande';
  if (hint.includes('chica') || p1Lower.includes('chica') || p2Lower.includes('chica')) {
    base = 'Pizza Chica';
  }
  return `${base} [1/2 ${sabor1} | 1/2 ${sabor2}]`;
}

