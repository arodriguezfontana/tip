interface CancelOrderControlProps {
  confirming: boolean;
  cancelling: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** "Cancelar pedido" con una confirmación en el lugar, para no cancelar por error. */
export function CancelOrderControl({ confirming, cancelling, onAsk, onConfirm, onDismiss }: CancelOrderControlProps) {
  if (!confirming) {
    return (
      <button
        type="button"
        onClick={onAsk}
        className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
      >
        Cancelar pedido
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-semibold text-red-700">¿Cancelar el pedido?</span>
      <button
        type="button"
        disabled={cancelling}
        onClick={onConfirm}
        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold transition"
      >
        Sí, cancelar
      </button>
      <button
        type="button"
        disabled={cancelling}
        onClick={onDismiss}
        className="px-3 py-1.5 rounded-lg font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
      >
        No
      </button>
    </div>
  );
}
