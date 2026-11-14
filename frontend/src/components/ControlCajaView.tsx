import { CashHeader } from '@/components/caja/CashHeader';
import { CloseShiftTab } from '@/components/caja/CloseShiftTab';
import { MovementsTab } from '@/components/caja/MovementsTab';
import { OpenShiftPanel } from '@/components/caja/OpenShiftPanel';
import { ShiftDetailModal } from '@/components/caja/ShiftDetailModal';
import { ShiftSummaryCards } from '@/components/caja/ShiftSummaryCards';
import { ShiftsHistoryTable } from '@/components/caja/ShiftsHistoryTable';
import { PanelNote } from '@/components/ui/PanelNote';
import { useCashControl } from '@/hooks/useCashControl';
import type { CashTab } from '@/hooks/useCashControl';
import { useCloseShiftForm, useMovementForm, useOpenShiftForm } from '@/hooks/useCashForms';

const TABS: { key: CashTab; label: (movementsCount: number) => string }[] = [
  { key: 'movimientos', label: (count) => `Movimientos (${count})` },
  { key: 'cierre', label: () => 'Cierre de caja' },
  { key: 'historial', label: () => 'Historial de turnos' },
];

function CashTabs({
  active,
  movementsCount,
  onChange,
}: {
  active: CashTab;
  movementsCount: number;
  onChange: (tab: CashTab) => void;
}) {
  return (
    <div className="flex bg-white rounded-2xl shadow-xs border border-gray-100 px-2 gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition -mb-px ${
            active === tab.key ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          {tab.label(movementsCount)}
        </button>
      ))}
    </div>
  );
}

export function ControlCajaView() {
  const cash = useCashControl();
  const openForm = useOpenShiftForm();
  const movementForm = useMovementForm();
  const closeForm = useCloseShiftForm();

  const handleDeleteMovement = async (id: number) => {
    if (!window.confirm('¿Seguro que querés anular este movimiento de caja?')) return;
    await cash.deleteMovement(id);
  };

  if (cash.loading) {
    return <PanelNote>Cargando control de caja...</PanelNote>;
  }

  const history = (title: string) => (
    <ShiftsHistoryTable
      title={title}
      items={cash.historyItems}
      loading={cash.loadingHistory}
      onViewDetail={cash.viewShiftDetail}
      loadingDetailId={cash.loadingDetailId}
    />
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <CashHeader
        isOpen={cash.isOpen}
        error={cash.error}
        onRefresh={cash.refresh}
        onDismissError={() => cash.setError(null)}
      />

      {!cash.isOpen && (
        <div className="space-y-6">
          <OpenShiftPanel form={openForm} onInvalid={cash.setError} onOpen={cash.openShift} />
          <div className="mt-8">{history('Historial de turnos anteriores')}</div>
        </div>
      )}

      {cash.isOpen && cash.currentShift && (
        <div className="space-y-6">
          <ShiftSummaryCards shift={cash.currentShift} onAddMovement={cash.addMovement} />
          <CashTabs
            active={cash.activeTab}
            movementsCount={
              (cash.currentShift.movements?.length ?? 0) +
              (cash.currentShift.orders?.filter((o) => o.is_billable).length ?? 0)
            }
            onChange={cash.setActiveTab}
          />
          {cash.activeTab === 'movimientos' && (
            <MovementsTab
              form={movementForm}
              onInvalid={cash.setError}
              onAdd={cash.addMovement}
              movements={cash.currentShift.movements ?? []}
              orders={cash.currentShift.orders ?? []}
              onDelete={handleDeleteMovement}
            />
          )}
          {cash.activeTab === 'cierre' && (
            <CloseShiftTab
              form={closeForm}
              expectedCash={cash.currentShift.summary?.expected_cash ?? 0}
              onClose={cash.closeShift}
            />
          )}
          {cash.activeTab === 'historial' && history('Historial de turnos de caja')}
        </div>
      )}

      {cash.selectedShiftDetail && (
        <ShiftDetailModal shift={cash.selectedShiftDetail} onClose={cash.closeShiftDetail} />
      )}
    </div>
  );
}
