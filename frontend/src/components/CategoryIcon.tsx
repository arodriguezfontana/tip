const ICONS: Record<string, string> = {
  Pizzas: '🍕',
  Bebidas: '🥤',
  Postres: '🍮',
};

const SIZE_CLASSES = {
  sm: 'w-10 h-10 text-2xl',
  md: 'w-16 h-16 text-4xl',
};

export function CategoryIcon({ category, size = 'md' }: { category: string; size?: keyof typeof SIZE_CLASSES }) {
  return (
    <div className={`bg-gray-100 rounded-xl flex items-center justify-center shrink-0 ${SIZE_CLASSES[size]}`}>
      {ICONS[category] ?? '🍽️'}
    </div>
  );
}
