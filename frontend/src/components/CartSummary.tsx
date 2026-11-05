import { useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { IngredientExtra, OrderItemModification } from '@/types/order';
import { formatCurrency } from '@/utils/currency';

function cleanModTag(m: { type: string; name: string; tag?: string }): string {
  const label = m.tag || (m.type === 'negative' ? `SIN ${m.name.toUpperCase()}` : `EXTRA ${m.name.toUpperCase()}`);
  return label.replaceAll('[', '').replaceAll(']', '').trim();
}

export function CartSummary() {
  const { items, updateQuantity, removeItem, updateItemModifications, splitItem, total } = useCart();
  const [openCustomizationId, setOpenCustomizationId] = useState<string | null>(null);

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Tu carrito</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Tu carrito está vacío</p>
      ) : (
        <>
          <ul className="space-y-3.5 divide-y divide-gray-100">
            {items.map((item) => {
              const isPromo = Boolean(item.promotion);
              const displayName =
                item.custom_name ?? (item.promotion ? item.promotion.name : item.product?.name ?? '');
              const unitPrice =
                item.unit_price ?? (item.promotion ? item.promotion.price : item.product?.price ?? 0);
              const itemKey = item.id || (item.promotion
                ? `promo-${item.promotion.id}`
                : item.secondary_product
                ? `${item.product?.id}-${item.secondary_product.id}`
                : `${item.product?.id}`);

              // Recolectar ingredientes de receta y adicionales permitidos (incluyendo mitad y mitad)
              const recipeIngredients: string[] = [];
              const allowedExtras: IngredientExtra[] = [];

              if (!isPromo) {
                const addRecipe = (ings?: string[]) => {
                  (ings || []).forEach((name) => {
                    if (!recipeIngredients.includes(name)) recipeIngredients.push(name);
                  });
                };
                const addExtras = (extras?: IngredientExtra[]) => {
                  (extras || []).forEach((e) => {
                    if (!allowedExtras.some((x) => x.id === e.id)) allowedExtras.push(e);
                  });
                };

                addRecipe(item.product?.recipe_ingredients);
                addExtras(item.product?.allowed_extras);

                if (item.secondary_product) {
                  addRecipe(item.secondary_product.recipe_ingredients);
                  addExtras(item.secondary_product.allowed_extras);
                }
              }

              const hasCustomization = !isPromo && (recipeIngredients.length > 0 || allowedExtras.length > 0);
              const isCustomizingOpen = openCustomizationId === itemKey;

              return (
                <li key={itemKey} className="pt-2 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
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
                      {item.modifications && item.modifications.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                          {item.modifications.map((m, idx) => (
                            <span
                              key={idx}
                              className={`font-semibold text-[10px] px-1.5 py-0.2 rounded ${
                                m.type === 'negative'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {cleanModTag(m)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQuantity(itemKey, item.quantity - 1, item.secondary_product?.id, isPromo)}
                        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm"
                        aria-label={`Quitar una unidad de ${displayName}`}
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(itemKey, item.quantity + 1, item.secondary_product?.id, isPromo)}
                        disabled={item.quantity >= MAX_QUANTITY_PER_ITEM}
                        className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Agregar una unidad de ${displayName}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(itemKey, item.secondary_product?.id, isPromo)}
                        className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 transition text-sm"
                        aria-label={`Quitar ${displayName} del carrito`}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {hasCustomization && (
                    <div className="mt-1">
                      <button
                        type="button"
                        onClick={() => setOpenCustomizationId(isCustomizingOpen ? null : itemKey)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                        aria-expanded={isCustomizingOpen}
                      >
                        <span>Adicionales</span>
                        <span aria-hidden="true" className="text-[10px]">{isCustomizingOpen ? '▲' : '▼'}</span>
                      </button>

                      {isCustomizingOpen && (
                        <div className="mt-2 p-2.5 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                          {recipeIngredients.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-1">Restricciones (quitar ingrediente):</p>
                              <div className="flex flex-wrap gap-1.5">
                                {recipeIngredients.map((ing) => {
                                  const isExcluded = item.modifications?.some(
                                    (m) => m.type === 'negative' && m.name.toLowerCase() === ing.toLowerCase()
                                  );
                                  return (
                                    <label
                                      key={ing}
                                      className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer select-none hover:bg-gray-100"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={Boolean(isExcluded)}
                                        onChange={(e) => {
                                          const currentMods = item.modifications || [];
                                          let newMods: OrderItemModification[];
                                          if (e.target.checked) {
                                            newMods = [
                                              ...currentMods,
                                              {
                                                type: 'negative',
                                                action: 'remove',
                                                name: ing.toLowerCase(),
                                                tag: `SIN ${ing.toUpperCase()}`,
                                                price: 0,
                                              },
                                            ];
                                          } else {
                                            newMods = currentMods.filter(
                                              (m) => !(m.type === 'negative' && m.name.toLowerCase() === ing.toLowerCase())
                                            );
                                          }
                                          updateItemModifications(itemKey, newMods);
                                        }}
                                        className="w-3.5 h-3.5 accent-red-600 rounded"
                                      />
                                      <span className={isExcluded ? 'font-bold text-rose-700' : 'text-gray-700'}>
                                        Sin {ing}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {allowedExtras.length > 0 && (
                            <div>
                              <p className="font-semibold text-gray-700 mb-1">Adicionales disponibles:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {allowedExtras.map((extra) => {
                                  const isAdded = item.modifications?.some(
                                    (m) =>
                                      (m.type === 'positive' || m.action === 'add') &&
                                      (m.ingredient_id === extra.id || m.name.toLowerCase() === extra.name.toLowerCase())
                                  );
                                  return (
                                    <label
                                      key={extra.id}
                                      className="flex items-center gap-1.5 bg-white border border-gray-200 px-2 py-1 rounded-lg cursor-pointer select-none hover:bg-gray-100"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={Boolean(isAdded)}
                                        onChange={(e) => {
                                          const currentMods = item.modifications || [];
                                          let newMods: OrderItemModification[];
                                          if (e.target.checked) {
                                            newMods = [
                                              ...currentMods,
                                              {
                                                type: 'positive',
                                                action: 'add',
                                                name: extra.name.toLowerCase(),
                                                tag: `EXTRA ${extra.name.toUpperCase()}`,
                                                price: extra.extra_price,
                                                ingredient_id: extra.id,
                                              },
                                            ];
                                          } else {
                                            newMods = currentMods.filter(
                                              (m) =>
                                                !(
                                                  (m.type === 'positive' || m.action === 'add') &&
                                                  (m.ingredient_id === extra.id ||
                                                    m.name.toLowerCase() === extra.name.toLowerCase())
                                                )
                                            );
                                          }
                                          updateItemModifications(itemKey, newMods);
                                        }}
                                        className="w-3.5 h-3.5 accent-emerald-600 rounded"
                                      />
                                      <span className={isAdded ? 'font-bold text-emerald-700' : 'text-gray-700'}>
                                        + {extra.name}{' '}
                                        <span className="text-gray-500 font-normal">
                                          (+{formatCurrency(extra.extra_price)})
                                        </span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {item.quantity > 1 && (
                            <div className="pt-1.5 border-t border-gray-200">
                              <button
                                type="button"
                                onClick={() => splitItem?.(itemKey)}
                                className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                              >
                                ➦ Dividir unidad para personalizar por separado
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
