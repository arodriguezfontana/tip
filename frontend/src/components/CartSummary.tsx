import { useState } from 'react';
import { CartLine } from '@/components/cart/CartLine';
import { useCart } from '@/hooks/useCart';
import { lineKeyOf } from '@/utils/cart';
import { formatCurrency } from '@/utils/currency';

export function CartSummary() {
  const { items, updateQuantity, removeItem, updateItemModifications, splitItem, total } = useCart();
  const [openCustomizationKey, setOpenCustomizationKey] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Tu carrito</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Tu carrito está vacío</p>
      ) : (
        <>
          <ul className="space-y-3.5 divide-y divide-gray-100">
            {items.map((item) => {
              const lineKey = lineKeyOf(item);
              const isPromo = Boolean(item.promotion);
              return (
                <CartLine
                  key={lineKey}
                  item={item}
                  customizationOpen={openCustomizationKey === lineKey}
                  onToggleCustomization={() => setOpenCustomizationKey(openCustomizationKey === lineKey ? null : lineKey)}
                  onQuantityChange={(quantity) => updateQuantity(lineKey, quantity, item.secondary_product?.id, isPromo)}
                  onRemove={() => removeItem(lineKey, item.secondary_product?.id, isPromo)}
                  onModificationsChange={(modifications) => updateItemModifications(lineKey, modifications)}
                  onSplit={() => splitItem?.(lineKey)}
                />
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
