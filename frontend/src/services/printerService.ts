import { api } from './api';
import type { PrinterConfig, PrintResult } from '@/types/printer';

export async function fetchPrinters(signal?: AbortSignal): Promise<PrinterConfig[]> {
  const { data } = await api.get<PrinterConfig[]>('/printers', { signal });
  return data;
}

/** Reemplaza la configuración: los sectores que no se envían quedan sin impresora. */
export async function savePrinters(printers: PrinterConfig[]): Promise<PrinterConfig[]> {
  const { data } = await api.put<PrinterConfig[]>('/printers', { printers });
  return data;
}

/** Imprime una página de prueba en la impresora indicada. */
export async function testPrinter(host: string, port: number): Promise<PrintResult> {
  const { data } = await api.post<PrintResult>('/printers/test', { host, port });
  return data;
}
