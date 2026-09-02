import { useCart } from '@/hooks/useCart';
import { formatCurrency } from '@/utils/currency';

export function CartSummary() {
  const { items, updateQuantity, removeItem, total } = useCart();

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Tu carrito</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Tu carrito está vacío</p>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.product.id} className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(item.product.price)} c/u</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm"
                    aria-label={`Quitar una unidad de ${item.product.name}`}
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm"
                    aria-label={`Agregar una unidad de ${item.product.name}`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.product.id)}
                    className="w-6 h-6 rounded-lg text-gray-400 hover:text-red-600 transition text-sm"
                    aria-label={`Quitar ${item.product.name} del carrito`}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
