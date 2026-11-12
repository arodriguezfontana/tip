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
import type { CashShift, CashShiftDetail, CreateCashMovementPayload } from '@/types/cashShift';
import { getErrorMessage } from '@/utils/errors';

const POLL_INTERVAL_MS = 10000;
const HISTORY_PAGE_SIZE = 30;

export type CashTab = 'movimientos' | 'cierre' | 'historial';

/**
 * El estado de la caja: el turno abierto (si hay), su historial y las operaciones que se hacen sobre él.
 * Cada operación devuelve si salió bien, para que el formulario sepa si limpiarse.
 */
export function useCashControl() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<CashShiftDetail | null>(null);
  const [activeTab, setActiveTab] = useState<CashTab>('movimientos');
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
      // Con la caja cerrada se ve el historial; al abrirse se sale de él.
      setActiveTab((previous) => (!res.is_open ? 'historial' : previous === 'historial' ? 'movimientos' : previous));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el estado de la caja.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchCashShiftsHistory(HISTORY_PAGE_SIZE, 0);
      setHistoryItems(res.items);
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el historial de turnos.'));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchCurrentCashShift(), fetchCashShiftsHistory(HISTORY_PAGE_SIZE, 0)])
      .then(([currentRes, historyRes]) => {
        if (!active) return;
        setIsOpen(currentRes.is_open);
        setCurrentShift(currentRes.shift);
        setActiveTab(currentRes.is_open ? 'movimientos' : 'historial');
        setHistoryItems(historyRes.items);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, 'No se pudo cargar el estado de la caja.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Los pedidos cobrados entran a la caja desde otras pantallas: se refresca sin mostrar "Cargando", que
  // borraría lo que se esté escribiendo. Si falla, se mantiene el último dato hasta el próximo intento.
  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchCurrentCashShift()
        .then((res) => {
          setIsOpen(res.is_open);
          setCurrentShift(res.shift);
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  /** Ejecuta la operación, avisa si falló y devuelve si salió bien. */
  const attempt = async (operation: () => Promise<void>, failureMessage: string): Promise<boolean> => {
    try {
      setError(null);
      await operation();
      return true;
    } catch (err) {
      setError(getErrorMessage(err, failureMessage));
      return false;
    }
  };

  const refresh = async () => {
    await loadCurrentShift();
    await loadHistory();
  };

  const openShift = (amount: number, notes: string) =>
    attempt(async () => {
      await openCashShift({ initial_amount: amount, notes: notes.trim() || undefined });
      await refresh();
    }, 'No se pudo abrir el turno de caja.');

  const addMovement = (movement: CreateCashMovementPayload) =>
    attempt(async () => {
      await addCashMovement(movement);
      await loadCurrentShift();
    }, 'No se pudo registrar el movimiento.');

  const deleteMovement = (id: number) =>
    attempt(async () => {
      await deleteCashMovement(id);
      await loadCurrentShift();
    }, 'No se pudo anular el movimiento.');

  const closeShift = (finalAmount: number, notes: string) =>
    attempt(async () => {
      await closeCashShift({ final_amount: finalAmount, notes: notes.trim() || undefined });
      await refresh();
    }, 'No se pudo cerrar el turno de caja.');

  const viewShiftDetail = async (shiftId: number) => {
    try {
      setLoadingDetailId(shiftId);
      setSelectedShiftDetail(await fetchCashShiftDetail(shiftId));
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo cargar el detalle del turno.'));
    } finally {
      setLoadingDetailId(null);
    }
  };

  return {
    loading,
    error,
    setError,
    isOpen,
    currentShift,
    activeTab,
    setActiveTab,
    historyItems,
    loadingHistory,
    selectedShiftDetail,
    closeShiftDetail: () => setSelectedShiftDetail(null),
    loadingDetailId,
    refresh,
    openShift,
    addMovement,
    deleteMovement,
    closeShift,
    viewShiftDetail,
  };
}
