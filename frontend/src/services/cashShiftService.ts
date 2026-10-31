import { api } from './api';
import type {
  CashMovement,
  CashShift,
  CashShiftCurrentStatus,
  CashShiftDetail,
  CashShiftHistory,
  CloseCashShiftPayload,
  CreateCashMovementPayload,
  OpenCashShiftPayload,
} from '@/types/cashShift';

export async function fetchCurrentCashShift(): Promise<CashShiftCurrentStatus> {
  const { data } = await api.get<CashShiftCurrentStatus>('/cash-shifts/current');
  return data;
}

export async function openCashShift(payload: OpenCashShiftPayload): Promise<CashShift> {
  const { data } = await api.post<CashShift>('/cash-shifts/open', payload);
  return data;
}

export async function closeCashShift(payload: CloseCashShiftPayload): Promise<CashShift> {
  const { data } = await api.post<CashShift>('/cash-shifts/close', payload);
  return data;
}

export async function addCashMovement(payload: CreateCashMovementPayload): Promise<CashMovement> {
  const { data } = await api.post<CashMovement>('/cash-shifts/movements', payload);
  return data;
}

export async function deleteCashMovement(movementId: number): Promise<void> {
  await api.delete(`/cash-shifts/movements/${movementId}`);
}

export async function fetchCashShiftsHistory(limit = 20, offset = 0): Promise<CashShiftHistory> {
  const { data } = await api.get<CashShiftHistory>('/cash-shifts', {
    params: { limit, offset },
  });
  return data;
}

export async function fetchCashShiftDetail(shiftId: number): Promise<CashShiftDetail> {
  const { data } = await api.get<CashShiftDetail>(`/cash-shifts/${shiftId}`);
  return data;
}

