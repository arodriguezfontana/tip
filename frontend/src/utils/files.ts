/** Peso de un archivo para mostrar, ej. "250 KB" o "2.5 MB". */
export function formatSize(bytes: number): string {
  const MB = 1024 * 1024;
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
