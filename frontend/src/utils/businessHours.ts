import type { BusinessHoursRange } from '@/types/businessHours';
import { groupAdjacent } from '@/utils/collections';

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
  const openDays = groupRangesByDay(ranges).filter((day) => day.ranges.length > 0);
  const runs = groupAdjacent(
    openDays,
    (previous, next) => next.day === previous.day + 1 && describeDayRanges(next.ranges) === describeDayRanges(previous.ranges)
  );
  return runs.map((run) => ({
    label: run.length === 1 ? run[0].name : `${run[0].name} a ${run[run.length - 1].name}`,
    ranges: run[0].ranges.map((range) => `${range.opens_at} a ${range.closes_at}`),
  }));
}

/** Resumen de la semana en una línea: "Martes a Domingo: 19:30 a 00:00". Null si no hay franjas cargadas. */
export function summarizeWeeklySchedule(ranges: BusinessHoursRange[]): string | null {
  const groups = groupWeeklySchedule(ranges);
  return groups.length > 0 ? groups.map((group) => `${group.label}: ${group.ranges.join(' y ')}`).join(' · ') : null;
}
