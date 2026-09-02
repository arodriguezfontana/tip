export type DateRangePreset = 'today' | 'week' | 'month' | 'all' | 'custom';

export interface DateRange {
  from?: Date;
  to?: Date;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Hoy',
  week: 'Última semana',
  month: 'Último mes',
  all: 'Todo',
  custom: 'Rango personalizado',
};

export function presetLabel(preset: DateRangePreset): string {
  return PRESET_LABELS[preset];
}

/**
 * Parses a "YYYY-MM-DD" value from a <input type="date"> into a local Date.
 * `new Date(value)` parses date-only strings as UTC midnight, which shifts
 * the date back a day in negative UTC offsets (e.g. Argentina) once local
 * getters/setters are applied — so we build the Date from local components instead.
 */
export function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function rangeForPreset(preset: DateRangePreset, custom?: DateRange): DateRange {
  const now = new Date();

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return { from, to: endOfDay(now) };
    }
    case 'month': {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 29);
      return { from, to: endOfDay(now) };
    }
    case 'custom':
      return {
        from: custom?.from ? startOfDay(custom.from) : undefined,
        to: custom?.to ? endOfDay(custom.to) : undefined,
      };
    case 'all':
    default:
      return {};
  }
}
