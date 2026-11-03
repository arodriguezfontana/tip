import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { Promotion } from '@/types/promotion';
import { useCart } from '@/hooks/useCart';
import { productImageSrc } from '@/utils/catalog';
import { formatCurrency } from '@/utils/currency';

export function PromotionCard({ promotion }: { promotion: Promotion }) {
  const { items, addPromotion, updateQuantity } = useCart();
  const cartItem = items.find((item) => item.promotion?.id === promotion.id);

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5 flex flex-col justify-between border-2 border-amber-200/80 bg-gradient-to-b from-amber-50/30 to-white relative overflow-hidden">
      <div className="space-y-3">
        {promotion.image_url && (
          <div className="w-full h-44 rounded-xl overflow-hidden bg-gray-100 border border-amber-100/80">
            <img
              src={productImageSrc(promotion.image_url)}
              alt={`Foto de ${promotion.name}`}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="space-y-2">
          <h3 className="font-bold text-gray-900 text-base sm:text-lg leading-snug">
            {promotion.name}
          </h3>

          {promotion.description && (
            <p className="text-xs text-gray-600 leading-relaxed">
              {promotion.description}
            </p>
          )}

          <div className="pt-2">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Incluye:
            </span>
            <ul className="flex flex-wrap gap-1.5">
              {promotion.items.map((it) => (
                <li
                  key={it.product_id}
                  className="bg-white border border-amber-200/60 text-gray-800 text-xs px-2.5 py-1 rounded-lg font-medium shadow-2xs"
                >
                  <span className="font-bold text-amber-700">{it.quantity}x</span>{' '}
                  {it.product_name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-amber-100">
        <span className="text-lg font-black text-gray-900">
          {formatCurrency(promotion.price)}
        </span>

        {cartItem ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateQuantity(promotion.id, cartItem.quantity - 1, undefined, true)}
              className="w-7 h-7 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
              aria-label={`Quitar una unidad de ${promotion.name}`}
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-medium">{cartItem.quantity}</span>
            <button
              type="button"
              onClick={() => updateQuantity(promotion.id, cartItem.quantity + 1, undefined, true)}
              disabled={cartItem.quantity >= MAX_QUANTITY_PER_ITEM}
              className="w-7 h-7 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Agregar una unidad de ${promotion.name}`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => addPromotion(promotion)}
            style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
            className="text-white rounded-xl px-4 py-1.5 text-sm font-semibold hover:opacity-90 transition shadow-xs"
          >
            Agregar
          </button>
        )}
      </div>
    </div>
  );
}
