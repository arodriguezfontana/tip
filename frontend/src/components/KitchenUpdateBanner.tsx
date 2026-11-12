import { useState } from 'react';
import type { MouseEvent } from 'react';
import { BellIcon } from '@/components/Icons';

/** Evita que los clics en los controles de la tarjeta abran el detalle del pedido. */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

interface KitchenUpdateBannerProps {
  onAcknowledge?: () => Promise<void>;
}

/** Aviso a cocina de que el cliente agregó productos al pedido, con el botón para marcarlo como visto. */
export function KitchenUpdateBanner({ onAcknowledge }: KitchenUpdateBannerProps) {
  const [acknowledging, setAcknowledging] = useState(false);
  return (
    <div
      role="alert"
      onClick={stopPropagation}
      className="cursor-default flex items-center justify-between gap-2 rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900 animate-pulse"
    >
      <span className="inline-flex items-center gap-1.5">
        <BellIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
        Pedido actualizado: el cliente agregó productos
      </span>
      {onAcknowledge && (
        <button
          type="button"
          disabled={acknowledging}
          onClick={async () => {
            setAcknowledging(true);
            try {
              await onAcknowledge();
            } finally {
              setAcknowledging(false);
            }
          }}
          className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-2.5 py-1 transition"
        >
          Visto
        </button>
      )}
    </div>
  );
}
