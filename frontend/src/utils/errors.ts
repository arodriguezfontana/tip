/** Mensaje para mostrarle al usuario a partir de un error de la API (ver services/api.ts), o el genérico. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}
