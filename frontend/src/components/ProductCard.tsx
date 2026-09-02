import type { Product } from '@/types/order';
import { useCart } from '@/hooks/useCart';
import { CategoryIcon } from '@/components/CategoryIcon';
import { formatCurrency } from '@/utils/currency';

export function ProductCard({ product }: { product: Product }) {
  const { items, addItem, updateQuantity } = useCart();
  const cartItem = items.find((item) => item.product.id === product.id);

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 flex gap-4">
      <CategoryIcon category={product.category.name} />
      <div className="flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-900">{product.name}</h3>
        <p className="text-sm text-gray-500 flex-1">{product.description}</p>

        {product.dietary_restrictions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {product.dietary_restrictions.map((restriction) => (
              <span
                key={restriction}
                className="rounded-full bg-gray-100 text-gray-600 text-xs px-2 py-0.5"
              >
                {restriction}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <span className="font-semibold text-gray-900">{formatCurrency(product.price)}</span>

          {cartItem ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateQuantity(product.id, cartItem.quantity - 1)}
                className="w-7 h-7 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                aria-label={`Quitar una unidad de ${product.name}`}
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-medium">{cartItem.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(product.id, cartItem.quantity + 1)}
                className="w-7 h-7 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                aria-label={`Agregar una unidad de ${product.name}`}
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => addItem(product)}
              className="bg-black text-white rounded-xl px-4 py-1.5 text-sm font-semibold hover:bg-gray-800 transition"
            >
              Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
