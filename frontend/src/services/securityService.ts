import { api } from '@/services/api';
import type { PinStatusResponse, PinVerificationResponse } from '@/types/security';

export async function verifyAdminPin(pin: string): Promise<PinVerificationResponse> {
  const { data } = await api.post<PinVerificationResponse>('/security/verify-admin-pin', { pin });
  return data;
}

export async function verifyCashPin(pin: string): Promise<PinVerificationResponse> {
  const { data } = await api.post<PinVerificationResponse>('/security/verify-cash-pin', { pin });
  return data;
}

export async function fetchPinStatus(): Promise<PinStatusResponse> {
  const { data } = await api.get<PinStatusResponse>('/security/pin-status');
  return data;
}

