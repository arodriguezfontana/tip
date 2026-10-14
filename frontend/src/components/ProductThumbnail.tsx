import { CategoryIcon } from '@/components/CategoryIcon';
import { productImageSrc } from '@/utils/catalog';

const SIZE_CLASSES = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
};

interface ProductThumbnailProps {
  product: { name: string; image_url: string | null; category: { name: string } | null };
  size?: keyof typeof SIZE_CLASSES;
}

/** La imagen del producto, o el ícono de su categoría si no tiene. */
export function ProductThumbnail({ product, size = 'md' }: ProductThumbnailProps) {
  if (!product.image_url) {
    return <CategoryIcon category={product.category?.name ?? ''} size={size} />;
  }
  return (
    <img
      src={productImageSrc(product.image_url)}
      alt={product.name}
      loading="lazy"
      className={`${SIZE_CLASSES[size]} rounded-xl object-cover bg-gray-100 shrink-0`}
    />
  );
}
