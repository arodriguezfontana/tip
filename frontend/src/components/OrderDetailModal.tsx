import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BotIcon } from '@/components/Icons';
import { BillingSection } from '@/components/orderDetail/BillingSection';
import { CancelOrderControl } from '@/components/orderDetail/CancelOrderControl';
import { Row, Section } from '@/components/orderDetail/DetailLayout';
import { ProductsSection } from '@/components/orderDetail/ProductsSection';
import { useModalFocus } from '@/hooks/useModalFocus';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { ACTIVE_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder, OrderStatus } from '@/types/order';
import { formatDate, formatTime } from '@/utils/dateTime';
import { openOrderChat } from '@/utils/orderChat';

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  Pendiente: 'bg-amber-100 text-amber-800',
  Confirmado: 'bg-blue-100 text-blue-800',
  'En Camino': 'bg-purple-100 text-purple-800',
  'Listo para Retirar': 'bg-teal-100 text-teal-800',
  Finalizado: 'bg-green-100 text-green-800',
  Rechazado: 'bg-red-100 text-red-700',
  Cancelado: 'bg-red-100 text-red-700',
};

const SOURCE_LABEL: Record<AdminOrder['source'], string> = {
  web: 'Web',
  bot: 'Bot',
  mostrador: 'Mostrador',
};

const CHANNEL_LABEL: Record<NonNullable<AdminOrder['channel']>, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
};

function originLabel(order: AdminOrder): string {
  const source = SOURCE_LABEL[order.source] ?? order.source;
  return order.channel ? `${source} · ${CHANNEL_LABEL[order.channel] ?? order.channel}` : source;
}

/** Cuándo se hace el pedido: el horario programado o la demora estimada (si hay). */
function ScheduleRow({ order }: { order: AdminOrder }) {
  if (order.scheduled_for) {
    return (
      <Row label="Programado para">
        {formatDate(order.scheduled_for)} {formatTime(order.scheduled_for)} hs
      </Row>
    );
  }
  return order.estimated_minutes != null ? <Row label="Demora estimada">{order.estimated_minutes} min</Row> : null;
}

function CustomerSection({ order, isDelivery }: { order: AdminOrder; isDelivery: boolean }) {
  return (
    <Section title="Cliente y entrega">
      <dl className="space-y-1.5">
        <Row label="Nombre">{order.customer_name}</Row>
        <Row label="Teléfono">{order.customer_phone || '—'}</Row>
        <Row label="Modalidad">{isDelivery ? 'Envío a domicilio' : 'Retiro en el local'}</Row>
        {isDelivery && <Row label="Dirección">{order.shipping_address}</Row>}
        {order.delivery_driver_name && <Row label="Repartidor">{order.delivery_driver_name}</Row>}
        <ScheduleRow order={order} />
      </dl>
    </Section>
  );
}

interface OrderDetailModalProps {
  /** Datos del tablero: se muestran al instante mientras se carga el detalle completo. */
  order: AdminOrder;
  /** En el modo simulación los pedidos no existen en el servidor: no se busca su detalle. */
  simulated?: boolean;
  /** Marca el pedido como abonado. */
  onMarkPaid?: (orderId: number, isPaid: boolean) => Promise<void>;
  /** Cocina vio los productos que el cliente agregó al pedido. */
  onAcknowledgeUpdate?: (orderId: number) => Promise<void>;
  /** Cancela el pedido (si se indica, el modal ofrece el botón mientras el pedido siga en curso). */
  onCancel?: (orderId: number) => Promise<void>;
  onClose: () => void;
}

export function OrderDetailModal({
  order,
  simulated = false,
  onMarkPaid,
  onAcknowledgeUpdate,
  onCancel,
  onClose,
}: OrderDetailModalProps) {
  const { detail, loading, error, retry, patchDetail } = useOrderDetail(order.id, simulated);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useModalFocus(closeButtonRef, onClose);

  const handleMarkAsPaid = async () => {
    if (!onMarkPaid) return;
    setMarkingPaid(true);
    try {
      await onMarkPaid(order.id, true);
      patchDetail({ is_paid: true });
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!onAcknowledgeUpdate) return;
    setAcknowledging(true);
    try {
      await onAcknowledgeUpdate(order.id);
      patchDetail({ kitchen_update_pending: false });
    } finally {
      setAcknowledging(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setCancelling(true);
    try {
      // Si se cancela, el pedido sale del tablero y esta ventana se cierra sola.
      await onCancel(order.id);
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  // Los datos generales salen del tablero (se actualizan con el sondeo); el detalle aporta productos y pago.
  const isDelivery = order.delivery_method === 'domicilio';
  const titleId = `order-detail-title-${order.id}`;
  const canCancel = onCancel && ACTIVE_ORDER_STATUSES.includes(order.status);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      // mousedown y no click: arrastrar una selección de texto hacia afuera no debe cerrar la ventana.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-xl font-bold text-gray-900">
                Pedido #{order.id}
              </h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[order.status]}`}>
                {order.status}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                {originLabel(order)}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Recibido el {formatDate(order.created_at)} a las {formatTime(order.created_at)} hs
            </p>
            {order.has_chat && !simulated && (
              <button
                type="button"
                onClick={() => {
                  openOrderChat(order.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                <BotIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Abrir chat con el cliente</span>
              </button>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {/* Cualquier pedido en curso se puede cancelar (al cliente del bot se le avisa por Telegram). */}
            {canCancel && (
              <CancelOrderControl
                confirming={confirmingCancel}
                cancelling={cancelling}
                onAsk={() => setConfirmingCancel(true)}
                onConfirm={handleCancel}
                onDismiss={() => setConfirmingCancel(false)}
              />
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle del pedido"
              className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 text-2xl leading-none transition"
            >
              ×
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          <CustomerSection order={order} isDelivery={isDelivery} />
          <ProductsSection
            order={order}
            detail={detail}
            simulated={simulated}
            loading={loading}
            error={error}
            onRetry={retry}
            acknowledging={acknowledging}
            onAcknowledge={onAcknowledgeUpdate ? handleAcknowledge : undefined}
          />
          <BillingSection
            order={order}
            detail={detail}
            isDelivery={isDelivery}
            markingPaid={markingPaid}
            onMarkAsPaid={onMarkPaid ? handleMarkAsPaid : undefined}
          />
        </div>

        <footer className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-black hover:bg-gray-800 text-white text-sm font-bold transition"
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
