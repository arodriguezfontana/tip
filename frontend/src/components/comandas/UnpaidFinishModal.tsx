import type { SubmitEvent } from 'react';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import type { AdminOrder } from '@/types/order';
import { formatCurrency } from '@/utils/currency';

/** Con un pago parcial lo que falta es la diferencia, que puede cobrarse por otro medio. */
function pendingPaymentMethod(order: AdminOrder) {
  return (order.paid_amount ?? 0) > 0 ? order.balance_payment_method : order.payment_method;
}

interface UnpaidFinishModalProps {
  order: AdminOrder;
  saving: boolean;
  onConfirm: (event: SubmitEvent) => void;
  onCancel: () => void;
}

/** Pide confirmar el cobro de un pedido que se quiere finalizar sin estar abonado. */
export function UnpaidFinishModal({ order, saving, onConfirm, onCancel }: UnpaidFinishModalProps) {
  const method = pendingPaymentMethod(order);
  return (
    <Modal
      title="El pedido aún no está pago"
      subtitle={`Pedido #${order.id} · ${order.customer_name}`}
      onClose={onCancel}
      closeDisabled={saving}
      width="md"
    >
      <form onSubmit={onConfirm}>
        <ModalBody>
          <p className="text-sm text-gray-700">
            Falta cobrar <strong>{formatCurrency(order.pending_amount ?? order.total_amount)}</strong>
            {method && ` (${PAYMENT_METHOD_LABEL[method]})`}. ¿Querés marcarlo como pago y finalizarlo?
          </p>
        </ModalBody>
        <ModalFooter onCancel={onCancel} submitLabel="Marcar como pago y finalizar" saving={saving} />
      </form>
    </Modal>
  );
}
