import { useCallback, useEffect, useState } from 'react';
import {
  addCashMovement,
  closeCashShift,
  deleteCashMovement,
  fetchCashShiftDetail,
  fetchCashShiftsHistory,
  fetchCurrentCashShift,
  openCashShift,
} from '@/services/cashShiftService';
import type {
  CashMovement,
  CashShift,
  CashShiftDetail,
  DifferenceType,
  MovementType,
} from '@/types/cashShift';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errors';
import { CashIcon, ClockIcon } from '@/components/Icons';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

const CATEGORY_SUGGESTIONS = [
  'Pago a proveedor',
  'Adelanto de sueldo',
  'Compra de insumos',
  'Retiro de efectivo',
  'Aporte de cambio',
  'Otro',
];

export function ControlCajaView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<CashShiftDetail | null>(null);

  // Tabs: 'movimientos' | 'cierre' | 'historial'
  const [activeTab, setActiveTab] = useState<'movimientos' | 'cierre' | 'historial'>('movimientos');

  // Formulario apertura
  const [openInitialAmount, setOpenInitialAmount] = useState<string>('');
  const [openNotes, setOpenNotes] = useState('');
  const [opening, setOpening] = useState(false);

  // Formulario movimiento manual
  const [movType, setMovType] = useState<MovementType>('egreso');
  const [movAmount, setMovAmount] = useState<string>('');
  const [movCategory, setMovCategory] = useState<string>('Pago a proveedor');
  const [movCustomCategory, setMovCustomCategory] = useState<string>('');
  const [movDescription, setMovDescription] = useState<string>('');
  const [savingMovement, setSavingMovement] = useState(false);

  // Formulario cierre
  const [closeFinalAmount, setCloseFinalAmount] = useState<string>('');
  const [closeNotes, setCloseNotes] = useState<string>('');
  const [closing, setClosing] = useState(false);
  const [confirmCloseModal, setConfirmCloseModal] = useState(false);

  // Historial y detalle
  const [historyItems, setHistoryItems] = useState<CashShift[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedShiftDetail, setSelectedShiftDetail] = useState<CashShiftDetail | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<number | null>(null);

  const loadCurrentShift = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchCurrentCashShift();
      setIsOpen(res.is_open);
      setCurrentShift(res.shift);
      if (!res.is_open) {
        setActiveTab('historial');
      } else {
        setActiveTab((prev) => (prev === 'historial' ? 'movimientos' : prev));
      }
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el estado de la caja.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchCashShiftsHistory(30, 0);
      setHistoryItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el historial de turnos.'));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCurrentCashShift(), fetchCashShiftsHistory(30, 0)])
      .then(([currentRes, historyRes]) => {
        if (!active) return;
        setIsOpen(currentRes.is_open);
        setCurrentShift(currentRes.shift);
        if (!currentRes.is_open) {
          setActiveTab('historial');
        } else {
          setActiveTab('movimientos');
        }
        setHistoryItems(historyRes.items);
      })
      .catch((err) => {
        if (!active) return;
        setError(getErrorMessage(err, 'No se pudo cargar el estado de la caja.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openInitialAmount);
    if (isNaN(amount) || amount < 0) {
      setError('El monto inicial debe ser un número mayor o igual a 0.');
      return;
    }
    try {
      setOpening(true);
      setError(null);
      await openCashShift({ initial_amount: amount, notes: openNotes.trim() || undefined });
      setOpenInitialAmount('');
      setOpenNotes('');
      await loadCurrentShift();
      await loadHistory();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo abrir el turno de caja.'));
    } finally {
      setOpening(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(movAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('El monto del movimiento debe ser mayor a 0.');
      return;
    }
    const finalCategory = movCategory === 'Otro' ? movCustomCategory.trim() : movCategory;
    if (!finalCategory) {
      setError('Debés indicar una categoría para el movimiento.');
      return;
    }
    try {
      setSavingMovement(true);
      setError(null);
      await addCashMovement({
        type: movType,
        amount,
        category: finalCategory,
        description: movDescription.trim() || undefined,
      });
      setMovAmount('');
      setMovDescription('');
      if (movCategory === 'Otro') setMovCustomCategory('');
      await loadCurrentShift();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo registrar el movimiento.'));
    } finally {
      setSavingMovement(false);
    }
  };

  const handleDeleteMovement = async (id: number) => {
    if (!window.confirm('¿Seguro que querés anular este movimiento de caja?')) return;
    try {
      setError(null);
      await deleteCashMovement(id);
      await loadCurrentShift();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo anular el movimiento.'));
    }
  };

  const handleCloseShift = async () => {
    const finalAmt = parseFloat(closeFinalAmount);
    if (isNaN(finalAmt) || finalAmt < 0) {
      setError('El monto real contado debe ser mayor o igual a 0.');
      return;
    }
    try {
      setClosing(true);
      setError(null);
      await closeCashShift({
        final_amount: finalAmt,
        notes: closeNotes.trim() || undefined,
      });
      setConfirmCloseModal(false);
      setCloseFinalAmount('');
      setCloseNotes('');
      await loadCurrentShift();
      await loadHistory();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cerrar el turno de caja.'));
    } finally {
      setClosing(false);
    }
  };

  const handleViewDetail = async (shiftId: number) => {
    try {
      setLoadingDetailId(shiftId);
      const detail = await fetchCashShiftDetail(shiftId);
      setSelectedShiftDetail(detail);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el detalle del turno.'));
    } finally {
      setLoadingDetailId(null);
    }
  };

  const summary = currentShift?.summary;
  const expectedCash = summary?.expected_cash ?? 0;
  const parsedCloseAmount = parseFloat(closeFinalAmount);
  const hasValidCloseAmount = !isNaN(parsedCloseAmount) && parsedCloseAmount >= 0;
  const diffClose = hasValidCloseAmount ? parsedCloseAmount - expectedCash : null;
  const diffTypeClose: DifferenceType | null =
    diffClose === null ? null : diffClose > 0.005 ? 'sobrante' : diffClose < -0.005 ? 'faltante' : 'exacta';

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-gray-500 font-medium">Cargando control de caja...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de caja</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestión de turnos de caja y movimientos de efectivo en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isOpen ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Caja abierta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Caja cerrada
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              loadCurrentShift();
              loadHistory();
            }}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Si la caja está cerrada */}
      {!isOpen && (
        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-amber-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold">La caja no está abierta actualmente</h2>
              <p className="text-sm text-amber-800">
                El sistema requiere tener un turno de caja abierto para poder tomar y facturar pedidos presenciales en mostrador o registrar cobros.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-xl mx-auto">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-5">
              <div className="p-2.5 rounded-xl bg-gray-100 text-gray-800">
                <CashIcon className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Apertura de turno de caja</h2>
                <p className="text-xs text-gray-500">Ingresá el fondo inicial en efectivo para iniciar el turno.</p>
              </div>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label htmlFor="open-initial-amount" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Fondo de caja inicial ($) *
                </label>
                <input
                  id="open-initial-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={openInitialAmount}
                  onChange={(e) => setOpenInitialAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-base font-medium focus:ring-2 focus:ring-black focus:border-black transition"
                />
              </div>

              <div>
                <label htmlFor="open-notes" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Observaciones de apertura (opcional)
                </label>
                <textarea
                  id="open-notes"
                  rows={2}
                  placeholder="Ej. Billetes de cambio chicos, cambio inicial entregado por encargado..."
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                />
              </div>

              <button
                type="submit"
                disabled={opening}
                className="w-full py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition disabled:opacity-50"
              >
                {opening ? 'Abriendo caja...' : 'Abrir caja e iniciar turno'}
              </button>
            </form>
          </div>

          {/* Historial rápido de turnos pasados */}
          <div className="mt-8">
            <h2 className="text-base font-bold text-gray-900 mb-3">Historial de turnos anteriores</h2>
            <ShiftsHistoryTable
              items={historyItems}
              loading={loadingHistory}
              onViewDetail={handleViewDetail}
              loadingDetailId={loadingDetailId}
            />
          </div>
        </div>
      )}

      {/* Si la caja está abierta */}
      {isOpen && currentShift && (
        <div className="space-y-6">
          {/* Banner datos del turno actual */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600">
            <div>
              <span className="font-semibold text-gray-900">Turno iniciado: </span>
              {formatDateTime(currentShift.opened_at)}
              {currentShift.opened_by_name && (
                <span className="ml-2 text-gray-500">por {currentShift.opened_by_name}</span>
              )}
            </div>
            {currentShift.notes && (
              <div className="italic text-gray-500 max-w-md truncate">
                Nota: &ldquo;{currentShift.notes}&rdquo;
              </div>
            )}
          </div>

          {/* KPI Cards: Resumen de dinero físico */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Fondo inicial</span>
              <span className="text-lg md:text-xl font-bold text-gray-900 mt-2">
                {formatCurrency(summary?.initial_amount ?? 0)}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Ventas en efectivo</span>
              <span className="text-lg md:text-xl font-bold text-emerald-600 mt-2">
                +{formatCurrency(summary?.cash_sales ?? 0)}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Ingresos manuales</span>
              <span className="text-lg md:text-xl font-bold text-emerald-600 mt-2">
                +{formatCurrency(summary?.manual_income ?? 0)}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Egresos manuales</span>
              <span className="text-lg md:text-xl font-bold text-rose-600 mt-2">
                -{formatCurrency(summary?.manual_expense ?? 0)}
              </span>
            </div>

            <div className="col-span-2 md:col-span-1 bg-zinc-900 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Caja teórica esperada</span>
              <span className="text-xl md:text-2xl font-black text-white mt-2">
                {formatCurrency(summary?.expected_cash ?? 0)}
              </span>
            </div>
          </div>

          {/* Facturación Digital y Total (separado del conteo físico) */}
          <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Ventas digitales del turno (no ingresan en caja física)
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
                <span>
                  MercadoPago: <strong className="text-gray-900">{formatCurrency(summary?.mercadopago_sales ?? 0)}</strong>
                </span>
                <span>·</span>
                <span>
                  Transferencia: <strong className="text-gray-900">{formatCurrency(summary?.transferencia_sales ?? 0)}</strong>
                </span>
                <span>·</span>
                <span>
                  Tarjeta: <strong className="text-gray-900">{formatCurrency(summary?.tarjeta_sales ?? 0)}</strong>
                </span>
                {Boolean(summary?.other_digital_sales) && (
                  <>
                    <span>·</span>
                    <span>
                      Otros digitales: <strong className="text-gray-900">{formatCurrency(summary?.other_digital_sales ?? 0)}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-6 shrink-0">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total digital</div>
                <div className="text-sm font-bold text-gray-900">{formatCurrency(summary?.total_digital_sales ?? 0)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total facturado</div>
                <div className="text-base font-extrabold text-gray-900">{formatCurrency(summary?.total_sales ?? 0)}</div>
              </div>
            </div>
          </div>

          {/* Pestañas de Navegación de Caja Abierta */}
          <div className="flex border-b border-gray-200 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('movimientos')}
              className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition -mb-px ${
                activeTab === 'movimientos'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Movimientos de caja ({currentShift.movements?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cierre')}
              className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition -mb-px ${
                activeTab === 'cierre'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Cierre de caja
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('historial')}
              className={`py-2.5 px-4 font-semibold text-sm border-b-2 transition -mb-px ${
                activeTab === 'historial'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              Historial de turnos
            </button>
          </div>

          {/* Tab 1: Movimientos */}
          {activeTab === 'movimientos' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Formulario de movimiento */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Registrar movimiento manual</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Asentá entradas o salidas de efectivo no vinculadas a pedidos.
                  </p>
                </div>

                <form onSubmit={handleAddMovement} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Tipo de movimiento
                    </label>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={movType === 'ingreso'}
                        onClick={() => setMovType('ingreso')}
                        className={`py-2 text-xs font-bold rounded-xl border transition ${
                          movType === 'ingreso'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        + Ingreso
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={movType === 'egreso'}
                        onClick={() => setMovType('egreso')}
                        className={`py-2 text-xs font-bold rounded-xl border transition ${
                          movType === 'egreso'
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        − Egreso
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="mov-amount" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Monto ($) *
                    </label>
                    <input
                      id="mov-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={movAmount}
                      onChange={(e) => setMovAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm font-medium focus:ring-2 focus:ring-black focus:border-black transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="mov-category" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Categoría *
                    </label>
                    <select
                      id="mov-category"
                      value={movCategory}
                      onChange={(e) => setMovCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                    >
                      {CATEGORY_SUGGESTIONS.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    {movCategory === 'Otro' && (
                      <input
                        type="text"
                        placeholder="Escribí el motivo o categoría..."
                        required
                        value={movCustomCategory}
                        onChange={(e) => setMovCustomCategory(e.target.value)}
                        className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                      />
                    )}
                  </div>

                  <div>
                    <label htmlFor="mov-description" className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                      Observaciones / Detalle (opcional)
                    </label>
                    <input
                      id="mov-description"
                      type="text"
                      placeholder="Ej. Factura N° 1234, proveedor de verduras..."
                      value={movDescription}
                      onChange={(e) => setMovDescription(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingMovement}
                    className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {savingMovement ? 'Guardando...' : 'Asentar movimiento'}
                  </button>
                </form>
              </div>

              {/* Lista de movimientos */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Movimientos de este turno</h2>
                {(!currentShift.movements || currentShift.movements.length === 0) ? (
                  <p className="text-sm text-gray-400 text-center py-12 border border-dashed border-gray-200 rounded-xl">
                    No hay movimientos manuales registrados en este turno.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider">
                          <th className="py-2.5 px-2">Hora</th>
                          <th className="py-2.5 px-2">Tipo</th>
                          <th className="py-2.5 px-2">Categoría</th>
                          <th className="py-2.5 px-2">Detalle</th>
                          <th className="py-2.5 px-2 text-right">Monto</th>
                          <th className="py-2.5 px-2 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {currentShift.movements.map((m) => (
                          <tr key={m.id} className="hover:bg-gray-50 transition">
                            <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">
                              {formatTime(m.created_at)}
                            </td>
                            <td className="py-2.5 px-2">
                              {m.type === 'ingreso' ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  Ingreso
                                </span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                  Egreso
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 font-semibold text-gray-900">{m.category}</td>
                            <td className="py-2.5 px-2 text-gray-600 max-w-xs truncate">{m.description || '-'}</td>
                            <td
                              className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${
                                m.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {m.type === 'ingreso' ? '+' : '-'}
                              {formatCurrency(m.amount)}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteMovement(m.id)}
                                title="Anular movimiento"
                                className="text-gray-400 hover:text-red-600 font-bold p-1 transition"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Cierre de caja */}
          {activeTab === 'cierre' && (
            <div className="max-w-xl mx-auto bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-bold text-gray-900">Arqueo y cierre de caja</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Contá los billetes físicos en el cajón e ingresá el monto real. El sistema detectará automáticamente si hay sobrante o faltante.
                </p>
              </div>

              {/* Comparador de arqueo */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Caja teórica esperada:</span>
                  <span className="font-extrabold text-gray-900 text-base">{formatCurrency(expectedCash)}</span>
                </div>

                <div>
                  <label htmlFor="close-final-amount" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Monto real contado en efectivo ($) *
                  </label>
                  <input
                    id="close-final-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={closeFinalAmount}
                    onChange={(e) => setCloseFinalAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-black focus:border-black transition"
                  />
                </div>

                {hasValidCloseAmount && diffClose !== null && diffTypeClose && (
                  <div
                    className={`p-3.5 rounded-xl text-sm font-semibold flex items-center justify-between border ${
                      diffTypeClose === 'sobrante'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : diffTypeClose === 'faltante'
                        ? 'bg-rose-50 text-rose-900 border-rose-200'
                        : 'bg-blue-50 text-blue-900 border-blue-200'
                    }`}
                  >
                    <span>
                      {diffTypeClose === 'sobrante' && 'Sobrante detectado:'}
                      {diffTypeClose === 'faltante' && 'Faltante detectado:'}
                      {diffTypeClose === 'exacta' && 'Caja exacta:'}
                    </span>
                    <span className="text-base font-extrabold">
                      {diffTypeClose === 'sobrante' && `+${formatCurrency(diffClose)}`}
                      {diffTypeClose === 'faltante' && formatCurrency(diffClose)}
                      {diffTypeClose === 'exacta' && '$ 0.00'}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="close-notes" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Observaciones de cierre (opcional)
                </label>
                <textarea
                  id="close-notes"
                  rows={2}
                  placeholder="Justificación de diferencias, novedades del turno, retiros finales..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
                <strong>Inmutabilidad del turno:</strong> Al cerrar la caja, este turno quedará bloqueado y sellado. Ya no se podrán agregar pedidos, anular ni modificar cobros en este lapso.
              </div>

              <button
                type="button"
                disabled={!hasValidCloseAmount || closing}
                onClick={() => setConfirmCloseModal(true)}
                className="w-full py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition disabled:opacity-50"
              >
                Cerrar turno de caja
              </button>
            </div>
          )}

          {/* Tab 3: Historial */}
          {activeTab === 'historial' && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900">Historial de turnos de caja</h2>
              <ShiftsHistoryTable
                items={historyItems}
                loading={loadingHistory}
                onViewDetail={handleViewDetail}
                loadingDetailId={loadingDetailId}
              />
            </div>
          )}
        </div>
      )}

      {/* Modal de confirmación de cierre */}
      {confirmCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">¿Confirmás el cierre de la caja?</h3>
            <p className="text-sm text-gray-600">
              Monto real declarado: <strong>{formatCurrency(parsedCloseAmount)}</strong>
              <br />
              {diffTypeClose === 'sobrante' && (
                <span className="text-emerald-700 font-semibold">
                  Se registrará un sobrante de +{formatCurrency(diffClose || 0)}.
                </span>
              )}
              {diffTypeClose === 'faltante' && (
                <span className="text-rose-700 font-semibold">
                  Se registrará un faltante de {formatCurrency(diffClose || 0)}.
                </span>
              )}
              {diffTypeClose === 'exacta' && (
                <span className="text-blue-700 font-semibold">La caja cierra de manera exacta.</span>
              )}
            </p>
            <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Esta acción no se puede deshacer. Los pedidos y movimientos de este turno quedarán sellados.
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                disabled={closing}
                onClick={() => setConfirmCloseModal(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={handleCloseShift}
                className="px-5 py-2 rounded-xl bg-black text-white text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50"
              >
                {closing ? 'Cerrando...' : 'Sí, cerrar turno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle de turno histórico */}
      {selectedShiftDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Detalle del turno #{selectedShiftDetail.id}</h3>
                <p className="text-xs text-gray-500">
                  {formatDateTime(selectedShiftDetail.opened_at)} al {formatDateTime(selectedShiftDetail.closed_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedShiftDetail(null)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Fondo inicial</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatCurrency(selectedShiftDetail.initial_amount)}
                </span>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Caja teórica</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatCurrency(selectedShiftDetail.expected_amount ?? 0)}
                </span>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Monto real contado</span>
                <span className="text-sm font-bold text-gray-900">
                  {formatCurrency(selectedShiftDetail.final_amount ?? 0)}
                </span>
              </div>
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <span className="text-gray-500 block">Diferencia</span>
                <span
                  className={`text-sm font-bold ${
                    (selectedShiftDetail.difference ?? 0) > 0
                      ? 'text-emerald-600'
                      : (selectedShiftDetail.difference ?? 0) < 0
                      ? 'text-rose-600'
                      : 'text-gray-900'
                  }`}
                >
                  {(selectedShiftDetail.difference ?? 0) > 0 && '+'}
                  {formatCurrency(selectedShiftDetail.difference ?? 0)}
                </span>
              </div>
            </div>

            {selectedShiftDetail.notes && (
              <div className="text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 text-gray-700">
                <strong>Observaciones:</strong> {selectedShiftDetail.notes}
              </div>
            )}

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                Movimientos del turno ({selectedShiftDetail.movements?.length ?? 0})
              </h4>
              {(!selectedShiftDetail.movements || selectedShiftDetail.movements.length === 0) ? (
                <p className="text-xs text-gray-400 py-4 text-center border border-dashed rounded-xl">
                  No se registraron movimientos manuales en este turno.
                </p>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
                      <tr>
                        <th className="py-2 px-3">Hora</th>
                        <th className="py-2 px-3">Tipo</th>
                        <th className="py-2 px-3">Categoría</th>
                        <th className="py-2 px-3">Detalle</th>
                        <th className="py-2 px-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedShiftDetail.movements.map((m: CashMovement) => (
                        <tr key={m.id}>
                          <td className="py-2 px-3 text-gray-500">{formatTime(m.created_at)}</td>
                          <td className="py-2 px-3 font-semibold">
                            {m.type === 'ingreso' ? (
                              <span className="text-emerald-700">Ingreso</span>
                            ) : (
                              <span className="text-rose-700">Egreso</span>
                            )}
                          </td>
                          <td className="py-2 px-3">{m.category}</td>
                          <td className="py-2 px-3 text-gray-600">{m.description || '-'}</td>
                          <td
                            className={`py-2 px-3 text-right font-bold ${
                              m.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {m.type === 'ingreso' ? '+' : '-'}
                            {formatCurrency(m.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedShiftDetail(null)}
                className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftsHistoryTable({
  items,
  loading,
  onViewDetail,
  loadingDetailId,
}: {
  items: CashShift[];
  loading: boolean;
  onViewDetail: (id: number) => void;
  loadingDetailId: number | null;
}) {
  if (loading) {
    return <div className="text-xs text-gray-500 py-6 text-center">Cargando historial de turnos...</div>;
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        No hay turnos de caja registrados aún.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider">
              <th className="py-3 px-3">Turno</th>
              <th className="py-3 px-3">Apertura</th>
              <th className="py-3 px-3">Cierre</th>
              <th className="py-3 px-3 text-right">Fondo inicial</th>
              <th className="py-3 px-3 text-right">Caja teórica</th>
              <th className="py-3 px-3 text-right">Monto real</th>
              <th className="py-3 px-3 text-center">Diferencia</th>
              <th className="py-3 px-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((shift) => (
              <tr key={shift.id} className="hover:bg-gray-50 transition">
                <td className="py-3 px-3 font-bold text-gray-900">#{shift.id}</td>
                <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span>{formatDateTime(shift.opened_at)}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
                  {shift.status === 'abierta' ? (
                    <span className="text-emerald-600 font-bold">En curso</span>
                  ) : (
                    formatDateTime(shift.closed_at)
                  )}
                </td>
                <td className="py-3 px-3 text-right font-medium text-gray-700">
                  {formatCurrency(shift.initial_amount)}
                </td>
                <td className="py-3 px-3 text-right font-medium text-gray-900">
                  {shift.expected_amount !== null && shift.expected_amount !== undefined
                    ? formatCurrency(shift.expected_amount)
                    : '-'}
                </td>
                <td className="py-3 px-3 text-right font-bold text-gray-900">
                  {shift.final_amount !== null && shift.final_amount !== undefined
                    ? formatCurrency(shift.final_amount)
                    : '-'}
                </td>
                <td className="py-3 px-3 text-center whitespace-nowrap">
                  {shift.difference_type ? (
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        shift.difference_type === 'sobrante'
                          ? 'bg-emerald-100 text-emerald-800'
                          : shift.difference_type === 'faltante'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {shift.difference_type === 'sobrante' && `+${formatCurrency(shift.difference ?? 0)}`}
                      {shift.difference_type === 'faltante' && formatCurrency(shift.difference ?? 0)}
                      {shift.difference_type === 'exacta' && 'Exacta'}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="py-3 px-3 text-center">
                  <button
                    type="button"
                    disabled={loadingDetailId === shift.id}
                    onClick={() => onViewDetail(shift.id)}
                    className="text-xs font-semibold text-gray-700 hover:text-black underline transition disabled:opacity-50"
                  >
                    {loadingDetailId === shift.id ? '...' : 'Ver detalle'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
