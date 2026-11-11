import type { PreparationSector } from '@/types/order';

/** Impresora de comandas vinculada a un sector de preparación. */
export interface PrinterConfig {
  sector: PreparationSector;
  name: string;
  host: string;
  port: number;
}

/** Resultado de mandar una comanda (o una prueba) a imprimir. */
export interface PrintResult {
  success: boolean;
  message?: string | null;
  errors: string[];
}
