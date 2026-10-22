import { useEffect, useState } from 'react';
import { useCart } from '@/hooks/useCart';
import { formatCurrency } from '@/utils/currency';

interface MobileCartBarProps {
  /** Id de la sección con el carrito y los datos del pedido, a la que lleva el botón. */
  targetId: string;
}

/**
 * Barra fija al pie en pantallas chicas (donde el carrito y los datos quedan al final de un menú largo):
 * muestra cuánto se lleva y deja ir al pedido con un toque. Se esconde cuando esa sección ya está a la vista.
 */
export function MobileCartBar({ targetId }: MobileCartBarProps) {
  const { items, total } = useCart();
  const [targetVisible, setTargetVisible] = useState(false);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setTargetVisible(entry.isIntersecting), {
      // La sección cuenta como "a la vista" cuando asoma bien dentro de la pantalla, no apenas el borde.
      threshold: 0.15,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (itemCount === 0 || targetVisible) return null;

  const goToOrder = () => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    // El foco acompaña al desplazamiento (teclado y lector de pantalla siguen desde ahí), sin abrir el teclado del celular.
    target.focus({ preventScroll: true });
  };

  return (
    <div
      role="region"
      aria-label="Resumen de tu pedido"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            {itemCount} {itemCount === 1 ? 'producto' : 'productos'}
          </p>
          <p className="text-base font-bold text-gray-900">{formatCurrency(total)}</p>
        </div>
        <button
          type="button"
          onClick={goToOrder}
          style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
          className="shrink-0 text-white rounded-xl px-5 py-3 font-semibold text-sm hover:opacity-90 transition shadow-xs"
        >
          Ver pedido y datos
        </button>
      </div>
    </div>
  );
}
