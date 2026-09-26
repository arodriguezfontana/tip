import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getAlertAudioState,
  playAlertSound,
  subscribeAlertAudioState,
  unlockAudio,
} from '@/utils/alertSound';

/** Cada cuánto se repite la alerta mientras haya pedidos sin responder. */
export const ALERT_REPEAT_MS = 5000;

const STORAGE_KEY = 'orderAlertSoundEnabled';

function readEnabledPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveEnabledPreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // Sin storage disponible la preferencia vale solo para esta sesión.
  }
}

/**
 * Reproduce una alerta sonora mientras haya pedidos pendientes de aceptar/rechazar:
 * suena apenas entra un pedido nuevo y se repite cada ALERT_REPEAT_MS hasta que no quede ninguno.
 */
export function useNewOrderAlert(pendingOrderIds: number[]) {
  const [enabled, setEnabled] = useState(readEnabledPreference);
  const audioState = useSyncExternalStore(subscribeAlertAudioState, getAlertAudioState);

  const pendingKey = [...pendingOrderIds].sort((a, b) => a - b).join(',');
  const hasPending = pendingKey !== '';
  const knownIdsRef = useRef<Set<string> | null>(null);

  // Repetición: arranca (sonando de inmediato) cuando aparecen pendientes y corta cuando no queda ninguno.
  useEffect(() => {
    if (!enabled || !hasPending) return;
    playAlertSound();
    const intervalId = setInterval(playAlertSound, ALERT_REPEAT_MS);
    return () => clearInterval(intervalId);
  }, [enabled, hasPending]);

  // Pedido nuevo mientras ya había otros pendientes: suena al instante, sin esperar la próxima repetición.
  useEffect(() => {
    const ids = new Set(pendingKey ? pendingKey.split(',') : []);
    const previous = knownIdsRef.current;
    knownIdsRef.current = ids;
    if (!enabled || !previous || previous.size === 0) return;
    const hasNewOrder = [...ids].some((id) => !previous.has(id));
    if (hasNewOrder) playAlertSound();
  }, [pendingKey, enabled]);

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    saveEnabledPreference(next);
    if (next) void unlockAudio();
  };

  return {
    enabled,
    toggleEnabled,
    unlockAudio,
    audioSupported: audioState !== 'unsupported',
    audioBlocked: audioState === 'suspended' || audioState === 'interrupted',
  };
}
