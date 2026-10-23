import { api } from './api';
import type { HandoffDetail, HandoffSummary } from '@/types/handoff';

/** Conversaciones en las que el cliente pidió hablar con una persona. */
export async function fetchHandoffs(): Promise<HandoffSummary[]> {
  const { data } = await api.get<HandoffSummary[]>('/handoffs');
  return data;
}

export async function fetchHandoff(id: number): Promise<HandoffDetail> {
  const { data } = await api.get<HandoffDetail>(`/handoffs/${id}`);
  return data;
}

/** El empleado toma el control de la conversación (el bot ya no responde). */
export async function takeHandoff(id: number): Promise<HandoffDetail> {
  const { data } = await api.post<HandoffDetail>(`/handoffs/${id}/take`);
  return data;
}

export async function sendHandoffMessage(id: number, text: string): Promise<HandoffDetail> {
  const { data } = await api.post<HandoffDetail>(`/handoffs/${id}/messages`, { text });
  return data;
}

/** Termina la atención: la conversación vuelve al bot. */
export async function finishHandoff(id: number): Promise<void> {
  await api.post(`/handoffs/${id}/finish`);
}
