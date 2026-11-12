import { formatCurrency } from '@/utils/currency';
import type { DriverActivity } from '@/types/deliveryDriver';

function Metric({
  label,
  value,
  hint,
  highlight = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

/** Totales del período: viajes, pedidos entregados y el efectivo que el repartidor todavía tiene que entregar. */
export function DriverActivitySummary({ activity }: { activity: DriverActivity }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-2xl shadow-xs border border-gray-100">
      <Metric label="Viajes realizados" value={activity.trips_count} />
      <Metric label="Pedidos entregados" value={activity.delivered_orders_count} />
      <Metric label="Efectivo a rendir" value={formatCurrency(activity.cash_to_hand_over)}
        hint="Se descuenta al marcar cada pedido como abonado."
        highlight />
    </div>
  );
}
