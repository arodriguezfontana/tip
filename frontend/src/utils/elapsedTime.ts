export const ALERT_THRESHOLD_MS = 2 * 60 * 1000;

export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return `${minutes}min`;
}
