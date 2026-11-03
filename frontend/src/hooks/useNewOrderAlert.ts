import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getAlertAudioState,
  playAlertSound,
  playModifiedOrderSound,
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
 * Suena mientras la lista tenga algún id: apenas aparece uno, cada ALERT_REPEAT_MS hasta que se vacía, y al
 * instante cuando se suma uno nuevo aunque ya hubiera otros.
 */
function useRepeatingAlert(ids: number[], enabled: boolean, playSound: () => boolean) {
  const key = [...ids].sort((a, b) => a - b).join(',');
  const hasIds = key !== '';
  const knownIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || !hasIds) return;
    playSound();
    const intervalId = setInterval(playSound, ALERT_REPEAT_MS);
    return () => clearInterval(intervalId);
  }, [enabled, hasIds, playSound]);

  useEffect(() => {
    const current = new Set(key ? key.split(',') : []);
    const previous = knownIdsRef.current;
    knownIdsRef.current = current;
    if (!enabled || !previous || previous.size === 0) return;
    if ([...current].some((id) => !previous.has(id))) playSound();
  }, [key, enabled, playSound]);
}

/**
 * Reproduce una alerta sonora (por defecto la de pedidos) mientras haya pedidos pendientes de aceptar/rechazar,
 * y otra distinta mientras haya pedidos confirmados que el cliente modificó y cocina todavía no vio.
 * Las dos se silencian juntas.
 */
export function useNewOrderAlert(
  pendingOrderIds: number[],
  playSound: () => boolean = playAlertSound,
  modifiedOrderIds: number[] = []
) {
  const [enabled, setEnabled] = useState(readEnabledPreference);
  const audioState = useSyncExternalStore(subscribeAlertAudioState, getAlertAudioState);

  useRepeatingAlert(pendingOrderIds, enabled, playSound);
  useRepeatingAlert(modifiedOrderIds, enabled, playModifiedOrderSound);

  // Silenciar (o activar) en una pestaña aplica también a las otras que tengan el panel abierto.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setEnabled(readEnabledPreference());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
