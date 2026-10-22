import type { BusinessHoursStatus } from '@/types/businessHours';

/** Aviso de la web del cliente cuando el local está fuera de su horario de atención. */
export function StoreClosedNotice({ status }: { status: BusinessHoursStatus }) {
  return (
    <section
      aria-labelledby="store-closed-title"
      className="max-w-6xl mx-auto mb-6 rounded-2xl bg-amber-50 border border-amber-200 px-5 py-4"
    >
      <h2 id="store-closed-title" className="text-lg font-bold text-amber-900">
        El local se encuentra cerrado
      </h2>
      <p className="text-sm text-amber-800 mt-1">
        En este momento no estamos tomando pedidos.
        {status.next_opening_label && ` Volvemos a abrir ${status.next_opening_label}.`}
      </p>
    </section>
  );
}
