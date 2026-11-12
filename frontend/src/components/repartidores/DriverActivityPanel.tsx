import { useMemo, useState } from 'react';
import { DateRangeFilter } from '@/components/DateRangeFilter';
import { DriverActivitySummary } from '@/components/repartidores/DriverActivitySummary';
import { DriverTripCard } from '@/components/repartidores/DriverTripCard';
import { PanelNote } from '@/components/ui/PanelNote';
import { useDriverActivity } from '@/hooks/useDriverActivity';
import type { DeliveryDriver } from '@/types/deliveryDriver';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, rangeForPreset } from '@/utils/dateRange';

const ACTIVITY_PRESETS: DateRangePreset[] = ['shift', 'today', 'week', 'custom'];

interface DriverActivityPanelProps {
  drivers: DeliveryDriver[];
  driverId: number | null;
  onDriverChange: (driverId: number | null) => void;
}

/** Actividad de un repartidor: se elige repartidor y período, y se muestra el resumen y sus viajes. */
export function DriverActivityPanel({ drivers, driverId, onDriverChange }: DriverActivityPanelProps) {
  const [preset, setPreset] = useState<DateRangePreset>('shift');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  // Con un rango personalizado incompleto no se pide nada.
  const rangeIncomplete = preset === 'custom' && (!customFrom || !customTo);
  const { data: activity, loading, error } = useDriverActivity(rangeIncomplete ? null : driverId, {
    dateFrom: range.from,
    dateTo: range.to,
    currentShift: preset === 'shift',
  });

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-gray-100">
        <label htmlFor="activity-driver" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Repartidor
        </label>
        <select
          id="activity-driver"
          value={driverId ?? ''}
          onChange={(e) => onDriverChange(e.target.value ? Number(e.target.value) : null)}
          className="w-full sm:w-72 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        >
          <option value="">Elegí un repartidor...</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
      </div>

      <DateRangeFilter
        preset={preset}
        customFrom={customFrom}
        customTo={customTo}
        presets={ACTIVITY_PRESETS}
        onPresetChange={setPreset}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
      />

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {driverId === null ? (
        <PanelNote>Elegí un repartidor para ver sus viajes.</PanelNote>
      ) : rangeIncomplete ? (
        <PanelNote>Elegí las fechas del rango para ver los viajes.</PanelNote>
      ) : !activity ? (
        loading && <PanelNote>Cargando viajes...</PanelNote>
      ) : (
        <>
          <DriverActivitySummary activity={activity} />
          {activity.trips.length === 0 ? (
            <PanelNote>El repartidor no hizo viajes en el período elegido.</PanelNote>
          ) : (
            <ul className="space-y-3">
              {activity.trips.map((trip) => (
                <DriverTripCard key={trip.id} trip={trip} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
