import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fetchOrderDetail } from '@/services/orderService';
import { ACTIVE_ORDER_STATUSES, PAYMENT_METHOD_LABEL, SECTOR_CONFIG } from '@/types/order';
import type { AdminOrder, OrderDetail, OrderStatus, PreparationSector, WebOrderItem } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TIME_ZONE });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 text-right break-words min-w-0">{children}</dd>
    </div>
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
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(!simulated);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  const handleMarkAsPaid = async () => {
    if (!onMarkPaid) return;
    setMarkingPaid(true);
    try {
      await onMarkPaid(order.id, true);
      setDetail((prev) => (prev ? { ...prev, is_paid: true } : prev));
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!onAcknowledgeUpdate) return;
    setAcknowledging(true);
    try {
      await onAcknowledgeUpdate(order.id);
      setDetail((prev) => (prev ? { ...prev, kitchen_update_pending: false } : prev));
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

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (simulated) return;
    const controller = new AbortController();

    fetchOrderDetail(order.id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(getErrorMessage(err, 'No se pudo cargar el detalle del pedido.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [order.id, simulated, reloadKey]);

  // Cierre con Escape, foco inicial en el botón de cerrar, sin scroll del fondo y foco devuelto al salir.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const retry = () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  // Agrupación de productos por sector de preparación (US-34)
  const detailItems = detail?.items;
  const itemsBySector = useMemo(() => {
    if (!detailItems) return [];
    const map = new Map<string, WebOrderItem[]>();
    for (const item of detailItems) {
      const sec = (item.sector?.toLowerCase() as PreparationSector) || 'cocina';
      if (!map.has(sec)) {
        map.set(sec, []);
      }
      map.get(sec)!.push(item);
    }
    return Array.from(map.entries());
  }, [detailItems]);

  // Los datos generales salen del tablero (se actualizan con el sondeo); el detalle aporta productos y pago.
  const current = order;
  const isDelivery = current.delivery_method === 'domicilio';
  const titleId = `order-detail-title-${order.id}`;

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
                Pedido #{current.id}
              </h2>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[current.status]}`}>
                {current.status}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                {SOURCE_LABEL[current.source] ?? current.source}
                {current.channel ? ` · ${CHANNEL_LABEL[current.channel] ?? current.channel}` : ''}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Recibido el {formatDate(current.created_at)} a las {formatTime(current.created_at)} hs
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {/* Cualquier pedido en curso se puede cancelar (al cliente del bot se le avisa por Telegram). */}
            {onCancel && ACTIVE_ORDER_STATUSES.includes(current.status) &&
              (confirmingCancel ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-red-700">¿Cancelar el pedido?</span>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={handleCancel}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold transition"
                  >
                    Sí, cancelar
                  </button>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => setConfirmingCancel(false)}
                    className="px-3 py-1.5 rounded-lg font-semibold text-gray-600 border border-gray-200 hover:bg-gray-100 transition"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(true)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition"
                >
                  Cancelar pedido
                </button>
              ))}
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
          <Section title="Cliente y entrega">
            <dl className="space-y-1.5">
              <Row label="Nombre">{current.customer_name}</Row>
              <Row label="Teléfono">{current.customer_phone || '—'}</Row>
              <Row label="Modalidad">{isDelivery ? 'Envío a domicilio' : 'Retiro en el local'}</Row>
              {isDelivery && <Row label="Dirección">{current.shipping_address}</Row>}
              {current.delivery_driver_name && (
                <Row label="Repartidor">{current.delivery_driver_name}</Row>
              )}
              {current.scheduled_for ? (
                <Row label="Programado para">
                  {formatDate(current.scheduled_for)} {formatTime(current.scheduled_for)} hs
                </Row>
              ) : (
                current.estimated_minutes != null && (
                  <Row label="Demora estimada">{current.estimated_minutes} min</Row>
                )
              )}
            </dl>
          </Section>

          <Section title="Productos">
            {simulated ? (
              <p className="text-sm text-gray-500">El detalle de productos no está disponible en el modo simulación.</p>
            ) : loading ? (
              <p className="text-sm text-gray-500">Cargando productos…</p>
            ) : error ? (
              <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
                <span>{error}</span>
                <button type="button" onClick={retry} className="shrink-0 font-semibold underline hover:no-underline">
                  Reintentar
                </button>
              </div>
            ) : (
              detail && (
                <div className="space-y-2.5">
                  {current.kitchen_update_pending && (
                    <div
                      role="alert"
                      className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900"
                    >
                      <span>🔔 El cliente agregó productos a este pedido (marcados como “Nuevo”).</span>
                      {onAcknowledgeUpdate && (
                        <button
                          type="button"
                          onClick={handleAcknowledge}
                          disabled={acknowledging}
                          className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-2.5 py-1 transition"
                        >
                          Visto
                        </button>
                      )}
                    </div>
                  )}
                  {itemsBySector.map(([sector, items]) => {
                    const meta = SECTOR_CONFIG[sector as PreparationSector] ?? {
                      key: sector as PreparationSector,
                      label: sector.charAt(0).toUpperCase() + sector.slice(1),
                      icon: '🍽️',
                      badgeClass: 'bg-gray-100 text-gray-800 border border-gray-200',
                      activeTabClass: '',
                    };

                    return (
                      <div key={sector} className="rounded-xl border border-gray-200/80 overflow-hidden bg-white">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 border-b border-gray-100 text-xs font-bold text-gray-800">
                          <span className="flex items-center gap-1.5">
                            <span aria-hidden="true">{meta.icon}</span>
                            <span>{meta.label}</span>
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">
                            {items.reduce((acc, i) => acc + i.quantity, 0)} {items.reduce((acc, i) => acc + i.quantity, 0) === 1 ? 'ítem' : 'ítems'}
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-gray-100">
                            {items.map((item) => (
                              <tr key={item.id ?? item.product_id} className={`transition ${item.added_later ? 'bg-amber-50' : 'hover:bg-gray-50/50'}`}>
                                <td className="py-1.5 px-3 font-semibold text-gray-700 w-8">{item.quantity}</td>
                                <td className="py-1.5 pr-2 text-gray-900 font-medium">
                                  {item.product_name}
                                  {item.added_later && (
                                    <span className="ml-1.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900">
                                      Nuevo
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap text-gray-900">
                                  {formatCurrency(item.subtotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            <div className={`rounded-xl px-4 py-3 text-sm ${current.notes ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-400'}`}>
              <span className="block text-[11px] font-bold uppercase tracking-wide mb-0.5">Aclaraciones del cliente</span>
              <span className="break-words">{current.notes || 'Sin observaciones'}</span>
            </div>
          </Section>

          <Section title="Facturación">
            <dl className="space-y-1.5">
              {detail && (
                <>
                  <Row label="Subtotal">{formatCurrency(detail.subtotal)}</Row>
                  {isDelivery && (
                    <Row label="Costo de envío">
                      {detail.shipping_cost > 0 ? formatCurrency(detail.shipping_cost) : 'Sin cargo'}
                    </Row>
                  )}
                  <Row label="Método de pago">
                    {detail.payment_method ? PAYMENT_METHOD_LABEL[detail.payment_method] : 'No informado'}
                  </Row>
                  {!detail.is_paid && (detail.paid_amount ?? 0) > 0 && (
                    <>
                      <Row label="Pagado">{formatCurrency(detail.paid_amount ?? 0)}</Row>
                      <Row label="Falta cobrar">
                        <span className="font-bold text-amber-800">
                          {formatCurrency(detail.pending_amount ?? 0)}
                          {detail.balance_payment_method
                            ? ` (${PAYMENT_METHOD_LABEL[detail.balance_payment_method]})`
                            : ' (a definir)'}
                        </span>
                      </Row>
                    </>
                  )}
                  <Row label="Estado del pago">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          detail.is_paid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {detail.is_paid
                          ? detail.payment_method === 'mercadopago'
                            ? 'Abonado'
                            : 'Pagado'
                          : (detail.paid_amount ?? 0) > 0
                            ? 'Pago parcial'
                            : 'Pendiente de pago'}
                      </span>
                      {!detail.is_paid && onMarkPaid && (
                        <button
                          type="button"
                          onClick={handleMarkAsPaid}
                          disabled={markingPaid}
                          className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 cursor-pointer"
                        >
                          {markingPaid ? 'Guardando...' : 'Marcar como abonado'}
                        </button>
                      )}
                    </div>
                  </Row>
                </>
              )}
              <div className="flex justify-between items-baseline gap-4 pt-2 mt-1 border-t border-gray-200">
                <dt className="font-bold text-gray-900">{detail?.is_paid ? 'Total (abonado)' : 'Total a pagar'}</dt>
                <dd className="text-xl font-bold text-gray-900">{formatCurrency(current.total_amount)}</dd>
              </div>
            </dl>
          </Section>
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
