import { useCallback, useEffect, useMemo, useState } from 'react';
import { ACTIVE_ORDER_STATUSES, FINISHED_ORDER_STATUSES, SECTOR_CONFIG } from '@/types/order';
import type { AdminOrder, OrderStatus, PreparationSector, SectorFilter } from '@/types/order';
import type { DeliveryDriver } from '@/types/deliveryDriver';
import {
  assignDeliveryDriver,
  fetchOrders,
  updateOrderItemPrepared,
  updateOrderPayment,
  updateOrderSectorPrepared,
  updateOrderStatus,
} from '@/services/orderService';
import { fetchDeliveryDrivers } from '@/services/deliveryDriverService';
import { ComandaCard } from '@/components/ComandaCard';
import { OrderDetailModal } from '@/components/OrderDetailModal';
import { generarMockOrders } from '@/utils/mockOrdenes';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import { getThemeOption, type ThemeColor } from '@/types/storeConfig';

const POLL_INTERVAL_MS = 10000;

const COLUMN_LABELS: Record<OrderStatus, string> = {
  Pendiente: 'Pendientes',
  Confirmado: 'Confirmados',
  'En Camino': 'En Camino',
  'Listo para Retirar': 'Listo para Retirar',
  Finalizado: 'Finalizado',
  Rechazado: 'Rechazado',
  Cancelado: 'Cancelado',
};

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />}
    </svg>
  );
}

interface ComandasBoardProps {
  /** Acceso rápido a la sección para cargar pedidos presenciales. */
  onTakeOrder?: () => void;
  themeColor?: ThemeColor;
}

export function ComandasBoard({ onTakeOrder, themeColor }: ComandasBoardProps) {
  const themeHex = themeColor ? getThemeOption(themeColor).hex : undefined;
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [activeDrivers, setActiveDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [pageSize, setPageSize] = useState<number>(5);
  const [pages, setPages] = useState<Record<string, number>>({
    Pendiente: 1,
    Confirmado: 1,
    'En Camino': 1,
    'Listo para Retirar': 1,
  });

  const [pendingFilter, setPendingFilter] = useState<'ahora' | 'programados'>('ahora');
  const [selectedSector, setSelectedSector] = useState<SectorFilter>(() => {
    try {
      const saved = localStorage.getItem('resto_comandas_sector') as SectorFilter | null;
      if (saved && (saved === 'todos' || saved === 'pizzeria' || saved === 'cocina' || saved === 'barra')) {
        return saved;
      }
    } catch {
      // Ignorar restricciones de almacenamiento local
    }
    return 'todos';
  });

  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const closeDetail = useCallback(() => setDetailOrderId(null), []);

  useEffect(() => {
    if (isSimulating) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [ordersData, driversData] = await Promise.all([
          fetchOrders({ status: ACTIVE_ORDER_STATUSES }),
          fetchDeliveryDrivers({ active_only: true }).catch(() => [] as DeliveryDriver[]),
        ]);
        if (!cancelled) {
          setOrders(ordersData);
          setActiveDrivers(driversData);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('No se pudieron cargar las comandas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isSimulating]);

  const handleToggleSimulation = () => {
    if (isSimulating) {
      setIsSimulating(false);
    } else {
      setOrders(generarMockOrders(55));
      setActiveDrivers([
        { id: 1, name: 'Juan Repartidor', phone: '11 4444-1111', is_active: true, created_at: '', updated_at: '' },
        { id: 2, name: 'Marcos Envíos', phone: '11 4444-2222', is_active: true, created_at: '', updated_at: '' },
      ]);
      setIsSimulating(true);
      setError(null);
    }
  };

  const handleSectorChange = (newSector: SectorFilter) => {
    setSelectedSector(newSector);
    try {
      localStorage.setItem('resto_comandas_sector', newSector);
    } catch {
      // Ignorar restricciones de almacenamiento local
    }
    setPages({
      Pendiente: 1,
      Confirmado: 1,
      'En Camino': 1,
      'Listo para Retirar': 1,
    });
  };

  // Conteo de pedidos activos por sector
  const { totalActiveOrders, pizzeriaCount, cocinaCount, barraCount } = useMemo(() => {
    const active = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
    const total = active.length;

    const countFor = (sec: PreparationSector) =>
      active.filter((o) => {
        if (o.sectors && o.sectors.length > 0) {
          return o.sectors.map((s) => s.toLowerCase()).includes(sec);
        }
        if (o.items && o.items.length > 0) {
          return o.items.some((i) => (i.sector?.toLowerCase() || 'cocina') === sec);
        }
        return false;
      }).length;

    return {
      totalActiveOrders: total,
      pizzeriaCount: countFor('pizzeria'),
      cocinaCount: countFor('cocina'),
      barraCount: countFor('barra'),
    };
  }, [orders]);

  const columns = useMemo(() => {
    return ACTIVE_ORDER_STATUSES.map((status) => {
      let allOrdersForStatus = orders
        .filter((order) => order.status === status)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      // Filtrado por sector si no es 'todos'
      if (selectedSector !== 'todos') {
        allOrdersForStatus = allOrdersForStatus.filter((order) => {
          if (order.sectors && order.sectors.length > 0) {
            return order.sectors.map((s) => s.toLowerCase()).includes(selectedSector);
          }
          if (order.items && order.items.length > 0) {
            return order.items.some((item) => (item.sector?.toLowerCase() || 'cocina') === selectedSector);
          }
          return false;
        });
      }

      // El contador cuenta todos los pedidos del estado; el filtro Ahora/Programados solo afecta la lista.
      const totalCount = allOrdersForStatus.length;

      if (status === 'Pendiente') {
        if (pendingFilter === 'ahora') {
          allOrdersForStatus = allOrdersForStatus.filter((o) => !o.scheduled_for);
        } else if (pendingFilter === 'programados') {
          allOrdersForStatus = allOrdersForStatus.filter((o) => o.scheduled_for);
        }
      }

      const currentPage = pages[status] || 1;
      const totalPages = Math.ceil(allOrdersForStatus.length / pageSize) || 1;
      
      const safePage = Math.min(currentPage, totalPages);
      const startIndex = (safePage - 1) * pageSize;
      const paginatedOrders = allOrdersForStatus.slice(startIndex, startIndex + pageSize);

      return {
        status,
        orders: paginatedOrders,
        totalCount,
        currentPage: safePage,
        totalPages,
      };
    });
  }, [orders, pages, pageSize, pendingFilter, selectedSector]);



  // Se busca en la lista para que la ventana refleje el estado actualizado por el sondeo.
  const detailOrder = detailOrderId === null ? null : orders.find((order) => order.id === detailOrderId) ?? null;

  const pendingOrderIds = useMemo(() => {
    return orders.filter((o) => o.status === 'Pendiente').map((o) => o.id);
  }, [orders]);

  const soundAlert = useNewOrderAlert(pendingOrderIds);

  const handlePageChange = (status: string, newPage: number) => {
    setPages((prev) => ({ ...prev, [status]: newPage }));
  };

  const handleStatusChange = async (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => {
    if (isSimulating) {
      setOrders((prev) => {
        const isTerminal = FINISHED_ORDER_STATUSES.includes(newStatus);
        if (isTerminal) {
          return prev.filter((order) => order.id !== orderId);
        }
        return prev.map((order) => (order.id === orderId ? { ...order, status: newStatus, estimated_minutes: estimatedMinutes ?? order.estimated_minutes } : order));
      });
      return;
    }

    try {
      const updated = await updateOrderStatus(orderId, newStatus, estimatedMinutes);
      setOrders((prev) => {
        const isTerminal = FINISHED_ORDER_STATUSES.includes(updated.status);
        if (isTerminal) {
          return prev.filter((order) => order.id !== orderId);
        }
        return prev.map((order) => (order.id === orderId ? updated : order));
      });
      setError(null);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
      setError(message || 'No se pudo actualizar el estado del pedido.');
    }
  };

  const handleAssignDriver = async (orderId: number, driverId: number | null) => {
    if (isSimulating) {
      const driver = activeDrivers.find((d) => d.id === driverId);
      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                delivery_driver_id: driverId,
                delivery_driver_name: driver ? driver.name : null,
              }
            : order
        )
      );
      return;
    }

    try {
      const updated = await assignDeliveryDriver(orderId, driverId);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? updated : order)));
      setError(null);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
      setError(message || 'No se pudo asignar el repartidor.');
    }
  };

  const handleMarkPaid = async (orderId: number, isPaid: boolean = true) => {
    if (isSimulating) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, is_paid: isPaid } : o)));
      return;
    }
    try {
      const updated = await updateOrderPayment(orderId, isPaid);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, is_paid: updated.is_paid } : o)));
      setError(null);
    } catch {
      setError('No se pudo actualizar el estado de pago del pedido.');
    }
  };

  const handleItemPreparedChange = async (orderId: number, itemId: number, isPrepared: boolean) => {
    // Actualización optimista local en memoria
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId || !order.items) return order;
        const updatedItems = order.items.map((item) =>
          item.id === itemId ? { ...item, is_prepared: isPrepared } : item
        );
        const preparedCount = updatedItems.filter((i) => i.is_prepared).length;
        return {
          ...order,
          items: updatedItems,
          items_prepared_count: preparedCount,
          is_all_prepared: updatedItems.length > 0 && preparedCount === updatedItems.length,
        };
      })
    );

    if (isSimulating) return;

    try {
      const updated = await updateOrderItemPrepared(orderId, itemId, isPrepared);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)));
      setError(null);
    } catch {
      setError('No se pudo actualizar el estado de preparación del plato.');
    }
  };

  const handleSectorPrepared = async (orderId: number, sector: string, isPrepared: boolean) => {
    const sectorClean = sector.toLowerCase();
    // Actualización optimista local en memoria
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId || !order.items) return order;
        const updatedItems = order.items.map((item) =>
          (item.sector?.toLowerCase() || 'cocina') === sectorClean ? { ...item, is_prepared: isPrepared } : item
        );
        const preparedCount = updatedItems.filter((i) => i.is_prepared).length;
        return {
          ...order,
          items: updatedItems,
          items_prepared_count: preparedCount,
          is_all_prepared: updatedItems.length > 0 && preparedCount === updatedItems.length,
        };
      })
    );

    if (isSimulating) return;

    try {
      const updated = await updateOrderSectorPrepared(orderId, sector, isPrepared);
      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)));
      setError(null);
    } catch {
      setError(`No se pudo marcar el sector ${sector} como preparado.`);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      {/* Barra superior de controles del tablero */}
      <div className="shrink-0 flex flex-wrap items-center justify-between bg-white px-5 py-3 rounded-2xl shadow-xs border border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${isSimulating ? 'bg-purple-500' : 'bg-amber-500'} animate-pulse`}></span>
          <span className="text-sm font-semibold text-gray-800">
            {isSimulating ? 'Panel de Comandas (Modo Simulación)' : 'Panel de Comandas'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {onTakeOrder && (
            <button
              type="button"
              onClick={onTakeOrder}
              style={themeHex ? { backgroundColor: themeHex } : undefined}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white transition shadow-xs ${
                themeHex ? 'hover:opacity-90' : 'bg-orange-500 hover:bg-orange-600'
              }`}
            >
              <span className="text-sm leading-none">+</span>
              Tomar pedido
            </button>
          )}

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
            <span className="text-xs text-gray-500 font-medium">Ver:</span>
            {[3, 5, 7].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPageSize(size)}
                className={`text-xs px-2 py-0.5 rounded-lg font-bold transition ${pageSize === size ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                {size}
              </button>
            ))}
          </div>

          {/* Herramienta de desarrollo para probar el tablero con muchos pedidos: no se incluye en producción. */}
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={handleToggleSimulation}
              className={`text-xs font-medium px-3 py-1.5 rounded-xl transition shadow-xs ${isSimulating ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}
            >
              {isSimulating ? 'Salir de Simulación' : 'Simular 50 Pedidos'}
            </button>
          )}

          <button
            type="button"
            onClick={soundAlert.toggleEnabled}
            disabled={!soundAlert.audioSupported}
            aria-pressed={soundAlert.enabled}
            aria-label={soundAlert.enabled ? 'Silenciar alerta de nuevos pedidos' : 'Activar alerta de nuevos pedidos'}
            title={soundAlert.enabled ? 'Silenciar alerta de nuevos pedidos' : 'Activar alerta de nuevos pedidos'}
            className={`flex items-center justify-center w-8 h-8 rounded-xl border transition disabled:opacity-40 ${
              soundAlert.enabled ? 'bg-white border-gray-200 text-gray-800 hover:bg-gray-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
            }`}
          >
            <SpeakerIcon muted={!soundAlert.enabled} />
          </button>
        </div>
      </div>

      {/* Pestañas de filtrado por sector de preparación*/}
      <div className="shrink-0 flex items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-2xl shadow-xs border border-gray-100">
        <div className="flex items-center gap-2 overflow-x-auto py-0.5">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1 shrink-0">
            Sector:
          </span>
          <button
            type="button"
            onClick={() => handleSectorChange('todos')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              selectedSector === 'todos'
                ? 'bg-gray-900 text-white shadow-xs'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/80'
            }`}
          >
            <span>🍽️</span>
            <span>Todos</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                selectedSector === 'todos' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {totalActiveOrders}
            </span>
          </button>

          {(['pizzeria', 'cocina', 'barra'] as const).map((secKey) => {
            const meta = SECTOR_CONFIG[secKey];
            const isSelected = selectedSector === secKey;
            const count =
              secKey === 'pizzeria' ? pizzeriaCount : secKey === 'cocina' ? cocinaCount : barraCount;

            return (
              <button
                key={secKey}
                type="button"
                onClick={() => handleSectorChange(secKey)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? meta.activeTabClass
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/80'
                }`}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    isSelected ? 'bg-black/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {selectedSector !== 'todos' && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 shrink-0">
            <span>Filtrado por:</span>
            <span className="font-semibold text-gray-800 flex items-center gap-1">
              <span>{SECTOR_CONFIG[selectedSector].icon}</span>
              <span>{SECTOR_CONFIG[selectedSector].label}</span>
            </span>
            <button
              type="button"
              onClick={() => handleSectorChange('todos')}
              className="text-[11px] text-blue-600 hover:underline font-medium ml-1 cursor-pointer"
            >
              (Ver todos)
            </button>
          </div>
        )}
      </div>

      {!soundAlert.audioSupported && (
        <div className="shrink-0 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          Este navegador no permite reproducir la alerta sonora de nuevos pedidos. Usá una versión actualizada de Chrome, Edge, Firefox o Safari.
        </div>
      )}

      {soundAlert.audioSupported && soundAlert.enabled && soundAlert.audioBlocked && (
        <div role="alert" className="shrink-0 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
          <span>El navegador bloqueó el sonido hasta que interactúes con la página. Habilitalo para escuchar la alerta de nuevos pedidos.</span>
          <button
            type="button"
            onClick={soundAlert.unlockAudio}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition"
          >
            Habilitar sonido
          </button>
        </div>
      )}

      {error && <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {loading && orders.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12">Cargando comandas...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-1 gap-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
          {columns.map((column) => (
            <div key={column.status} className="bg-gray-50/50 rounded-2xl p-3 border border-gray-100 flex flex-col lg:min-h-0">
              <div className="shrink-0 flex items-center justify-between pb-3 px-1 border-b border-gray-200/60 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">{COLUMN_LABELS[column.status]}</h3>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${column.status === 'Pendiente' && column.totalCount > 0 ? 'bg-amber-200 text-amber-900' : 'bg-gray-200 text-gray-800'}`}>
                  {column.totalCount}
                </span>
              </div>

              {column.status === 'Pendiente' && (
                <div className="shrink-0 flex bg-gray-200/70 p-0.5 rounded-xl mb-3 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => { setPendingFilter('ahora'); setPages((prev) => ({ ...prev, Pendiente: 1 })); }}
                    className={`flex-1 py-1 rounded-lg transition ${pendingFilter === 'ahora' ? 'bg-white text-black font-bold shadow-xs' : 'text-gray-600 hover:text-black'}`}
                  >
                    Ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPendingFilter('programados'); setPages((prev) => ({ ...prev, Pendiente: 1 })); }}
                    className={`flex-1 py-1 rounded-lg transition ${pendingFilter === 'programados' ? 'bg-white text-black font-bold shadow-xs' : 'text-gray-600 hover:text-black'}`}
                  >
                    Programados
                  </button>
                </div>
              )}

              <div className="space-y-3 min-h-[220px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                {column.orders.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-12">
                    {selectedSector !== 'todos' ? `Sin pedidos para ${SECTOR_CONFIG[selectedSector].label}` : 'Sin pedidos'}
                  </p>
                ) : (
                  column.orders.map((order) => (
                    <ComandaCard
                      key={order.id}
                      order={order}
                      activeDrivers={activeDrivers}
                      selectedSector={selectedSector}
                      onAssignDriver={handleAssignDriver}
                      onStatusChange={handleStatusChange}
                      onMarkPaid={handleMarkPaid}
                      onItemPreparedChange={handleItemPreparedChange}
                      onSectorPrepared={handleSectorPrepared}
                      onOpenDetail={(selected) => setDetailOrderId(selected.id)}
                    />
                  ))
                )}
              </div>

              {column.totalPages > 1 && (
                <div className="shrink-0 flex items-center justify-between pt-3 mt-3 border-t border-gray-200/60 px-1 text-xs">
                  <button
                    type="button"
                    disabled={column.currentPage === 1}
                    onClick={() => handlePageChange(column.status, column.currentPage - 1)}
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
                    onClick={() => handlePageChange(column.status, column.currentPage + 1)}
                    className="font-semibold text-gray-700 disabled:opacity-30 hover:underline"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {detailOrder && (
        <OrderDetailModal
          key={detailOrder.id}
          order={detailOrder}
          simulated={isSimulating}
          onMarkPaid={handleMarkPaid}
          onCancel={(orderId) => handleStatusChange(orderId, 'Cancelado')}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
