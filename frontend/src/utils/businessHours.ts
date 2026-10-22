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

export interface ScheduleGroup {
  /** "Lunes", o "Lunes a Sábado" si son varios días seguidos con el mismo horario. */
  label: string;
  /** Una entrada por franja: "12:00 a 15:00", "20:00 a 00:00". */
  ranges: string[];
}

/**
 * Los horarios de la semana listos para mostrar: agrupa los días seguidos que tienen el mismo horario y
 * omite los días cerrados. Vacío si no hay franjas cargadas.
 */
export function groupWeeklySchedule(ranges: BusinessHoursRange[]): ScheduleGroup[] {
  const days = groupRangesByDay(ranges);
  const groups: ScheduleGroup[] = [];
  let start = 0;
  while (start < days.length) {
    if (days[start].ranges.length === 0) {
      start++;
      continue;
    }
    const description = describeDayRanges(days[start].ranges);
    let end = start;
    while (end + 1 < days.length && days[end + 1].ranges.length > 0 && describeDayRanges(days[end + 1].ranges) === description) {
      end++;
    }
    groups.push({
      label: start === end ? days[start].name : `${days[start].name} a ${days[end].name}`,
      ranges: days[start].ranges.map((range) => `${range.opens_at} a ${range.closes_at}`),
    });
    start = end + 1;
  }
  return groups;
}

/** Resumen de la semana en una línea: "Martes a Domingo: 19:30 a 00:00". Null si no hay franjas cargadas. */
export function summarizeWeeklySchedule(ranges: BusinessHoursRange[]): string | null {
  const groups = groupWeeklySchedule(ranges);
  return groups.length > 0 ? groups.map((group) => `${group.label}: ${group.ranges.join(' y ')}`).join(' · ') : null;
}
