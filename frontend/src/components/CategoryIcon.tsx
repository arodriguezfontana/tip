const ICONS: Record<string, string> = {
  Pizzas: '🍕',
  Bebidas: '🥤',
  Postres: '🍮',
};

export function CategoryIcon({ category }: { category: string }) {
  return (
    <div className="bg-gray-100 rounded-xl w-16 h-16 flex items-center justify-center text-4xl shrink-0">
      {ICONS[category] ?? '🍽️'}
    </div>
  );
}
