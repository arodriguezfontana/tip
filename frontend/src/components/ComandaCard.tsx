import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { PAYMENT_METHOD_LABEL, SECTOR_CONFIG } from '@/types/order';
import type { AdminOrder, OrderStatus, PaymentMethod, PreparationSector, SectorFilter, WebOrderItem } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { ALERT_THRESHOLD_MS, formatElapsed, getDelayLevel } from '@/utils/elapsedTime';
import type { DelayLevel } from '@/utils/elapsedTime';
import type { DeliveryDriver } from '@/types/deliveryDriver';

const SOURCE_BADGE: Record<AdminOrder['source'], { label: string; className: string }> = {
  web: { label: 'Web', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  bot: { label: 'Bot', className: 'bg-sky-50 text-sky-700 border border-sky-200' },
  mostrador: { label: 'Mostrador', className: 'bg-orange-50 text-orange-700 border border-orange-200' },
};

const DELAY_BADGE_CLASS: Record<DelayLevel, string> = {
  'on-time': 'bg-green-100 text-green-700',
  warning: 'bg-amber-100 text-amber-800',
  late: 'bg-red-100 text-red-700',
};

const PAYMENT_METHOD_ICON: Record<PaymentMethod, string> = {
  efectivo: '💵',
  mercadopago: '💳',
  transferencia: '🏦',
  tarjeta: '💳',
};

const DELIVERY_METHOD_LABEL: Record<AdminOrder['delivery_method'], string> = {
  domicilio: 'A domicilio',
  retiro: 'Retiro en local',
};

interface ComandaCardProps {
  order: AdminOrder;
  onStatusChange: (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => Promise<void>;
  /** Asigna un repartidor al pedido. */
  onAssignDriver?: (orderId: number, driverId: number | null) => Promise<void>;
  /** Marca el pedido como abonado. */
  onMarkPaid?: (orderId: number, isPaid: boolean) => Promise<void>;
  /** Lista de repartidores activos disponibles para asignar. */
  activeDrivers?: DeliveryDriver[];
  /** Abre la ventana con el detalle completo del pedido. */
  onOpenDetail?: (order: AdminOrder) => void;
  /** Sector activo seleccionado en el tablero: 'todos', 'pizzeria', 'cocina', 'barra'. */
  selectedSector?: SectorFilter;
  /** Callback para marcar/desmarcar un ítem preparado. */
  onItemPreparedChange?: (orderId: number, itemId: number, isPrepared: boolean) => Promise<void>;
  /** Callback para marcar todos los ítems de un sector preparados. */
  onSectorPrepared?: (orderId: number, sector: string, isPrepared: boolean) => Promise<void>;
}

/** Evita que los clics en los controles de la tarjeta abran el detalle del pedido. */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

export function ComandaCard({
  order,
  onStatusChange,
  onAssignDriver,
  onMarkPaid,
  activeDrivers = [],
  onOpenDetail,
  selectedSector = 'todos',
  onItemPreparedChange,
  onSectorPrepared,
}: ComandaCardProps) {
  const [pending, setPending] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [sectorActionPending, setSectorActionPending] = useState(false);
  const [estimatedMinutesInput, setEstimatedMinutesInput] = useState('');
  const elapsedMs = useElapsedTime(order.created_at);
  const isScheduled = order.scheduled_for != null;
  // Los pedidos a domicilio en camino llevan repartidor: el cartel permite asignarlo o cambiarlo.
  const canAssignDriver = order.status === 'En Camino' && order.delivery_method === 'domicilio';

  const isOverdue = order.status === 'Pendiente' && elapsedMs > ALERT_THRESHOLD_MS;
  const delayLevel = getDelayLevel(order, new Date(order.created_at).getTime() + elapsedMs);
  const elapsedBadgeClass = isOverdue
    ? 'bg-red-100 text-red-700 animate-pulse'
    : delayLevel
      ? DELAY_BADGE_CLASS[delayLevel]
      : 'bg-gray-100 text-gray-600';
  const parsedMinutes = Number(estimatedMinutesInput);
  
  const isValidMinutes = estimatedMinutesInput.trim() === '' || (Number.isInteger(parsedMinutes) && parsedMinutes > 0);

  const handleClick = async (newStatus: OrderStatus, estimatedMinutes?: number) => {
    setPending(true);
    try {
      await onStatusChange(order.id, newStatus, estimatedMinutes);
    } finally {
      setPending(false);
    }
  };

  const items = order.items ?? [];
  const hasItems = items.length > 0;
  const totalItemCount = hasItems ? items.length : order.item_count || 0;
  const preparedItemCount = hasItems ? items.filter((i) => i.is_prepared).length : 0;
  const progressPercent = totalItemCount > 0 ? Math.round((preparedItemCount / totalItemCount) * 100) : 0;
  const isAllPrepared = order.is_all_prepared || (hasItems && preparedItemCount === totalItemCount);

  // Ítems agrupados por sector para vista "todos"
  const groupedBySector = useMemo(() => {
    const map = new Map<PreparationSector, WebOrderItem[]>();
    for (const item of items) {
      const sec = ((item.sector?.toLowerCase() as PreparationSector) || 'cocina');
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(item);
    }
    return map;
  }, [items]);

  // Ítems visibles según el filtro de sector
  const isSpecificSector = selectedSector !== 'todos';
  const visibleItems = useMemo(() => {
    if (!isSpecificSector) return items;
    return items.filter((i) => (i.sector?.toLowerCase() || 'cocina') === selectedSector);
  }, [items, isSpecificSector, selectedSector]);

  const allVisiblePrepared = visibleItems.length > 0 && visibleItems.every((i) => i.is_prepared);

  const handleToggleItem = async (item: WebOrderItem, event: MouseEvent) => {
    stopPropagation(event);
    if (!item.id || !onItemPreparedChange) return;
    await onItemPreparedChange(order.id, item.id, !item.is_prepared);
  };

  const handleBatchSector = async (sectorName: string, targetState: boolean, event: MouseEvent) => {
    stopPropagation(event);
    if (!onSectorPrepared) return;
    setSectorActionPending(true);
    try {
      await onSectorPrepared(order.id, sectorName, targetState);
    } finally {
      setSectorActionPending(false);
    }
  };

  return (
    <div
      onClick={onOpenDetail ? () => onOpenDetail(order) : undefined}
      className={`@container bg-white rounded-2xl border p-4 transition-all shadow-xs hover:shadow-md ${onOpenDetail ? 'cursor-pointer' : ''} ${isOverdue ? 'border-red-300 bg-red-50/20' : 'border-gray-100'}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-50 pb-2">
          <div className="flex items-center gap-2">
            {onOpenDetail ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(order);
                }}
                aria-label={`Ver detalle del pedido #${order.id}`}
                className="font-bold text-gray-900 text-sm rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                #{order.id}
              </button>
            ) : (
              <span className="font-bold text-gray-900 text-sm">#{order.id}</span>
            )}
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                (SOURCE_BADGE[order.source] ?? SOURCE_BADGE.bot).className
              }`}
            >
              {(SOURCE_BADGE[order.source] ?? SOURCE_BADGE.bot).label}
            </span>
          </div>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${elapsedBadgeClass}`}>
            {formatElapsed(elapsedMs)}
          </span>
        </div>

        <div className="text-sm space-y-1">
          <p className="font-medium text-gray-900">{order.customer_name}</p>
          <p className="text-xs text-gray-500">{DELIVERY_METHOD_LABEL[order.delivery_method]}</p>
          <p className="text-xs text-gray-500">Tel: {order.customer_phone || '—'}</p>
          <p className={`text-xs break-words ${order.notes ? 'text-gray-600 italic' : 'text-gray-400'}`}>
            {order.notes ? `“${order.notes}”` : 'Sin observaciones'}
          </p>
        </div>

        {canAssignDriver ? (
          /* Cartel que al tocarlo deja elegir el repartidor: un selector nativo transparente encima del texto. */
          <div
            onClick={stopPropagation}
            className={`relative self-start text-xs font-semibold rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 transition focus-within:ring-2 focus-within:ring-black ${
              order.delivery_driver_name
                ? 'text-blue-800 bg-blue-50 border border-blue-200/60 hover:bg-blue-100'
                : 'text-blue-700 bg-white border border-dashed border-blue-300 hover:bg-blue-50'
            } ${pending ? 'opacity-60' : ''}`}
          >
            <span aria-hidden="true">🛵</span>
            {order.delivery_driver_name ? (
              <>
                <span>Repartidor:</span>
                <span className="font-bold">{order.delivery_driver_name}</span>
              </>
            ) : (
              <span>Asignar repartidor</span>
            )}
            <span aria-hidden="true" className="text-[10px] opacity-70">
              ▾
            </span>
            <select
              aria-label={order.delivery_driver_name ? 'Cambiar repartidor' : 'Asignar repartidor'}
              value={order.delivery_driver_id ?? ''}
              disabled={pending}
              onChange={async (e) => {
                const val = e.target.value;
                setPending(true);
                try {
                  await onAssignDriver?.(order.id, val ? Number(val) : null);
                } finally {
                  setPending(false);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-wait"
            >
              <option value="" disabled={!order.delivery_driver_name}>
                {order.delivery_driver_name ? 'Quitar asignación' : 'Elegí un repartidor'}
              </option>
              {/* Si el repartidor asignado ya no está activo igual se muestra como el elegido. */}
              {order.delivery_driver_id != null && !activeDrivers.some((d) => d.id === order.delivery_driver_id) && (
                <option value={order.delivery_driver_id}>{order.delivery_driver_name}</option>
              )}
              {activeDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driver.phone})
                </option>
              ))}
            </select>
          </div>
        ) : (
          order.delivery_driver_name && (
            <p className="self-start text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200/60 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
              <span>🛵 Repartidor:</span>
              <span className="font-bold">{order.delivery_driver_name}</span>
            </p>
          )
        )}

        {/* Sección de productos segmentados por sector */}
        {hasItems && (
          <div className="border border-gray-100 rounded-xl p-2.5 bg-gray-50/40 space-y-2.5" onClick={stopPropagation}>
            {/* Barra de progreso global del pedido */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-gray-700">Progreso general:</span>
                <span className={`font-bold ${isAllPrepared ? 'text-emerald-700' : 'text-gray-600'}`}>
                  {preparedItemCount}/{totalItemCount} {isAllPrepared ? '✓ Listo' : `(${progressPercent}%)`}
                </span>
              </div>
              <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${isAllPrepared ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Listado de ítems según filtro */}
            {isSpecificSector ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{SECTOR_CONFIG[selectedSector]?.icon}</span>
                    <span className="text-xs font-bold text-gray-800">
                      {SECTOR_CONFIG[selectedSector]?.label}
                    </span>
                  </div>
                  {onSectorPrepared && visibleItems.length > 0 && (
                    allVisiblePrepared ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                        ✓ Sector preparado
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={sectorActionPending}
                        onClick={(e) => handleBatchSector(selectedSector, true, e)}
                        className="text-[10px] font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 px-2 py-0.5 rounded-md transition shadow-2xs cursor-pointer"
                      >
                        Marcar sector listo
                      </button>
                    )
                  )}
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                  {visibleItems.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-1">Sin platos para este sector</p>
                  ) : (
                    visibleItems.map((item) => (
                      <div
                        key={item.id ?? item.product_id}
                        onClick={(e) => handleToggleItem(item, e)}
                        className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-xs transition cursor-pointer select-none ${
                          item.is_prepared
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                            : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              item.is_prepared ? 'bg-emerald-600 text-white' : 'border border-gray-400 text-transparent'
                            }`}
                          >
                            ✓
                          </span>
                          <span className={`font-semibold shrink-0 ${item.is_prepared ? 'text-emerald-700' : 'text-gray-700'}`}>
                            {item.quantity}×
                          </span>
                          <span className={`truncate ${item.is_prepared ? 'line-through text-gray-500' : 'font-medium text-gray-900'}`}>
                            {item.product_name}
                          </span>
                        </div>
                        <span className={`text-[10px] font-semibold shrink-0 ${item.is_prepared ? 'text-emerald-700' : 'text-gray-400'}`}>
                          {item.is_prepared ? 'Listo' : 'Pendiente'}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Chips de los otros sectores en este pedido */}
                {groupedBySector.size > 1 && (
                  <div className="pt-1 flex flex-wrap items-center gap-1 text-[10px] text-gray-500">
                    <span className="text-gray-400">Otros sectores:</span>
                    {Array.from(groupedBySector.entries())
                      .filter(([sec]) => sec !== selectedSector)
                      .map(([sec, secItems]) => {
                        const secReady = secItems.every((i) => i.is_prepared);
                        const secMeta = SECTOR_CONFIG[sec as PreparationSector];
                        return (
                          <span
                            key={sec}
                            className={`px-1.5 py-0.5 rounded-md font-semibold inline-flex items-center gap-1 ${
                              secReady ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <span>{secMeta?.icon ?? '🍽️'}</span>
                            <span>{secMeta?.label ?? sec}</span>
                            <span>{secReady ? '✓' : '⏳'}</span>
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
            ) : (
              /* Vista "Todos": Segmentado por cada área de trabajo */
              <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                {Array.from(groupedBySector.entries()).map(([sec, secItems]) => {
                  const secMeta = SECTOR_CONFIG[sec as PreparationSector];
                  const secAllReady = secItems.every((i) => i.is_prepared);

                  return (
                    <div key={sec} className="bg-white rounded-lg p-2 border border-gray-200/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 font-bold text-gray-800">
                          <span>{secMeta?.icon ?? '🍽️'}</span>
                          <span>{secMeta?.label ?? sec}</span>
                        </div>
                        {onSectorPrepared && (
                          secAllReady ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              ✓ Listo
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={sectorActionPending}
                              onClick={(e) => handleBatchSector(sec, true, e)}
                              className="text-[10px] font-semibold text-gray-600 hover:text-black bg-gray-50 hover:bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded transition cursor-pointer"
                            >
                              Marcar listo
                            </button>
                          )
                        )}
                      </div>

                      <div className="space-y-1">
                        {secItems.map((item) => (
                          <div
                            key={item.id ?? item.product_id}
                            onClick={(e) => handleToggleItem(item, e)}
                            className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded text-xs transition cursor-pointer select-none ${
                              item.is_prepared
                                ? 'bg-emerald-50/50 text-emerald-900'
                                : 'hover:bg-gray-50 text-gray-800'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                  item.is_prepared ? 'bg-emerald-600 text-white' : 'border border-gray-300 text-transparent'
                                }`}
                              >
                                ✓
                              </span>
                              <span className="font-semibold text-gray-700 shrink-0">{item.quantity}×</span>
                              <span className={`truncate ${item.is_prepared ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                {item.product_name}
                              </span>
                            </div>
                            <span className={`text-[10px] shrink-0 ${item.is_prepared ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
                              {item.is_prepared ? 'Listo' : '⏳'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Aviso visual cuando el pedido completo está preparado */}
            {isAllPrepared && (
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/60 border border-emerald-300 py-1 px-2 rounded-lg animate-pulse">
                <span>✅</span>
                <span>¡Comanda 100% preparada para entrega!</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {order.scheduled_for ? (
            <span className="bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-xl font-semibold">
              {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}
            </span>
          ) : (
            order.estimated_minutes != null && (
              <span className="bg-purple-50 border border-purple-200 text-purple-800 px-2.5 py-1 rounded-xl font-semibold">
                Estimado: {order.estimated_minutes} min
              </span>
            )
          )}

          <span className="ml-auto font-bold text-black text-sm">{formatCurrency(order.total_amount)}</span>
        </div>

        {/* Medio de pago y si ya está abonado; si está pendiente, un clic lo marca como abonado. */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="bg-gray-50 border border-gray-200 text-gray-700 px-2 py-1 rounded-xl font-semibold whitespace-nowrap inline-flex items-center gap-1">
            {order.payment_method ? (
              <>
                <span aria-hidden="true" className="@max-[205px]:hidden">
                  {PAYMENT_METHOD_ICON[order.payment_method]}
                </span>
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
          ) : onMarkPaid ? (
            <button
              type="button"
              disabled={markingPaid}
              onClick={async (e) => {
                e.stopPropagation();
                setMarkingPaid(true);
                try {
                  await onMarkPaid(order.id, true);
                } finally {
                  setMarkingPaid(false);
                }
              }}
              title="Hacé clic para marcar como abonado"
              aria-label="Pago pendiente: marcar como abonado"
              className="bg-amber-50 hover:bg-amber-100 disabled:opacity-60 text-amber-800 border border-amber-200 hover:border-amber-300 px-2 py-1 rounded-xl font-semibold whitespace-nowrap transition cursor-pointer"
            >
              Pago Pendiente
            </button>
          ) : (
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-1 rounded-xl font-semibold whitespace-nowrap">
              Pago Pendiente
            </span>
          )}
        </div>

        {order.status === 'Pendiente' && (
          <div className="space-y-2 pt-2 border-t border-gray-50" onClick={stopPropagation}>
            {/* Los programados se entregan en su horario: no llevan demora estimada. */}
            {!isScheduled && (
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Automática (15+ min) o manual"
                value={estimatedMinutesInput}
                onChange={(e) => setEstimatedMinutesInput(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black bg-gray-50/50"
              />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !isValidMinutes}
                onClick={() =>
                  handleClick('Confirmado', isScheduled || estimatedMinutesInput.trim() === '' ? undefined : parsedMinutes)
                }
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
              >
                Confirmar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleClick('Rechazado')}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
              >
                Rechazar
              </button>
            </div>
          </div>
        )}

        {order.status === 'Confirmado' && (
          <div className="pt-2 border-t border-gray-50" onClick={stopPropagation}>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick(order.delivery_method === 'retiro' ? 'Listo para Retirar' : 'En Camino')}
              className={`w-full py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 ${
                isAllPrepared
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400 ring-offset-1'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white'
              }`}
            >
              {isAllPrepared && <span>✓</span>}
              <span>{order.delivery_method === 'retiro' ? 'Marcar Listo para Retirar' : 'Marcar En Camino'}</span>
            </button>
          </div>
        )}

        {(order.status === 'En Camino' || order.status === 'Listo para Retirar') && (
          <div className="pt-2 border-t border-gray-50" onClick={stopPropagation}>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick('Finalizado')}
              className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
            >
              Finalizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
