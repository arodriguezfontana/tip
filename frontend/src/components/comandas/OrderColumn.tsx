import type { ComponentProps } from 'react';
import { ComandaCard } from '@/components/ComandaCard';
import { SECTOR_CONFIG } from '@/types/order';
import type { OrderStatus, SectorFilter } from '@/types/order';
import type { BoardColumn, PendingFilter, TripsToStart } from '@/utils/orderBoard';

const COLUMN_LABELS: Record<OrderStatus, string> = {
  Pendiente: 'Pendientes',
  Confirmado: 'Confirmados',
  'En Camino': 'En Camino',
  'Listo para Retirar': 'Listo para Retirar',
  Finalizado: 'Finalizado',
  Rechazado: 'Rechazado',
  Cancelado: 'Cancelado',
};

const pluralize = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

function ModifiedBadge({ count }: { count: number }) {
  return (
    <span
      title="Pedidos a los que el cliente les agregó productos y cocina todavía no vio"
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
      {pluralize(count, 'modificado', 'modificados')}
    </span>
  );
}

function ColumnHeader({ column }: { column: BoardColumn }) {
  const highlightsCount = column.status === 'Pendiente' && column.totalCount > 0;
  return (
    <div className="shrink-0 flex items-center justify-between pb-3 px-1 border-b border-gray-200/60 mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">{COLUMN_LABELS[column.status]}</h3>
        {column.status === 'Confirmado' && column.modifiedCount > 0 && <ModifiedBadge count={column.modifiedCount} />}
      </div>
      <span
        className={`text-xs font-bold px-2 py-0.5 rounded-full ${highlightsCount ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-800'}`}
      >
        {column.totalCount}
      </span>
    </div>
  );
}

interface TripsToStartPanelProps {
  trips: TripsToStart;
  dispatchingDriverId: number | null;
  onStartTrip: (driverId: number) => void;
}

/** Repartidores con pedidos armando viaje, para iniciar el viaje de cada uno. */
function TripsToStartPanel({ trips, dispatchingDriverId, onStartTrip }: TripsToStartPanelProps) {
  return (
    <section aria-label="Viajes por armar" className="shrink-0 mb-3 space-y-2">
      {trips.groups.map((group) => (
        <div
          key={group.driverId}
          className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2"
        >
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-bold text-blue-900">{group.driverName}</p>
            <p className="text-[11px] text-blue-700">
              {group.count} {group.count === 1 ? 'pedido armando viaje' : 'pedidos armando viaje'}
            </p>
          </div>
          <button
            type="button"
            disabled={dispatchingDriverId !== null}
            onClick={() => onStartTrip(group.driverId)}
            aria-label={`Iniciar viaje de ${group.driverName}`}
            className="shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {dispatchingDriverId === group.driverId ? 'Calculando ruta...' : 'Iniciar viaje'}
          </button>
        </div>
      ))}
      {trips.withoutDriver > 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          {trips.withoutDriver} {trips.withoutDriver === 1 ? 'pedido sin repartidor' : 'pedidos sin repartidor'}:
          asignale uno desde su tarjeta para armar el viaje.
        </p>
      )}
    </section>
  );
}

function PendingFilterTabs({ value, onChange }: { value: PendingFilter; onChange: (filter: PendingFilter) => void }) {
  const tabClass = (filter: PendingFilter) =>
    `flex-1 py-1 rounded-lg transition ${value === filter ? 'bg-white text-black font-bold shadow-xs' : 'text-gray-600 hover:text-black'}`;
  return (
    <div className="shrink-0 flex bg-gray-200/70 p-0.5 rounded-xl mb-3 text-[11px] font-medium">
      <button type="button" onClick={() => onChange('ahora')} className={tabClass('ahora')}>
        Ahora
      </button>
      <button type="button" onClick={() => onChange('programados')} className={tabClass('programados')}>
        Programados
      </button>
    </div>
  );
}

function Pagination({ column, onPageChange }: { column: BoardColumn; onPageChange: (page: number) => void }) {
  return (
    <div className="shrink-0 flex items-center justify-between pt-3 mt-3 border-t border-gray-200/60 px-1 text-xs">
      <button
        type="button"
        disabled={column.currentPage === 1}
        onClick={() => onPageChange(column.currentPage - 1)}
        className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
      >
        Anterior
      </button>
      <span className="text-gray-500 font-medium">
        {column.currentPage} de {column.totalPages}
      </span>
      <button
        type="button"
        disabled={column.currentPage === column.totalPages}
        onClick={() => onPageChange(column.currentPage + 1)}
        className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
      >
        Siguiente
      </button>
    </div>
  );
}

/** Lo que reciben las tarjetas de los pedidos: los repartidores y qué hacer con cada acción. */
export type CardProps = Omit<ComponentProps<typeof ComandaCard>, 'order'>;

/** Qué decir en una columna sin pedidos: según haya una búsqueda o un sector elegido. */
function emptyColumnMessage(selectedSector: SectorFilter, searchTerm: string): string {
  if (searchTerm) return 'Sin coincidencias';
  return selectedSector === 'todos' ? 'Sin pedidos' : `Sin pedidos para ${SECTOR_CONFIG[selectedSector].label}`;
}

interface OrderColumnProps {
  column: BoardColumn;
  selectedSector: SectorFilter;
  searchTerm: string;
  pendingFilter: PendingFilter;
  onPendingFilterChange: (filter: PendingFilter) => void;
  tripsToStart: TripsToStart;
  dispatchingDriverId: number | null;
  onStartTrip: (driverId: number) => void;
  onPageChange: (page: number) => void;
  cardProps: CardProps;
}

/** Una columna del tablero: los pedidos de un estado, de a una página. */
export function OrderColumn({
  column,
  selectedSector,
  searchTerm,
  pendingFilter,
  onPendingFilterChange,
  tripsToStart,
  dispatchingDriverId,
  onStartTrip,
  onPageChange,
  cardProps,
}: OrderColumnProps) {
  const hasTripsToStart = tripsToStart.groups.length > 0 || tripsToStart.withoutDriver > 0;
  const emptyMessage = emptyColumnMessage(selectedSector, searchTerm);
  return (
    <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100 flex flex-col lg:min-h-0">
      <ColumnHeader column={column} />

      {column.status === 'En Camino' && hasTripsToStart && (
        <TripsToStartPanel trips={tripsToStart} dispatchingDriverId={dispatchingDriverId} onStartTrip={onStartTrip} />
      )}

      {column.status === 'Pendiente' && <PendingFilterTabs value={pendingFilter} onChange={onPendingFilterChange} />}

      <div className="space-y-3 min-h-[220px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {column.orders.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-12">{emptyMessage}</p>
        ) : (
          column.orders.map((order) => <ComandaCard key={order.id} order={order} {...cardProps} />)
        )}
      </div>

      {column.totalPages > 1 && <Pagination column={column} onPageChange={onPageChange} />}
    </div>
  );
}
