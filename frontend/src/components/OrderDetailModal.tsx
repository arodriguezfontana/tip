import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fetchOrderDetail } from '@/services/orderService';
import { ACTIVE_ORDER_STATUSES, PAYMENT_METHOD_LABEL, SECTOR_CONFIG } from '@/types/order';
import type { AdminOrder, OrderDetail, OrderStatus, PreparationSector, WebOrderItem } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { openOrderChat } from '@/utils/orderChat';
import { useReprint } from '@/hooks/useReprint';
import { BellIcon, BotIcon, PrinterIcon, SectorIcon } from '@/components/Icons';

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

interface ModificationVariant {
  quantity: number;
  modifications: NonNullable<WebOrderItem['modifications']>;
}

interface SectorRowItem {
  id: string | number;
  product_id?: number | null;
  total_quantity: number;
  normal_quantity: number;
  promo_quantity: number;
  product_name: string;
  has_normal_units: boolean;
  has_promo_units: boolean;
  normal_subtotal: number;
  added_later?: boolean;
  variants: ModificationVariant[];
  promo_names: string[];
}

function normalizeProductName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanModTag(mod: { type: string; name: string; tag?: string }): string {
  const label = mod.tag || (mod.type === 'negative' ? `SIN ${mod.name.toUpperCase()}` : `EXTRA ${mod.name.toUpperCase()}`);
  return label.split('[').join('').split(']').join('').trim();
}

function getModificationsKey(mods?: WebOrderItem['modifications']): string {
  if (!mods || mods.length === 0) return '';
  return [...mods]
    .map((m) => `${m.type}:${(m.name || '').trim().toLowerCase()}:${(m.tag || '').trim()}`)
    .sort()
    .join('|');
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
  const { reprint, printingId, feedback: printFeedback } = useReprint();
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

  // Agrupación de productos por sector de preparación y recopilación de promociones
  const detailItems = detail?.items;
  const { itemsBySector, promoItems } = useMemo(() => {
    if (!detailItems) return { itemsBySector: [], promoItems: [] };
    const sectorMap = new Map<string, SectorRowItem[]>();
    const promos: WebOrderItem[] = [];

    // Mapeo para alinear sectores entre productos regulares y promociones
    const productSectorMap = new Map<string, string>();
    for (const item of detailItems) {
      if (!item.promotion_id && !item.is_promotion) {
        const sec = (item.sector?.toLowerCase() as PreparationSector) || 'cocina';
        const norm = normalizeProductName(item.product_name);
        productSectorMap.set(norm, sec);
        if (item.product_id) {
          productSectorMap.set(`id:${item.product_id}`, sec);
        }
      }
    }

    for (const [itemIdx, item] of detailItems.entries()) {
      const isPromo = Boolean(item.promotion_id || item.is_promotion);

      if (isPromo) {
        promos.push(item);
        if (item.promotion_products && item.promotion_products.length > 0) {
          for (const p of item.promotion_products) {
            const pNorm = normalizeProductName(p.product_name);
            const sec = (productSectorMap.get(pNorm) ?? (p.product_id ? productSectorMap.get(`id:${p.product_id}`) : null) ?? p.sector?.toLowerCase() ?? 'cocina') as PreparationSector;
            if (!sectorMap.has(sec)) {
              sectorMap.set(sec, []);
            }
            const secList = sectorMap.get(sec)!;
            const existing = secList.find((it) => {
              if (p.product_id && it.product_id && it.product_id === p.product_id) return true;
              return normalizeProductName(it.product_name) === pNorm;
            });

            if (existing) {
              existing.total_quantity += p.quantity;
              existing.promo_quantity += p.quantity;
              existing.has_promo_units = true;
              if (item.added_later) existing.added_later = true;
              if (item.product_name && !existing.promo_names.includes(item.product_name)) {
                existing.promo_names.push(item.product_name);
              }
              const emptyVariant = existing.variants.find((v) => !v.modifications || v.modifications.length === 0);
              if (emptyVariant) {
                emptyVariant.quantity += p.quantity;
              } else {
                existing.variants.push({ quantity: p.quantity, modifications: [] });
              }
            } else {
              secList.push({
                id: `promo-${item.id ?? item.promotion_id}-${p.product_id}-${itemIdx}`,
                product_id: p.product_id,
                total_quantity: p.quantity,
                normal_quantity: 0,
                promo_quantity: p.quantity,
                product_name: p.product_name,
                has_normal_units: false,
                has_promo_units: true,
                normal_subtotal: 0,
                added_later: item.added_later,
                variants: [{ quantity: p.quantity, modifications: [] }],
                promo_names: item.product_name ? [item.product_name] : [],
              });
            }
          }
        } else {
          const pNorm = normalizeProductName(item.product_name);
          const sec = (productSectorMap.get(pNorm) ?? (item.product_id ? productSectorMap.get(`id:${item.product_id}`) : null) ?? item.sector?.toLowerCase() ?? 'cocina') as PreparationSector;
          if (!sectorMap.has(sec)) {
            sectorMap.set(sec, []);
          }
          const secList = sectorMap.get(sec)!;
          const existing = secList.find((it) => {
            if (item.product_id && it.product_id && it.product_id === item.product_id) return true;
            return normalizeProductName(it.product_name) === pNorm;
          });

          const mods = item.modifications || [];
          if (existing) {
            existing.total_quantity += item.quantity;
            existing.promo_quantity += item.quantity;
            existing.has_promo_units = true;
            if (item.added_later) existing.added_later = true;
            if (item.product_name && !existing.promo_names.includes(item.product_name)) {
              existing.promo_names.push(item.product_name);
            }
            const modsKey = getModificationsKey(mods);
            const existingVariant = existing.variants.find((v) => getModificationsKey(v.modifications) === modsKey);
            if (existingVariant) {
              existingVariant.quantity += item.quantity;
            } else {
              existing.variants.push({ quantity: item.quantity, modifications: mods });
            }
          } else {
            secList.push({
              id: item.id ?? `promo-${item.promotion_id}-${itemIdx}`,
              product_id: item.product_id,
              total_quantity: item.quantity,
              normal_quantity: 0,
              promo_quantity: item.quantity,
              product_name: item.product_name,
              has_normal_units: false,
              has_promo_units: true,
              normal_subtotal: 0,
              added_later: item.added_later,
              variants: [{ quantity: item.quantity, modifications: mods }],
              promo_names: item.product_name ? [item.product_name] : [],
            });
          }
        }
      } else {
        const pNorm = normalizeProductName(item.product_name);
        const sec = (item.sector?.toLowerCase() as PreparationSector) || 'cocina';
        if (!sectorMap.has(sec)) {
          sectorMap.set(sec, []);
        }
        const secList = sectorMap.get(sec)!;
        const existing = secList.find((it) => {
          if (item.product_id && it.product_id && it.product_id === item.product_id) return true;
          return normalizeProductName(it.product_name) === pNorm;
        });

        const mods = item.modifications || [];
        if (existing) {
          existing.total_quantity += item.quantity;
          existing.normal_quantity += item.quantity;
          existing.has_normal_units = true;
          existing.normal_subtotal += item.subtotal;
          if (!existing.product_id && item.product_id) existing.product_id = item.product_id;
          if (item.added_later) existing.added_later = true;

          const modsKey = getModificationsKey(mods);
          const existingVariant = existing.variants.find((v) => getModificationsKey(v.modifications) === modsKey);
          if (existingVariant) {
            existingVariant.quantity += item.quantity;
          } else {
            existing.variants.push({ quantity: item.quantity, modifications: mods });
          }
        } else {
          secList.push({
            id: item.id ?? item.product_id ?? `item-${itemIdx}`,
            product_id: item.product_id,
            total_quantity: item.quantity,
            normal_quantity: item.quantity,
            promo_quantity: 0,
            product_name: item.product_name,
            has_normal_units: true,
            has_promo_units: false,
            normal_subtotal: item.subtotal,
            added_later: item.added_later,
            variants: [{ quantity: item.quantity, modifications: mods }],
            promo_names: [],
          });
        }
      }
    }

    return {
      itemsBySector: Array.from(sectorMap.entries()),
      promoItems: promos,
    };
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
            {current.has_chat && !simulated && (
              <button
                type="button"
                onClick={() => {
                  openOrderChat(current.id);
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
                      <span className="inline-flex items-center gap-1.5">
                        <BellIcon className="w-4 h-4 text-amber-700 shrink-0" />
                        El cliente agregó productos a este pedido (marcados como “Nuevo”).
                      </span>
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
                      icon: sector,
                      badgeClass: 'bg-gray-100 text-gray-800 border border-gray-200',
                      activeTabClass: '',
                    };

                    const totalSectorItems = items.reduce((acc, i) => acc + i.total_quantity, 0);

                    return (
                      <div key={sector} className="rounded-xl border border-gray-200/80 overflow-hidden bg-white">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/90 border-b border-gray-100 text-xs font-bold text-gray-800">
                          <span className="flex items-center gap-1.5">
                            <SectorIcon sector={sector} className="w-3.5 h-3.5 shrink-0" />
                            <span>{meta.label}</span>
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">
                            {totalSectorItems} {totalSectorItems === 1 ? 'ítem' : 'ítems'}
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50/40">
                              <th scope="col" className="py-1 px-3 text-left w-14">Cant.</th>
                              <th scope="col" className="py-1 pr-2 text-left">Producto</th>
                              <th scope="col" className="py-1 pr-3 text-right w-36">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {items.map((item) => (
                              <tr key={item.id} className={`transition ${item.added_later ? 'bg-amber-50' : 'hover:bg-gray-50/50'}`}>
                                <td className="py-2 px-3 align-top font-semibold text-gray-800">
                                  <div className="text-sm font-bold">{item.total_quantity}</div>
                                  {item.has_promo_units && (
                                    <div className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">
                                      ({item.promo_quantity} en promo)
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 pr-2 text-gray-900 font-medium">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span>{item.product_name}</span>
                                    {item.added_later && (
                                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900">
                                        Nuevo
                                      </span>
                                    )}
                                  </div>
                                  {item.variants && item.variants.some((v) => v.modifications && v.modifications.length > 0) && (
                                    <div className="mt-1 space-y-1">
                                      {item.variants
                                        .filter((v) => v.modifications && v.modifications.length > 0)
                                        .map((variant, vIdx) => {
                                          const hasMultipleVariants = item.variants.length > 1;
                                          return (
                                            <div key={vIdx} className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                              {hasMultipleVariants && (
                                                <span className="font-bold text-gray-500 whitespace-nowrap">
                                                  {variant.quantity}x
                                                </span>
                                              )}
                                              {variant.modifications.map((mod, mIdx) => (
                                                <span
                                                  key={mIdx}
                                                  className={`font-semibold text-[10px] px-1.5 py-0.2 rounded ${
                                                    mod.type === 'negative'
                                                      ? 'bg-rose-100 text-rose-800'
                                                      : 'bg-emerald-100 text-emerald-800'
                                                  }`}
                                                >
                                                  {cleanModTag(mod)}
                                                </span>
                                              ))}
                                            </div>
                                          );
                                        })}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 pr-3 text-right align-top font-semibold whitespace-nowrap text-gray-900">
                                  {item.has_normal_units ? (
                                    <div>
                                      <span>{formatCurrency(item.normal_subtotal)}</span>
                                      {item.has_promo_units && (
                                        <div className="text-[10px] text-amber-800 font-normal italic">
                                          No incluye precios de promo
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-amber-800 font-medium italic text-xs">
                                      Precio de promo
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {promoItems.length > 0 && (
                    <div className="rounded-xl border-2 border-amber-200/90 overflow-hidden bg-gradient-to-b from-amber-50/40 to-white shadow-2xs">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-amber-100/70 border-b border-amber-200 text-xs font-bold text-amber-900">
                        <span className="flex items-center gap-1.5">
                          <span>Promos</span>
                        </span>
                        <span className="text-[11px] font-medium text-amber-700">
                          {promoItems.reduce((acc, p) => acc + p.quantity, 0)}{' '}
                          {promoItems.reduce((acc, p) => acc + p.quantity, 0) === 1 ? 'promo' : 'promos'}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-amber-200/70 text-[10px] font-bold text-amber-900/70 uppercase tracking-wider bg-amber-50/50">
                            <th scope="col" className="py-1 px-3 text-left w-14">Cant.</th>
                            <th scope="col" className="py-1 pr-2 text-left">Promoción</th>
                            <th scope="col" className="py-1 pr-3 text-right w-36">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {promoItems.map((promo, idx) => (
                            <tr
                              key={promo.id ?? promo.promotion_id ?? idx}
                              className={`transition ${promo.added_later ? 'bg-amber-100/60' : 'hover:bg-amber-50/40'}`}
                            >
                              <td className="py-2 px-3 align-top font-semibold text-gray-800">{promo.quantity}</td>
                              <td className="py-2 pr-2 text-gray-900 font-medium">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs">{promo.product_name}</span>
                                  {promo.added_later && (
                                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-amber-200 text-amber-900">
                                      Nuevo
                                    </span>
                                  )}
                                </div>
                                {promo.promotion_description && (
                                  <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
                                    {promo.promotion_description}
                                  </p>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-right align-top font-bold text-gray-900 whitespace-nowrap">
                                {formatCurrency(promo.subtotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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

        <footer className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
          {printFeedback && (
            <p
              role={printFeedback.type === 'error' ? 'alert' : 'status'}
              className={`mr-auto text-xs font-semibold ${printFeedback.type === 'error' ? 'text-red-700' : 'text-green-700'}`}
            >
              {printFeedback.message}
            </p>
          )}
          {!simulated && (
            <button
              type="button"
              onClick={() => void reprint(order.id)}
              disabled={printingId === order.id}
              aria-label="Reimprimir comanda"
              title="Reimprimir comanda"
              className="p-2.5 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-800 transition disabled:opacity-60"
            >
              <PrinterIcon className={`w-5 h-5 ${printingId === order.id ? 'animate-pulse' : ''}`} />
            </button>
          )}
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
