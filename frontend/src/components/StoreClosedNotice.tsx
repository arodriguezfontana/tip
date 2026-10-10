import type { BusinessHoursStatus } from '@/types/businessHours';
import { describeDayRanges, groupRangesByDay } from '@/utils/businessHours';

/** Aviso de la web del cliente cuando el local está fuera de su horario de atención. */
export function StoreClosedNotice({ status }: { status: BusinessHoursStatus }) {
  return (
    <section
      aria-labelledby="store-closed-title"
      className="max-w-6xl mx-auto mb-6 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4 sm:flex sm:items-start sm:justify-between sm:gap-8"
    >
      <div>
        <h2 id="store-closed-title" className="text-lg font-bold text-amber-900">
          El local se encuentra cerrado
        </h2>
        <p className="text-sm text-amber-800 mt-1">
          En este momento no estamos tomando pedidos.
          {status.next_opening_label && ` Volvemos a abrir ${status.next_opening_label}.`}
        </p>
      </div>

      <div className="mt-4 sm:mt-0 shrink-0">
        <h3 className="text-sm font-semibold text-amber-900 mb-1">Nuestros horarios</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm text-amber-900">
          {groupRangesByDay(status.ranges).map((day) => (
            <div key={day.day} className="contents">
              <dt className="font-medium">{day.name}</dt>
              <dd className={day.ranges.length === 0 ? 'text-amber-700' : undefined}>{describeDayRanges(day.ranges)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
