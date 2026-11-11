import { useCallback, useState } from 'react';
import { reprintOrder } from '@/services/orderService';
import type { AdminOrder } from '@/types/order';
import { getErrorMessage } from '@/utils/errors';

export interface ReprintFeedback {
  type: 'success' | 'error';
  message: string;
}

/** Reimpresión manual de la comanda de un pedido, con el aviso del resultado para mostrar en pantalla. */
export function useReprint() {
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ReprintFeedback | null>(null);

  const reprint = useCallback(async (order: Pick<AdminOrder, 'id' | 'shift_number'>) => {
    const orderId = order.shift_number;
    setPrintingId(order.id);
    setFeedback(null);
    try {
      const result = await reprintOrder(order.id);
      setFeedback(
        result.success
          ? { type: 'success', message: `Comanda del pedido #${orderId} enviada a imprimir.` }
          : {
              type: 'error',
              message: `No se pudo imprimir la comanda del pedido #${orderId}. ${result.message ?? ''}`.trim(),
            }
      );
    } catch (err) {
      setFeedback({
        type: 'error',
        message: getErrorMessage(err, `No se pudo imprimir la comanda del pedido #${orderId}.`),
      });
    } finally {
      setPrintingId(null);
    }
  }, []);

  const clear = useCallback(() => setFeedback(null), []);

  return { reprint, printingId, feedback, clear };
}
