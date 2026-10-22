import { useEffect, useState } from 'react';
import { OrderSuccess } from '@/components/OrderSuccess';
import { confirmMercadoPagoPayment } from '@/services/mercadopagoService';
import type { PendingPaymentOrder } from '@/utils/pendingPayment';

type PaymentOutcome = 'checking' | 'approved' | 'pending' | 'failed';

/** Estado del pago según MercadoPago, agrupado en lo que le importa al cliente. */
function outcomeFor(status: string | null): Exclude<PaymentOutcome, 'checking'> {
  if (status === 'approved') return 'approved';
  if (status === 'pending' || status === 'in_process' || status === 'authorized') return 'pending';
  return 'failed';
}

const BANNER_STYLES: Record<PaymentOutcome, string> = {
  checking: 'bg-gray-50 text-gray-700',
  approved: 'bg-green-50 text-green-800',
  pending: 'bg-amber-50 text-amber-800',
  failed: 'bg-red-50 text-red-800',
};

const BANNER_ICON: Record<PaymentOutcome, string> = { checking: '…', approved: '✓', pending: '⏳', failed: '!' };

interface PaymentReturnProps {
  orderId: string;
  /** Lo que MercadoPago agrega a la URL de vuelta. "null" si el cliente volvió sin pagar. */
  paymentId: string | null;
  status: string | null;
  /** Datos del pedido guardados antes de ir a pagar (si siguen disponibles en esta pestaña). */
  saved: PendingPaymentOrder | null;
  onNewOrder: () => void;
}

/**
 * Página de confirmación a la que vuelve el cliente después de pagar en MercadoPago. El pago se verifica con
 * el backend (que lo consulta a MercadoPago): el estado que viene en la URL solo se usa si no se pudo verificar.
 */
export function PaymentReturn({ orderId, paymentId, status, saved, onNewOrder }: PaymentReturnProps) {
  const hasPayment = Boolean(paymentId && paymentId !== 'null');
  const [outcome, setOutcome] = useState<PaymentOutcome>(hasPayment ? 'checking' : outcomeFor(status));

  useEffect(() => {
    if (!paymentId || paymentId === 'null') return;
    let cancelled = false;
    confirmMercadoPagoPayment(paymentId)
      .then((verified) => !cancelled && setOutcome(outcomeFor(verified ?? status)))
      .catch(() => !cancelled && setOutcome(outcomeFor(status)));
    return () => {
      cancelled = true;
    };
  }, [paymentId, status]);

  const paymentUrl = saved?.order.payment_url ?? null;
  const title = {
    checking: 'Estamos verificando tu pago...',
    approved: '¡Recibimos tu pago!',
    pending: 'Tu pago está pendiente de acreditación',
    failed: 'No se completó el pago',
  }[outcome];
  const message = {
    checking: `Un momento, estamos confirmando con MercadoPago el pago del pedido #${orderId}.`,
    approved: `Tu pedido #${orderId} quedó abonado y ya lo estamos preparando. ¡Muchas gracias!`,
    pending: `Registramos tu pedido #${orderId}. Lo vamos a ver como abonado apenas MercadoPago acredite el pago.`,
    failed: `Tu pedido #${orderId} quedó registrado como pendiente de pago. Podés intentar pagar de nuevo o comunicarte con el local para coordinar cómo abonarlo.`,
  }[outcome];

  const banner = (
    <div role="status" aria-live="polite" className={`rounded-xl px-4 py-3 text-sm mb-6 flex items-start gap-3 ${BANNER_STYLES[outcome]}`}>
      <span aria-hidden="true" className="text-lg leading-none mt-0.5">
        {BANNER_ICON[outcome]}
      </span>
      <div>
        <p className="font-bold">{title}</p>
        <p className="mt-0.5">{message}</p>
        {outcome === 'failed' && paymentUrl && (
          <a href={paymentUrl} className="inline-block mt-2 font-semibold underline hover:no-underline">
            Pagar de nuevo con MercadoPago
          </a>
        )}
      </div>
    </div>
  );

  if (saved) {
    return <OrderSuccess order={saved.order} form={saved.form} onNewOrder={onNewOrder} banner={banner} />;
  }

  // Sin los datos guardados (por ejemplo, si volvió en otra pestaña o navegador) se confirma solo el estado.
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg mx-auto">
      {banner}
      <h2 className="text-xl font-bold text-gray-900 mb-1">Pedido #{orderId}</h2>
      <button
        type="button"
        onClick={onNewOrder}
        className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition mt-6"
      >
        Realizar otro pedido
      </button>
    </div>
  );
}
