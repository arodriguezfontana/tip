import { useEffect, useState } from 'react';
import type { Product } from '@/types/order';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import { useCart } from '@/hooks/useCart';
import { formatCurrency } from '@/utils/currency';
import { formatPizzaHalfName } from '@/utils/pizzaHalf';
import { INPUT_FULL_CLASS } from '@/styles/forms';

interface PizzaMitadYMitadModalProps {
  pizzas: Product[];
  onClose: () => void;
}

export function PizzaMitadYMitadModal({ pizzas, onClose }: PizzaMitadYMitadModalProps) {
  const { addItem } = useCart();

  const [sabor1Id, setSabor1Id] = useState<number>(pizzas[0]?.id ?? 0);
  const [sabor2Id, setSabor2Id] = useState<number>(pizzas[1]?.id ?? pizzas[0]?.id ?? 0);
  const [quantity, setQuantity] = useState(1);

  const pizza1 = pizzas.find((p) => p.id === sabor1Id) ?? pizzas[0];
  const pizza2 = pizzas.find((p) => p.id === sabor2Id) ?? pizzas[1] ?? pizzas[0];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!pizza1 || !pizza2) return null;

  const unitPrice = Math.max(pizza1.price, pizza2.price);
  const totalPrice = unitPrice * quantity;
  const unifiedName = formatPizzaHalfName(pizza1.name, pizza2.name);

  const handleAddToCart = () => {
    addItem(pizza1, quantity, pizza2, unifiedName);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mitad-mitad-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
          aria-label="Cerrar ventana"
        >
          ×
        </button>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl" aria-hidden="true">🍕</span>
          <div>
            <h2 id="mitad-mitad-title" className="text-xl font-bold text-gray-900">
              Armar pizza mitad y mitad
            </h2>
            <p className="text-xs text-gray-500">
              Elegí dos sabores para combinar en una misma pizza grande.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="sabor1-select" className="block text-sm font-medium text-gray-700 mb-1">
              Primera mitad (1/2)
            </label>
            <select
              id="sabor1-select"
              value={sabor1Id}
              onChange={(e) => setSabor1Id(Number(e.target.value))}
              className={INPUT_FULL_CLASS}
            >
              {pizzas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sabor2-select" className="block text-sm font-medium text-gray-700 mb-1">
              Segunda mitad (1/2)
            </label>
            <select
              id="sabor2-select"
              value={sabor2Id}
              onChange={(e) => setSabor2Id(Number(e.target.value))}
              className={INPUT_FULL_CLASS}
            >
              {pizzas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Resumen del ítem armado */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Pizza seleccionada
                </p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{unifiedName}</p>
              </div>
              <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                {formatCurrency(unitPrice)}
              </span>
            </div>
          </div>

          {/* Selector de cantidad y total */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-xs text-gray-500 block">Cantidad</span>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-semibold"
                  aria-label="Disminuir cantidad"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY_PER_ITEM, q + 1))}
                  disabled={quantity >= MAX_QUANTITY_PER_ITEM}
                  className="w-8 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-semibold"
                  aria-label="Aumentar cantidad"
                >
                  +
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-gray-500 block">Total</span>
              <span className="text-xl font-bold text-gray-900">{formatCurrency(totalPrice)}</span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleAddToCart}
              style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
              className="flex-1 text-white rounded-xl py-2.5 px-4 font-semibold hover:opacity-90 transition shadow-xs"
            >
              Agregar al carrito
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 transition font-medium text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
