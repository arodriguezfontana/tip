import type { ReactNode } from 'react';
import type { CartItem, IngredientExtra, OrderItemModification } from '@/types/order';
import { customizationOptionsOf, hasExclusion, hasExtra, withExclusion, withExtra } from '@/utils/cart';
import { formatCurrency } from '@/utils/currency';

interface OptionCheckboxProps {
  checked: boolean;
  accentClass: string;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

function OptionCheckbox({ checked, accentClass, onChange, children }: OptionCheckboxProps) {
  return (
    <label className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer select-none hover:bg-gray-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className={`w-3.5 h-3.5 rounded ${accentClass}`}
      />
      {children}
    </label>
  );
}

interface ChangeModifications {
  onChange: (modifications: OrderItemModification[]) => void;
}

function ExclusionOptions({
  ingredients,
  modifications,
  onChange,
}: ChangeModifications & { ingredients: string[]; modifications?: OrderItemModification[] }) {
  return (
    <div>
      <p className="font-semibold text-gray-700 mb-1">Restricciones (quitar ingrediente):</p>
      <div className="flex flex-wrap gap-1.5">
        {ingredients.map((ingredient) => {
          const excluded = hasExclusion(modifications, ingredient);
          return (
            <OptionCheckbox
              key={ingredient}
              checked={excluded}
              accentClass="accent-red-600"
              onChange={(checked) => onChange(withExclusion(modifications, ingredient, checked))}
            >
              <span className={excluded ? 'font-bold text-rose-700' : 'text-gray-700'}>Sin {ingredient}</span>
            </OptionCheckbox>
          );
        })}
      </div>
    </div>
  );
}

function ExtraOptions({
  extras,
  modifications,
  onChange,
}: ChangeModifications & { extras: IngredientExtra[]; modifications?: OrderItemModification[] }) {
  return (
    <div>
      <p className="font-semibold text-gray-700 mb-1">Adicionales disponibles:</p>
      <div className="flex flex-wrap gap-1.5">
        {extras.map((extra) => {
          const added = hasExtra(modifications, extra);
          return (
            <OptionCheckbox
              key={extra.id}
              checked={added}
              accentClass="accent-emerald-600"
              onChange={(checked) => onChange(withExtra(modifications, extra, checked))}
            >
              <span className={added ? 'font-bold text-emerald-700' : 'text-gray-700'}>
                + {extra.name}{' '}
                <span className="text-gray-500 font-normal">(+{formatCurrency(extra.extra_price)})</span>
              </span>
            </OptionCheckbox>
          );
        })}
      </div>
    </div>
  );
}

interface CustomizationPanelProps extends ChangeModifications {
  item: CartItem;
  onSplit: () => void;
}

/** Ingredientes que se pueden quitar y adicionales que se pueden sumar a una línea del carrito. */
export function CustomizationPanel({ item, onChange, onSplit }: CustomizationPanelProps) {
  const { recipeIngredients, allowedExtras } = customizationOptionsOf(item);
  return (
    <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
      {recipeIngredients.length > 0 && (
        <ExclusionOptions ingredients={recipeIngredients} modifications={item.modifications} onChange={onChange} />
      )}
      {allowedExtras.length > 0 && (
        <ExtraOptions extras={allowedExtras} modifications={item.modifications} onChange={onChange} />
      )}
      {item.quantity > 1 && (
        <div className="pt-1.5 border-t border-gray-200">
          <button
            type="button"
            onClick={onSplit}
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
          >
            ➦ Dividir unidad para personalizar por separado
          </button>
        </div>
      )}
    </div>
  );
}
