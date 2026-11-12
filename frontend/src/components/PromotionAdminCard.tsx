import { productImageSrc } from '@/utils/catalog';
import { formatCurrency } from '@/utils/currency';
import type { Promotion } from '@/types/promotion';

interface PromotionAdminCardProps {
  promo: Promotion;
  toggling: boolean;
  confirmingDelete: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

/** Una promoción en el panel: su imagen, precio y productos, con las acciones de editarla, pausarla o eliminarla. */
export function PromotionAdminCard({
  promo,
  toggling,
  confirmingDelete,
  onToggleActive,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: PromotionAdminCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between gap-4 shadow-2xs ${
        promo.is_active ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200/60 opacity-70 bg-gray-50/40'
      }`}
    >
      <div className="space-y-2">
        {promo.image_url && (
          <div className="w-full h-36 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 mb-2">
            <img
              src={productImageSrc(promo.image_url)}
              alt={promo.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-gray-900 text-base leading-snug">
            {promo.name}
          </h3>
          <button
            type="button"
            onClick={() => onToggleActive()}
            disabled={toggling}
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full transition ${
              promo.is_active
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
            title="Clic para cambiar estado"
          >
            {promo.is_active ? 'Activa' : 'Pausada'}
          </button>
        </div>

        {promo.description && (
          <p className="text-xs text-gray-500 line-clamp-2">
            {promo.description}
          </p>
        )}

        <div className="text-lg font-black text-gray-900 pt-1">
          {formatCurrency(promo.price)}
        </div>

        {/* Productos incluidos */}
        <div className="pt-2 border-t border-gray-100 space-y-1.5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Incluye:
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {promo.items.map((it) => (
              <li
                key={it.product_id}
                className="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-lg font-medium"
              >
                <span className="font-bold text-black">{it.quantity}x</span>{' '}
                {it.product_name}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Acciones */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        {confirmingDelete ? (
          <div className="flex items-center gap-1.5 text-xs w-full justify-end">
            <span className="text-red-600 font-semibold text-xs">¿Eliminar?</span>
            <button
              type="button"
              onClick={() => onDelete()}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-xs transition"
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => onCancelDelete()}
              className="px-2.5 py-1 text-gray-600 hover:bg-gray-100 rounded-lg text-xs transition"
            >
              No
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit()}
              className="text-xs font-semibold text-gray-700 hover:text-black hover:bg-gray-100 px-3 py-1.5 rounded-lg transition"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onAskDelete()}
              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition"
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
