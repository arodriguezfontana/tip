/**
 * Alerta sonora generada con Web Audio API (sin archivos de audio), compatible con
 * Chrome, Edge, Firefox y Safari (incluye el prefijo `webkitAudioContext` de Safari viejo).
 *
 * Los navegadores bloquean el audio hasta que el usuario interactúa con la página, por eso
 * el AudioContext se "desbloquea" con el primer clic/tecla/toque y se expone su estado para
 * que la interfaz pueda avisar cuando el sonido está bloqueado.
 */

export type AlertAudioState = AudioContextState | 'interrupted' | 'unsupported';

type AudioContextConstructor = new () => AudioContext;

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

// Acorde ascendente de tres notas: corto, audible en un ambiente ruidoso y poco molesto.
const CHIME_NOTES_HZ = [880, 1175, 1568];
const NOTE_DURATION_S = 0.18;
const NOTE_GAP_S = 0.04;
const PEAK_GAIN = 0.35;

let context: AudioContext | null = null;
let unlockListenersInstalled = false;
const listeners = new Set<() => void>();

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return w.AudioContext ?? w.webkitAudioContext;
}

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = getAudioContextConstructor();
  if (!Ctor) return null;
  context = new Ctor();
  context.onstatechange = () => listeners.forEach((listener) => listener());
  return context;
}

function installUnlockListeners() {
  if (unlockListenersInstalled) return;
  unlockListenersInstalled = true;
  const handler = () => {
    unlockAudio().then((unlocked) => {
      if (!unlocked) return;
      UNLOCK_EVENTS.forEach((event) => document.removeEventListener(event, handler, true));
      unlockListenersInstalled = false;
    });
  };
  UNLOCK_EVENTS.forEach((event) => document.addEventListener(event, handler, true));
}

export function subscribeAlertAudioState(listener: () => void): () => void {
  const ctx = getContext();
  listeners.add(listener);
  if (ctx && ctx.state !== 'running') installUnlockListeners();
  return () => {
    listeners.delete(listener);
  };
}

export function getAlertAudioState(): AlertAudioState {
  const ctx = getContext();
  return ctx ? (ctx.state as AlertAudioState) : 'unsupported';
}

/** Intenta habilitar el audio. Debe llamarse dentro de una interacción del usuario. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  return (ctx.state as AlertAudioState) === 'running';
}

/** Reproduce la alerta. Devuelve false si el navegador todavía no habilitó el audio. */
export function playAlertSound(): boolean {
  const ctx = getContext();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    // Sin interacción previa el navegador no deja reproducir; se reintenta en la próxima repetición.
    installUnlockListeners();
    void ctx.resume().catch(() => undefined);
    return false;
  }

  const start = ctx.currentTime + 0.02;
  CHIME_NOTES_HZ.forEach((frequency, index) => {
    const noteStart = start + index * (NOTE_DURATION_S + NOTE_GAP_S);
    const noteEnd = noteStart + NOTE_DURATION_S;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, noteStart);

    // Envolvente con ataque y caída cortos para evitar "clicks" al cortar el sonido.
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
  return true;
}
