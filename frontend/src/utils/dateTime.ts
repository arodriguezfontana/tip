/** Zona horaria del local: todas las horas que ve el personal se muestran en ella. */
export const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Hora del día, ej. "20:15". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** Día y mes, ej. "03/10". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: TIME_ZONE });
}

/** Día, mes y hora, ej. "03/10, 20:15"; un guion si no hay fecha. */
export function formatDayAndTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/** Fecha y hora cortas, ej. "03/10/26, 20:15". */
export function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE });
}
