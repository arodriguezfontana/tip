import { DessertIcon, DrinkIcon, PizzaIcon, UtensilsIcon } from '@/components/Icons';

const SIZE_CLASSES = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
};

const ICON_SIZES = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
};

export function CategoryIcon({ category, size = 'md' }: { category: string; size?: keyof typeof SIZE_CLASSES }) {
  const cat = (category || '').toLowerCase();
  const iconClass = `${ICON_SIZES[size]} text-gray-700`;

  let icon = <UtensilsIcon className={iconClass} />;
  if (cat.includes('pizza')) {
    icon = <PizzaIcon className={iconClass} />;
  } else if (cat.includes('bebida')) {
    icon = <DrinkIcon className={iconClass} />;
  } else if (cat.includes('postre')) {
    icon = <DessertIcon className={iconClass} />;
  }

  return (
    <div
      data-testid="category-icon"
      aria-label={category || 'Categoría'}
      className={`bg-gray-100 rounded-xl flex items-center justify-center shrink-0 ${SIZE_CLASSES[size]}`}
    >
      {icon}
    </div>
  );
}
