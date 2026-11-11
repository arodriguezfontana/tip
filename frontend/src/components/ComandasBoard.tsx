import { useCallback, useMemo, useState } from 'react';
import { OrderDetailModal } from '@/components/OrderDetailModal';
import { BoardToolbar } from '@/components/comandas/BoardToolbar';
import { OrderColumn } from '@/components/comandas/OrderColumn';
import { SectorTabs } from '@/components/comandas/SectorTabs';
import { SoundAlertNotices } from '@/components/comandas/SoundAlertNotices';
import { UnpaidFinishModal } from '@/components/comandas/UnpaidFinishModal';
import { PanelNote } from '@/components/ui/PanelNote';
import { useBoardActions } from '@/hooks/useBoardActions';
import { useBoardData } from '@/hooks/useBoardData';
import { useBoardFilters } from '@/hooks/useBoardFilters';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import { getThemeOption, type ThemeColor } from '@/types/storeConfig';
import { buildColumns, buildTripsToStart, countActiveOrdersBySector } from '@/utils/orderBoard';
import { generarMockOrders } from '@/utils/mockOrdenes';

const SIMULATED_DRIVERS = [
  { id: 1, name: 'Juan Repartidor', phone: '11 4444-1111', is_active: true, created_at: '', updated_at: '' },
  { id: 2, name: 'Marcos Envíos', phone: '11 4444-2222', is_active: true, created_at: '', updated_at: '' },
];

interface ComandasBoardProps {
  /** Acceso rápido a la sección para cargar pedidos presenciales. */
  onTakeOrder?: () => void;
  themeColor?: ThemeColor;
}

export function ComandasBoard({ onTakeOrder, themeColor }: ComandasBoardProps) {
  const themeHex = themeColor ? getThemeOption(themeColor).hex : undefined;
  const [isSimulating, setIsSimulating] = useState(false);
  const { orders, setOrders, activeDrivers, setActiveDrivers, loading, hasLoaded, error, setError } =
    useBoardData(isSimulating);
  const filters = useBoardFilters();
  const actions = useBoardActions({ orders, activeDrivers, isSimulating, setOrders, setError });

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailOrderId(null), []);
  // Se busca en la lista para que la ventana refleje el estado actualizado por el sondeo.
  const detailOrder = orders.find((order) => order.id === detailOrderId) ?? null;

  // Suena mientras haya pedidos por aceptar y, con otro sonido, confirmados con productos que cocina todavía no vio.
  const pendingOrderIds = useMemo(() => orders.filter((o) => o.status === 'Pendiente').map((o) => o.id), [orders]);
  const modifiedOrderIds = useMemo(
    () => orders.filter((o) => o.status === 'Confirmado' && o.kitchen_update_pending).map((o) => o.id),
    [orders]
  );
  const soundAlert = useNewOrderAlert(pendingOrderIds, undefined, modifiedOrderIds);

  const sectorCounts = useMemo(() => countActiveOrdersBySector(orders), [orders]);
  const columns = useMemo(
    () =>
      buildColumns(orders, {
        selectedSector: filters.selectedSector,
        pendingFilter: filters.pendingFilter,
        pages: filters.pages,
        pageSize: filters.pageSize,
      }),
    [orders, filters.selectedSector, filters.pendingFilter, filters.pages, filters.pageSize]
  );
  // Viajes por armar: pedidos a domicilio "En Camino" que todavía no salieron, agrupados por repartidor.
  const tripsToStart = useMemo(
    () => (isSimulating ? { groups: [], withoutDriver: 0 } : buildTripsToStart(orders)),
    [orders, isSimulating]
  );

  const toggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
      return;
    }
    setOrders(generarMockOrders(55));
    setActiveDrivers(SIMULATED_DRIVERS);
    setIsSimulating(true);
    setError(null);
  };

  const cardProps = {
    activeDrivers,
    selectedSector: filters.selectedSector,
    onAssignDriver: actions.handleAssignDriver,
    onStatusChange: actions.handleStatusChange,
    onMarkPaid: actions.handleMarkPaid,
    onAcknowledgeUpdate: actions.handleAcknowledgeUpdate,
    onItemPreparedChange: actions.handleItemPreparedChange,
    onSectorPrepared: actions.handleSectorPrepared,
    onOpenDetail: (selected: { id: number }) => setDetailOrderId(selected.id),
    simulated: isSimulating,
  };

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      <BoardToolbar
        isSimulating={isSimulating}
        onTakeOrder={onTakeOrder}
        themeHex={themeHex}
        pageSize={filters.pageSize}
        onPageSizeChange={filters.setPageSize}
        onToggleSimulation={toggleSimulation}
        soundEnabled={soundAlert.enabled}
        soundSupported={soundAlert.audioSupported}
        onToggleSound={soundAlert.toggleEnabled}
      />

      <SectorTabs selected={filters.selectedSector} counts={sectorCounts} onChange={filters.changeSector} />

      <SoundAlertNotices
        supported={soundAlert.audioSupported}
        enabled={soundAlert.enabled}
        blocked={soundAlert.audioBlocked}
        onUnlock={soundAlert.unlockAudio}
      />

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && !hasLoaded && orders.length === 0 ? (
        <PanelNote>Cargando comandas...</PanelNote>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-1 gap-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
          {columns.map((column) => (
            <OrderColumn
              key={column.status}
              column={column}
              selectedSector={filters.selectedSector}
              pendingFilter={filters.pendingFilter}
              onPendingFilterChange={filters.changePendingFilter}
              tripsToStart={tripsToStart}
              dispatchingDriverId={actions.dispatchingDriverId}
              onStartTrip={actions.handleStartTrip}
              onPageChange={(page) => filters.changePage(column.status, page)}
              cardProps={cardProps}
            />
          ))}
        </div>
      )}

      {detailOrder && (
        <OrderDetailModal
          key={detailOrder.id}
          order={detailOrder}
          simulated={isSimulating}
          onMarkPaid={actions.handleMarkPaid}
          onAcknowledgeUpdate={actions.handleAcknowledgeUpdate}
          onCancel={(orderId) => actions.handleStatusChange(orderId, 'Cancelado')}
          onClose={closeDetail}
        />
      )}

      {actions.unpaidToFinish && (
        <UnpaidFinishModal
          order={actions.unpaidToFinish}
          saving={actions.finishingUnpaid}
          onConfirm={actions.handlePayAndFinish}
          onCancel={actions.dismissUnpaidToFinish}
        />
      )}
    </div>
  );
}
