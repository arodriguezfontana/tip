import { CustomizationPanel } from '@/components/cart/CustomizationPanel';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, OrderItemModification } from '@/types/order';
import { customizationOptionsOf } from '@/utils/cart';
import { formatCurrency } from '@/utils/currency';
import { cleanModTag } from '@/utils/modifications';

function displayNameOf(item: CartItem): string {
  return item.custom_name ?? (item.promotion ? item.promotion.name : (item.product?.name ?? ''));
}

function unitPriceOf(item: CartItem): number {
  return item.unit_price ?? (item.promotion ? item.promotion.price : (item.product?.price ?? 0));
}

function ModificationTags({ modifications }: { modifications: OrderItemModification[] }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
      {modifications.map((mod, index) => (
        <span
          key={index}
          className={`font-semibold text-[10px] px-1.5 py-0.2 rounded ${
            mod.type === 'negative' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {cleanModTag(mod)}
        </span>
      ))}
    </div>
  );
}

interface QuantityControlsProps {
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
  onRemove: () => void;
}

function QuantityControls({ name, quantity, onChange, onRemove }: QuantityControlsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm"
        aria-label={`Quitar una unidad de ${name}`}
      >
        −
      </button>
      <span className="w-5 text-center text-sm font-medium">{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY_PER_ITEM}
        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`Agregar una unidad de ${name}`}
      >
        +
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 transition text-sm"
        aria-label={`Quitar ${name} del carrito`}
      >
        ×
      </button>
    </div>
  );
}

interface CartLineProps {
  item: CartItem;
  customizationOpen: boolean;
  onToggleCustomization: () => void;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onModificationsChange: (modifications: OrderItemModification[]) => void;
  onSplit: () => void;
}

/** Una línea del carrito: nombre, precio, cantidad y, si el producto lo admite, sus adicionales. */
export function CartLine({
  item,
  customizationOpen,
  onToggleCustomization,
  onQuantityChange,
  onRemove,
  onModificationsChange,
  onSplit,
}: CartLineProps) {
  const isPromo = Boolean(item.promotion);
  const name = displayNameOf(item);
  const { recipeIngredients, allowedExtras } = customizationOptionsOf(item);
  const isCustomizable = recipeIngredients.length > 0 || allowedExtras.length > 0;

  return (
    <li className="pt-2 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isPromo && (
              <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                Promo
              </span>
            )}
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          </div>
          <p className="text-xs text-gray-500">{formatCurrency(unitPriceOf(item))} c/u</p>
          {item.modifications && item.modifications.length > 0 && <ModificationTags modifications={item.modifications} />}
        </div>
        <QuantityControls name={name} quantity={item.quantity} onChange={onQuantityChange} onRemove={onRemove} />
      </div>

      {isCustomizable && (
        <div className="mt-1">
          <button
            type="button"
            onClick={onToggleCustomization}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
            aria-expanded={customizationOpen}
          >
            <span>Adicionales</span>
            <span aria-hidden="true" className="text-[10px]">{customizationOpen ? '▲' : '▼'}</span>
          </button>
          {customizationOpen && <CustomizationPanel item={item} onChange={onModificationsChange} onSplit={onSplit} />}
        </div>
      )}
    </li>
  );
}
