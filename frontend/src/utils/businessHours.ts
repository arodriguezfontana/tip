import type { BusinessHoursRange } from '@/types/businessHours';

/** Índice = day_of_week del backend (0 = lunes). */
export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export interface DaySchedule {
  day: number;
  name: string;
  ranges: BusinessHoursRange[];
}

/** Las franjas agrupadas por día de la semana (de lunes a domingo), ordenadas por apertura. */
export function groupRangesByDay(ranges: BusinessHoursRange[]): DaySchedule[] {
  return DAY_NAMES.map((name, day) => ({
    day,
    name,
    ranges: ranges
      .filter((range) => range.day_of_week === day)
      .sort((a, b) => a.opens_at.localeCompare(b.opens_at)),
  }));
}

/** "12:00 a 15:00 y 20:00 a 00:00", o "Cerrado" si el día no tiene franjas. */
export function describeDayRanges(ranges: BusinessHoursRange[]): string {
  if (ranges.length === 0) return 'Cerrado';
  return ranges.map((range) => `${range.opens_at} a ${range.closes_at}`).join(' y ');
}
