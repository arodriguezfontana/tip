/** Franja de atención. Si cierra antes (o a la misma hora) de abrir, termina al día siguiente. */
export interface BusinessHoursRange {
  /** 0 = lunes ... 6 = domingo. */
  day_of_week: number;
  /** HH:MM */
  opens_at: string;
  /** HH:MM */
  closes_at: string;
}

export interface BusinessHoursStatus {
  /** Sin horarios configurados el local no restringe pedidos. */
  configured: boolean;
  is_open: boolean;
  closes_at: string | null;
  next_opening: string | null;
  /** Ej.: "hoy a las 20:00" o "el martes a las 12:00". */
  next_opening_label: string | null;
  ranges: BusinessHoursRange[];
}
