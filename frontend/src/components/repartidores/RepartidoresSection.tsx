import { useCallback, useState } from 'react';
import { DriverActivityPanel } from '@/components/repartidores/DriverActivityPanel';
import { RepartidoresView } from '@/components/RepartidoresView';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchDeliveryDrivers } from '@/services/deliveryDriverService';
import type { ThemeColor } from '@/types/storeConfig';

type Tab = 'listado' | 'actividad';

const TABS: { key: Tab; label: string }[] = [
  { key: 'listado', label: 'Listado' },
  { key: 'actividad', label: 'Actividad y viajes' },
];

/** Sección "Repartidores": el listado para administrarlos y, aparte, la actividad de cada uno. */
export function RepartidoresSection({ themeColor }: { themeColor?: ThemeColor }) {
  const [tab, setTab] = useState<Tab>('listado');
  const [activityDriverId, setActivityDriverId] = useState<number | null>(null);

  const loadDrivers = useCallback(() => fetchDeliveryDrivers(), []);
  const { data: drivers = [] } = useAsyncData(loadDrivers, 'No se pudo cargar la lista de repartidores.');

  const showActivity = (driverId: number) => {
    setActivityDriverId(driverId);
    setTab('actividad');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div role="tablist" className="flex gap-2">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              tab === key ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'listado' ? (
        <RepartidoresView themeColor={themeColor} onViewActivity={showActivity} />
      ) : (
        <DriverActivityPanel drivers={drivers} driverId={activityDriverId} onDriverChange={setActivityDriverId} />
      )}
    </div>
  );
}
