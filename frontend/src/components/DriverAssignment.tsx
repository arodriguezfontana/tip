import type { MouseEvent } from 'react';
import { DeliveryIcon } from '@/components/Icons';
import type { DeliveryDriver } from '@/types/deliveryDriver';
import type { AdminOrder } from '@/types/order';

/** Evita que los clics en los controles de la tarjeta abran el detalle del pedido. */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

interface DriverAssignmentProps {
  order: AdminOrder;
  activeDrivers: DeliveryDriver[];
  /** Se puede asignar o cambiar el repartidor (mientras el viaje no salió). */
  canAssign: boolean;
  pending: boolean;
  onAssign: (driverId: number | null) => Promise<void>;
}

/** El repartidor del pedido: un cartel que permite elegirlo o, si ya no se puede cambiar, solo mostrarlo. */
export function DriverAssignment({ order, activeDrivers, canAssign, pending, onAssign }: DriverAssignmentProps) {
  if (!canAssign) {
    if (!order.delivery_driver_name) return null;
    return (
      <p className="self-start text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200/60 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
                    <DeliveryIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>Repartidor:</span>
                    <span className="font-bold">{order.delivery_driver_name}</span>
                  </p>
    );
  }
  return (

      /* Cartel que al tocarlo deja elegir el repartidor: un selector nativo transparente encima del texto. */
      <div
        onClick={stopPropagation}
        className={`relative self-start text-xs font-semibold rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5 transition focus-within:ring-2 focus-within:ring-black ${
          order.delivery_driver_name
            ? 'text-blue-800 bg-blue-50 border border-blue-200/60 hover:bg-blue-100'
            : 'text-blue-700 bg-white border border-dashed border-blue-300 hover:bg-blue-50'
        } ${pending ? 'opacity-60' : ''}`}
      >
        <DeliveryIcon className="w-3.5 h-3.5 shrink-0" />
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
            await onAssign(val ? Number(val) : null);
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
  );
}
