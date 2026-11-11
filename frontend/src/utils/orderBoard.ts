import { ACTIVE_ORDER_STATUSES } from '@/types/order';
import type { AdminOrder, OrderStatus, PreparationSector, SectorFilter, WebOrderItem } from '@/types/order';

const DEFAULT_SECTOR = 'cocina';

export type PendingFilter = 'ahora' | 'programados';

/** Páginas del tablero por estado: cada columna tiene la suya. */
export type ColumnPages = Record<string, number>;

export const FIRST_PAGES: ColumnPages = {
  Pendiente: 1,
  Confirmado: 1,
  'En Camino': 1,
  'Listo para Retirar': 1,
};

export interface BoardColumn {
  status: OrderStatus;
  orders: AdminOrder[];
  totalCount: number;
  modifiedCount: number;
  currentPage: number;
  totalPages: number;
}

export interface DriverTrip {
  driverId: number;
  driverName: string;
  count: number;
}

export interface TripsToStart {
  groups: DriverTrip[];
  withoutDriver: number;
}

const sectorOfItem = (item: WebOrderItem): string => item.sector?.toLowerCase() || DEFAULT_SECTOR;

function itemTouchesSector(item: WebOrderItem, sector: PreparationSector): boolean {
  const promotionSectors = (item.promotion_products ?? []).map((product) => product.sector?.toLowerCase() || DEFAULT_SECTOR);
  return sectorOfItem(item) === sector || promotionSectors.includes(sector);
}

/** El pedido lleva algo del sector: según los sectores que informa o, si no los informa, según sus productos. */
export function orderTouchesSector(order: AdminOrder, sector: PreparationSector): boolean {
  if (order.sectors && order.sectors.length > 0) {
    return order.sectors.map((s) => s.toLowerCase()).includes(sector);
  }
  return (order.items ?? []).some((item) => itemTouchesSector(item, sector));
}

export interface SectorCounts {
  total: number;
  pizzeria: number;
  cocina: number;
  barra: number;
}

/** Cuántos pedidos activos hay en total y en cada sector de preparación. */
export function countActiveOrdersBySector(orders: AdminOrder[]): SectorCounts {
  const active = orders.filter((order) => ACTIVE_ORDER_STATUSES.includes(order.status));
  const countFor = (sector: PreparationSector) => active.filter((order) => orderTouchesSector(order, sector)).length;
  return { total: active.length, pizzeria: countFor('pizzeria'), cocina: countFor('cocina'), barra: countFor('barra') };
}

function ordersOfStatus(orders: AdminOrder[], status: OrderStatus, sector: SectorFilter): AdminOrder[] {
  const ofStatus = orders
    .filter((order) => order.status === status)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return sector === 'todos' ? ofStatus : ofStatus.filter((order) => orderTouchesSector(order, sector));
}

function matchesPendingFilter(order: AdminOrder, filter: PendingFilter): boolean {
  return filter === 'ahora' ? !order.scheduled_for : Boolean(order.scheduled_for);
}

export interface ColumnOptions {
  selectedSector: SectorFilter;
  pendingFilter: PendingFilter;
  pages: ColumnPages;
  pageSize: number;
}

/** Las columnas del tablero (una por estado activo) con los pedidos de la página que se está viendo. */
export function buildColumns(orders: AdminOrder[], options: ColumnOptions): BoardColumn[] {
  return ACTIVE_ORDER_STATUSES.map((status) => {
    const ofStatus = ordersOfStatus(orders, status, options.selectedSector);
    // El contador cuenta todos los pedidos del estado; el filtro Ahora/Programados solo afecta la lista.
    const visible =
      status === 'Pendiente' ? ofStatus.filter((order) => matchesPendingFilter(order, options.pendingFilter)) : ofStatus;
    const totalPages = Math.ceil(visible.length / options.pageSize) || 1;
    const currentPage = Math.min(options.pages[status] || 1, totalPages);
    const start = (currentPage - 1) * options.pageSize;
    return {
      status,
      orders: visible.slice(start, start + options.pageSize),
      totalCount: ofStatus.length,
      modifiedCount: ofStatus.filter((order) => order.kitchen_update_pending).length,
      currentPage,
      totalPages,
    };
  });
}

/** Viajes por armar: pedidos a domicilio "En Camino" que todavía no salieron, agrupados por repartidor. */
export function buildTripsToStart(orders: AdminOrder[]): TripsToStart {
  const building = orders.filter(
    (order) => order.status === 'En Camino' && order.delivery_method === 'domicilio' && order.trip_id == null
  );
  const withDriver = building.filter((order) => order.delivery_driver_id != null);
  const byDriver = new Map<number, DriverTrip>();
  withDriver.forEach((order) => {
    const driverId = order.delivery_driver_id as number;
    const trip = byDriver.get(driverId) ?? {
      driverId,
      driverName: order.delivery_driver_name ?? 'Repartidor',
      count: 0,
    };
    byDriver.set(driverId, { ...trip, count: trip.count + 1 });
  });
  return {
    groups: [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName)),
    withoutDriver: building.length - withDriver.length,
  };
}

/** El pedido con sus ítems cambiados y los contadores de preparación al día. */
function withItems(order: AdminOrder, items: WebOrderItem[]): AdminOrder {
  const preparedCount = items.filter((item) => item.is_prepared).length;
  return {
    ...order,
    items,
    items_prepared_count: preparedCount,
    is_all_prepared: items.length > 0 && preparedCount === items.length,
  };
}

/** Marca (o desmarca) un ítem como preparado, sin esperar la respuesta del servidor. */
export function withItemPrepared(order: AdminOrder, itemId: number, isPrepared: boolean): AdminOrder {
  if (!order.items) return order;
  return withItems(order, order.items.map((item) => (item.id === itemId ? { ...item, is_prepared: isPrepared } : item)));
}

/** Marca (o desmarca) como preparados todos los ítems de un sector, sin esperar la respuesta del servidor. */
export function withSectorPrepared(order: AdminOrder, sector: string, isPrepared: boolean): AdminOrder {
  if (!order.items) return order;
  const sectorKey = sector.toLowerCase();
  return withItems(
    order,
    order.items.map((item) => (sectorOfItem(item) === sectorKey ? { ...item, is_prepared: isPrepared } : item))
  );
}

/** El pedido sin cambios salvo el que tiene ese id, que se transforma con `change`. */
export function updateOrder(
  orders: AdminOrder[],
  orderId: number,
  change: (order: AdminOrder) => AdminOrder
): AdminOrder[] {
  return orders.map((order) => (order.id === orderId ? change(order) : order));
}
