import { useCallback, useState } from 'react';
import { reprintOrder } from '@/services/orderService';
import { getErrorMessage } from '@/utils/errors';

export interface ReprintFeedback {
  type: 'success' | 'error';
  message: string;
}

/** Reimpresión manual de la comanda de un pedido, con el aviso del resultado para mostrar en pantalla. */
export function useReprint() {
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ReprintFeedback | null>(null);

  const reprint = useCallback(async (orderId: number) => {
    setPrintingId(orderId);
    setFeedback(null);
    try {
      const result = await reprintOrder(orderId);
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
