import { useCart } from '@/hooks/useCart';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import { formatCurrency } from '@/utils/currency';

export function CartSummary() {
  const { items, updateQuantity, removeItem, total } = useCart();

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Tu carrito</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Tu carrito está vacío</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {items.map((item) => {
              const isPromo = Boolean(item.promotion);
              const itemId = item.promotion ? item.promotion.id : (item.product?.id ?? 0);
              const displayName =
                item.custom_name ?? (item.promotion ? item.promotion.name : item.product?.name ?? '');
              const unitPrice =
                item.unit_price ?? (item.promotion ? item.promotion.price : item.product?.price ?? 0);
              const itemKey = item.promotion
                ? `promo-${item.promotion.id}`
                : item.secondary_product
                ? `${item.product?.id}-${item.secondary_product.id}`
                : `${item.product?.id}`;

              return (
                <li key={itemKey} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isPromo && (
                        <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          Promo
                        </span>
                      )}
                      <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                    </div>
                    <p className="text-xs text-gray-500">{formatCurrency(unitPrice)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQuantity(itemId, item.quantity - 1, item.secondary_product?.id, isPromo)}
                      className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm"
                      aria-label={`Quitar una unidad de ${displayName}`}
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(itemId, item.quantity + 1, item.secondary_product?.id, isPromo)}
                      disabled={item.quantity >= MAX_QUANTITY_PER_ITEM}
                      className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Agregar una unidad de ${displayName}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(itemId, item.secondary_product?.id, isPromo)}
                      className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 transition text-sm"
                      aria-label={`Quitar ${displayName} del carrito`}
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
        </>
      )}
    </div>
  );
}
