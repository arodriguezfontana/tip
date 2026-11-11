import { useState } from 'react';
import type { Dispatch, SubmitEvent, SetStateAction } from 'react';
import {
  acknowledgeKitchenUpdate,
  assignDeliveryDriver,
  dispatchTrip,
  updateOrderItemPrepared,
  updateOrderPayment,
  updateOrderSectorPrepared,
  updateOrderStatus,
} from '@/services/orderService';
import { FINISHED_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder, OrderStatus } from '@/types/order';
import type { DeliveryDriver } from '@/types/deliveryDriver';
import { getErrorMessage } from '@/utils/errors';
import { printErrorMessage } from '@/utils/printing';
import { updateOrder, withItemPrepared, withSectorPrepared } from '@/utils/orderBoard';

interface BoardActionsParams {
  orders: AdminOrder[];
  activeDrivers: DeliveryDriver[];
  /** En el modo simulación los pedidos no existen en el servidor: los cambios son solo locales. */
  isSimulating: boolean;
  setOrders: Dispatch<SetStateAction<AdminOrder[]>>;
  setError: (message: string | null) => void;
}

/** Los pedidos que terminaron salen del tablero; los demás se reemplazan por su versión actualizada. */
function replaceOrDrop(orders: AdminOrder[], orderId: number, updated: AdminOrder): AdminOrder[] {
  if (FINISHED_ORDER_STATUSES.includes(updated.status)) return orders.filter((order) => order.id !== orderId);
  return updateOrder(orders, orderId, () => updated);
}

/** Lo que el personal puede hacer con los pedidos del tablero: cambiarles el estado, el pago, el repartidor, etc. */
export function useBoardActions({ orders, activeDrivers, isSimulating, setOrders, setError }: BoardActionsParams) {
  // Repartidor cuyo viaje se está iniciando (la ruta tarda unos segundos en calcularse).
  const [dispatchingDriverId, setDispatchingDriverId] = useState<number | null>(null);
  // Pedido que se quiso finalizar sin estar abonado: se pide confirmar el cobro antes de cerrarlo.
  const [unpaidToFinish, setUnpaidToFinish] = useState<AdminOrder | null>(null);
  const [finishingUnpaid, setFinishingUnpaid] = useState(false);

  const applyStatusChange = async (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => {
    if (isSimulating) {
      // Sin servidor, el pedido queda con el estado pedido (y la demora indicada, si la hay).
      setOrders((prev) =>
        FINISHED_ORDER_STATUSES.includes(newStatus)
          ? prev.filter((order) => order.id !== orderId)
          : updateOrder(prev, orderId, (order) => ({
              ...order,
              status: newStatus,
              estimated_minutes: estimatedMinutes ?? order.estimated_minutes,
            }))
      );
      return;
    }
    try {
      const updated = await updateOrderStatus(orderId, newStatus, estimatedMinutes);
      setOrders((prev) => replaceOrDrop(prev, orderId, updated));
      // El pedido ya se confirmó: si la comanda no salió, se avisa sin deshacer nada.
      setError(updated.print_error ? printErrorMessage(updated.shift_number) : null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo actualizar el estado del pedido.'));
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => {
    const order = orders.find((o) => o.id === orderId);
    if (newStatus === 'Finalizado' && order && !order.is_paid) {
      setUnpaidToFinish(order);
      return;
    }
    await applyStatusChange(orderId, newStatus, estimatedMinutes);
  };

  const handlePayAndFinish = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!unpaidToFinish) return;
    setFinishingUnpaid(true);
    try {
      if (!isSimulating) await updateOrderPayment(unpaidToFinish.id, true);
      await applyStatusChange(unpaidToFinish.id, 'Finalizado');
    } catch {
      setError('No se pudo marcar el pedido como abonado. No se finalizó.');
    } finally {
      setFinishingUnpaid(false);
      setUnpaidToFinish(null);
    }
  };

  const handleAssignDriver = async (orderId: number, driverId: number | null) => {
    if (isSimulating) {
      const driver = activeDrivers.find((d) => d.id === driverId);
      setOrders((prev) =>
        updateOrder(prev, orderId, (order) => ({
          ...order,
          delivery_driver_id: driverId,
          delivery_driver_name: driver ? driver.name : null,
        }))
      );
      return;
    }
    try {
      const updated = await assignDeliveryDriver(orderId, driverId);
      setOrders((prev) => updateOrder(prev, orderId, () => updated));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo asignar el repartidor.'));
    }
  };

  const handleStartTrip = async (driverId: number) => {
    setDispatchingDriverId(driverId);
    try {
      const trip = await dispatchTrip(driverId);
      // El viaje sale con todos sus pedidos: cada uno queda con su parada y su llegada estimada.
      const stops = new Map(trip.stops.map((stop) => [stop.order_id, stop]));
      setOrders((prev) =>
        prev.map((order) => {
          const stop = stops.get(order.id);
          return stop ? { ...order, trip_id: trip.id, trip_stop: stop.stop, eta_minutes: stop.eta_minutes } : order;
        })
      );
      // Si no se pudo calcular la ruta el viaje salió igual (sin tiempos): se le avisa al empleado por qué.
      setError(trip.warning ? `El viaje salió sin tiempo estimado. ${trip.warning}` : null);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo iniciar el viaje.'));
    } finally {
      setDispatchingDriverId(null);
    }
  };

  const handleAcknowledgeUpdate = async (orderId: number) => {
    if (isSimulating) {
      setOrders((prev) => updateOrder(prev, orderId, (order) => ({ ...order, kitchen_update_pending: false })));
      return;
    }
    try {
      const updated = await acknowledgeKitchenUpdate(orderId);
      setOrders((prev) =>
        updateOrder(prev, orderId, (order) => ({ ...order, kitchen_update_pending: updated.kitchen_update_pending }))
      );
      setError(null);
    } catch {
      setError('No se pudo marcar la actualización del pedido como vista.');
    }
  };

  const handleMarkPaid = async (orderId: number, isPaid: boolean = true) => {
    if (isSimulating) {
      setOrders((prev) => updateOrder(prev, orderId, (order) => ({ ...order, is_paid: isPaid })));
      return;
    }
    try {
      const updated = await updateOrderPayment(orderId, isPaid);
      setOrders((prev) => updateOrder(prev, orderId, (order) => ({ ...order, is_paid: updated.is_paid })));
      setError(null);
    } catch {
      setError('No se pudo actualizar el estado de pago del pedido.');
    }
  };

  const handleItemPreparedChange = async (orderId: number, itemId: number, isPrepared: boolean) => {
    // Actualización optimista local en memoria
    setOrders((prev) => updateOrder(prev, orderId, (order) => withItemPrepared(order, itemId, isPrepared)));
    if (isSimulating) return;
    try {
      const updated = await updateOrderItemPrepared(orderId, itemId, isPrepared);
      setOrders((prev) => updateOrder(prev, orderId, (order) => ({ ...order, ...updated })));
      setError(null);
    } catch {
      setError('No se pudo actualizar el estado de preparación del plato.');
    }
  };

  const handleSectorPrepared = async (orderId: number, sector: string, isPrepared: boolean) => {
    // Actualización optimista local en memoria
    setOrders((prev) => updateOrder(prev, orderId, (order) => withSectorPrepared(order, sector, isPrepared)));
    if (isSimulating) return;
    try {
      const updated = await updateOrderSectorPrepared(orderId, sector, isPrepared);
      setOrders((prev) => updateOrder(prev, orderId, (order) => ({ ...order, ...updated })));
      setError(null);
    } catch {
      setError(`No se pudo marcar el sector ${sector} como preparado.`);
    }
  };

  return {
    dispatchingDriverId,
    unpaidToFinish,
    finishingUnpaid,
    dismissUnpaidToFinish: () => setUnpaidToFinish(null),
    handleStatusChange,
    handlePayAndFinish,
    handleAssignDriver,
    handleStartTrip,
    handleAcknowledgeUpdate,
    handleMarkPaid,
    handleItemPreparedChange,
    handleSectorPrepared,
  };
}
