import { SectorIcon, UtensilsIcon } from '@/components/Icons';
import { SECTOR_CONFIG } from '@/types/order';
import type { PreparationSector, SectorFilter } from '@/types/order';
import type { SectorCounts } from '@/utils/orderBoard';

const SECTORS: PreparationSector[] = ['pizzeria', 'cocina', 'barra'];
const INACTIVE_TAB_CLASS = 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200/80';
const TAB_CLASS = 'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer';

interface SectorTabsProps {
  selected: SectorFilter;
  counts: SectorCounts;
  onChange: (sector: SectorFilter) => void;
}

/** Pestañas para ver los pedidos de todos los sectores o de uno solo (cocina, pizzería, barra). */
export function SectorTabs({ selected, counts, onChange }: SectorTabsProps) {
  return (
    <div className="shrink-0 flex items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-2xl shadow-xs border border-gray-100">
      <div className="flex items-center gap-2 overflow-x-auto py-0.5">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1 shrink-0">Sector:</span>
        <button
          type="button"
          onClick={() => onChange('todos')}
          className={`${TAB_CLASS} ${selected === 'todos' ? 'bg-gray-900 text-white shadow-xs' : INACTIVE_TAB_CLASS}`}
        >
          <UtensilsIcon className="w-3.5 h-3.5 shrink-0" />
          <span>Todos</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              selected === 'todos' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {counts.total}
          </span>
        </button>

        {SECTORS.map((sector) => {
          const isSelected = selected === sector;
          return (
            <button
              key={sector}
              type="button"
              onClick={() => onChange(sector)}
              className={`${TAB_CLASS} ${isSelected ? SECTOR_CONFIG[sector].activeTabClass : INACTIVE_TAB_CLASS}`}
            >
              <SectorIcon sector={sector} className="w-3.5 h-3.5 shrink-0" />
              <span>{SECTOR_CONFIG[sector].label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isSelected ? 'bg-black/20 text-white' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {counts[sector]}
              </span>
            </button>
          );
        })}
      </div>

      {selected !== 'todos' && (
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 shrink-0">
          <span>Filtrado por:</span>
          <span className="font-semibold text-gray-800 flex items-center gap-1.5">
            <SectorIcon sector={selected} className="w-3.5 h-3.5 shrink-0" />
            <span>{SECTOR_CONFIG[selected].label}</span>
          </span>
          <button
            type="button"
            onClick={() => onChange('todos')}
            className="text-[11px] text-blue-600 hover:underline font-medium ml-1 cursor-pointer"
          >
            (Ver todos)
          </button>
        </div>
      )}
    </div>
  );
}
