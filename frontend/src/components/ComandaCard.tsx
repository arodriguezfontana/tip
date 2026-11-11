import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { AdminOrder, OrderStatus, SectorFilter } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { DriverAssignment } from '@/components/DriverAssignment';
import { KitchenUpdateBanner } from '@/components/KitchenUpdateBanner';
import { PaymentBadges } from '@/components/PaymentBadges';
import { PendingOrderActions } from '@/components/PendingOrderActions';
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
  /** Cocina vio los productos que el cliente agregó al pedido. */
  onAcknowledgeUpdate?: (orderId: number) => Promise<void>;
  /** Lista de repartidores activos disponibles para asignar. */
  activeDrivers?: DeliveryDriver[];
  /** Abre la ventana con el detalle completo del pedido. */
  onOpenDetail?: (order: AdminOrder) => void;
  /** Sector activo seleccionado en el tablero: 'todos', 'pizzeria', 'cocina', 'barra'. */
  selectedSector?: SectorFilter;
  /** Callback opcional de ítem (para compatibilidad). */
  onItemPreparedChange?: (orderId: number, itemId: number, isPrepared: boolean) => Promise<void>;
  /** Callback opcional de sector (para compatibilidad). */
  onSectorPrepared?: (orderId: number, sector: string, isPrepared: boolean) => Promise<void>;
  /** En el modo simulación los pedidos no existen en el servidor: no se consulta la estimación de demora. */
  simulated?: boolean;
}

export { ESTIMATE_REFRESH_INTERVAL_MS } from '@/hooks/useOrderEstimate';

/** Evita que los clics en los controles de la tarjeta abran el detalle del pedido. */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

export function ComandaCard({
  order,
  onStatusChange,
  onAssignDriver,
  onMarkPaid,
  onAcknowledgeUpdate,
  activeDrivers = [],
  onOpenDetail,
  simulated = false,
}: ComandaCardProps) {
  const [pending, setPending] = useState(false);
  const elapsedMs = useElapsedTime(order.created_at);
  // Un pedido a domicilio "En Camino" primero arma su viaje (en silencio) y recién sale cuando se inicia el viaje.
  const isDeliveryOnTheWay = order.status === 'En Camino' && order.delivery_method === 'domicilio' && !simulated;
  const isDispatched = isDeliveryOnTheWay && order.trip_id != null;
  const isBuildingTrip = isDeliveryOnTheWay && order.trip_id == null;
  const hasKitchenUpdate = Boolean(order.kitchen_update_pending);
  // Pago mixto: ya se cobró una parte y el resto (la diferencia) se cobra aparte, ej. en efectivo al repartidor.
  const hasPartialPayment = !order.is_paid && (order.paid_amount ?? 0) > 0;
  // Los pedidos a domicilio en camino llevan repartidor: el cartel permite asignarlo o cambiarlo.
  // Con el viaje ya despachado el repartidor no se cambia (la ruta y los avisos ya salieron).
  const canAssignDriver = order.status === 'En Camino' && order.delivery_method === 'domicilio' && !isDispatched;

  const isOverdue = order.status === 'Pendiente' && elapsedMs > ALERT_THRESHOLD_MS;
  const delayLevel = getDelayLevel(order, new Date(order.created_at).getTime() + elapsedMs);
  const elapsedBadgeClass = isOverdue
    ? 'bg-red-100 text-red-700 animate-pulse'
    : delayLevel
      ? DELAY_BADGE_CLASS[delayLevel]
      : 'bg-gray-100 text-gray-600';

  const handleAssignDriver = async (driverId: number | null) => {
    setPending(true);
    try {
      await onAssignDriver?.(order.id, driverId);
    } finally {
      setPending(false);
    }
  };

  const handleClick = async (newStatus: OrderStatus, estimatedMinutes?: number) => {
    setPending(true);
    try {
      await onStatusChange(order.id, newStatus, estimatedMinutes);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      onClick={onOpenDetail ? () => onOpenDetail(order) : undefined}
      className={`@container bg-white rounded-2xl border p-4 transition-all shadow-xs hover:shadow-md ${onOpenDetail ? 'cursor-pointer' : ''} ${hasKitchenUpdate ? 'border-amber-400 ring-2 ring-amber-300 bg-amber-50/30' : isOverdue ? 'border-red-300 bg-red-50/20' : 'border-gray-100'}`}
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

        {hasKitchenUpdate && (
          <KitchenUpdateBanner onAcknowledge={onAcknowledgeUpdate && (() => onAcknowledgeUpdate(order.id))} />
        )}

        <div className="text-sm space-y-1">
          <p className="font-medium text-gray-900">{order.customer_name}</p>
          <p className="text-xs text-gray-500 break-words">
            {order.delivery_method === 'domicilio' && order.shipping_address?.trim()
              ? order.shipping_address
              : DELIVERY_METHOD_LABEL[order.delivery_method]}
          </p>
          <p className="text-xs text-gray-500">Tel: {order.customer_phone || '—'}</p>
          <p className={`text-xs break-words ${order.notes ? 'text-gray-600 italic' : 'text-gray-400'}`}>
            {order.notes ? `“${order.notes}”` : 'Sin observaciones'}
          </p>
        </div>

        <DriverAssignment
          order={order}
          activeDrivers={activeDrivers}
          canAssign={canAssignDriver}
          pending={pending}
          onAssign={handleAssignDriver}
        />

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

          {isBuildingTrip && (
            <span className="bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-xl font-semibold">
              Armando viaje
            </span>
          )}
          {isDispatched && (
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-xl font-semibold">
              En viaje{order.eta_minutes != null ? ` · llega en ~${order.eta_minutes} min` : ''}
            </span>
          )}

          <span className="ml-auto font-bold text-black text-sm">{formatCurrency(order.total_amount)}</span>
        </div>

        <PaymentBadges
          order={order}
          hasPartialPayment={hasPartialPayment}
          onMarkPaid={onMarkPaid && (() => onMarkPaid(order.id, true))}
        />

        {order.status === 'Pendiente' && (
          <PendingOrderActions order={order} simulated={simulated} pending={pending} onAction={handleClick} />
        )}

        {order.status === 'Confirmado' && (
          <div className="cursor-default pt-2 border-t border-gray-50" onClick={stopPropagation}>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick(order.delivery_method === 'retiro' ? 'Listo para Retirar' : 'En Camino')}
              className="w-full py-2 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
            >
              <span>{order.delivery_method === 'retiro' ? 'Marcar Listo para Retirar' : 'Marcar En Camino'}</span>
            </button>
          </div>
        )}

        {isBuildingTrip && (
          <p className="cursor-default pt-2 border-t border-gray-50 text-xs text-gray-500" onClick={stopPropagation}>
            {order.delivery_driver_id != null
              ? 'Esperando que inicies el viaje del repartidor.'
              : 'Asignale un repartidor para armar el viaje.'}
          </p>
        )}

        {(order.status === 'Listo para Retirar' || (order.status === 'En Camino' && !isBuildingTrip)) && (
          <div className="cursor-default pt-2 border-t border-gray-50" onClick={stopPropagation}>
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
