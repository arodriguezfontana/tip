import { useState } from 'react';
import { PaymentMethodIcon } from '@/components/Icons';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import type { AdminOrder } from '@/types/order';
import { formatCurrency } from '@/utils/currency';

interface PaymentBadgesProps {
  order: AdminOrder;
  /** Ya se cobró una parte y el resto (la diferencia) se cobra aparte, ej. en efectivo al repartidor. */
  hasPartialPayment: boolean;
  onMarkPaid?: () => Promise<void>;
}

/** Medio de pago y si ya está abonado; si está pendiente, un clic lo marca como abonado. */
export function PaymentBadges({ order, hasPartialPayment, onMarkPaid }: PaymentBadgesProps) {
  const [markingPaid, setMarkingPaid] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {hasPartialPayment && (
        <>
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-xl font-semibold whitespace-nowrap">
            Pagado {order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method] : ''}: {formatCurrency(order.paid_amount ?? 0)}
          </span>
          <span className="bg-sky-100 text-sky-800 border border-sky-300 px-2 py-1 rounded-xl font-semibold whitespace-nowrap">
            Cobrar {order.balance_payment_method ? PAYMENT_METHOD_LABEL[order.balance_payment_method] : 'diferencia'}:{' '}
            {formatCurrency(order.pending_amount ?? 0)}
          </span>
        </>
      )}
      <span className={`bg-gray-50 border border-gray-200 text-gray-700 px-2 py-1 rounded-xl font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${hasPartialPayment ? 'hidden' : ''}`}>
        {order.payment_method ? (
          <>
            <PaymentMethodIcon method={order.payment_method} className="w-3.5 h-3.5 shrink-0 @max-[205px]:hidden" />
            {PAYMENT_METHOD_LABEL[order.payment_method]}
          </>
        ) : (
          'Medio de pago sin definir'
        )}
      </span>

      {order.is_paid ? (
        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-xl font-semibold whitespace-nowrap">
          Abonado
        </span>
      ) : hasPartialPayment ? null : onMarkPaid ? (
        <button
          type="button"
          disabled={markingPaid}
          onClick={async (e) => {
            e.stopPropagation();
            setMarkingPaid(true);
            try {
              await onMarkPaid();
            } finally {
              setMarkingPaid(false);
            }
          }}
          title="Hacé clic para marcar como abonado"
          aria-label="Pago pendiente: marcar como abonado"
          className="bg-sky-100 hover:bg-sky-200 disabled:opacity-60 text-sky-900 border border-sky-300 hover:border-sky-400 px-2 py-1 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer"
        >
          Pago Pendiente
        </button>
      ) : (
        <span className="bg-sky-100 text-sky-900 border border-sky-300 px-2 py-1 rounded-xl font-semibold whitespace-nowrap">
          Pago Pendiente
        </span>
      )}
    </div>
  );
}
