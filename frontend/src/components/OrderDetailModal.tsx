import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fetchOrderDetail } from '@/services/orderService';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import type { AdminOrder, OrderDetail, OrderStatus } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/customerValidation';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  Pendiente: 'bg-amber-100 text-amber-800',
  Confirmado: 'bg-blue-100 text-blue-800',
  'En Camino': 'bg-purple-100 text-purple-800',
  'Listo para Retirar': 'bg-teal-100 text-teal-800',
  Finalizado: 'bg-green-100 text-green-800',
  Rechazado: 'bg-red-100 text-red-700',
};

const SOURCE_LABEL: Record<AdminOrder['source'], string> = {
  web: 'Web',
  bot: 'Bot',
  mostrador: 'Mostrador',
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
  onClose: () => void;
}

export function OrderDetailModal({ order, simulated = false, onClose }: OrderDetailModalProps) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(!simulated);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

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
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Recibido el {formatDate(current.created_at)} a las {formatTime(current.created_at)} hs
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle del pedido"
            className="shrink-0 w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 text-2xl leading-none transition"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          <Section title="Cliente y entrega">
            <dl className="space-y-1.5">
              <Row label="Nombre">{current.customer_name}</Row>
              <Row label="Teléfono">{current.customer_phone || '—'}</Row>
              <Row label="Modalidad">{isDelivery ? 'Envío a domicilio' : 'Retiro en el local'}</Row>
              {isDelivery && <Row label="Dirección">{current.shipping_address}</Row>}
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                      <th className="text-left font-semibold py-2 pr-2">Cant.</th>
                      <th className="text-left font-semibold py-2 pr-2">Producto</th>
                      <th className="text-right font-semibold py-2 pr-2">P. unit.</th>
                      <th className="text-right font-semibold py-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.items.map((item) => (
                      <tr key={item.product_id}>
                        <td className="py-2 pr-2 font-semibold">{item.quantity}</td>
                        <td className="py-2 pr-2 text-gray-900">{item.product_name}</td>
                        <td className="py-2 pr-2 text-right text-gray-600 whitespace-nowrap">
                          {formatCurrency(item.unit_price)}
                        </td>
                        <td className="py-2 text-right font-semibold whitespace-nowrap">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  <Row label="Estado del pago">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        detail.is_paid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {detail.is_paid ? 'Pagado' : 'Pendiente de pago'}
                    </span>
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
