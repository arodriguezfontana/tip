import { useState } from 'react';
import { formatDayAndTime, formatTime } from '@/utils/dateTime';
import { formatCurrency } from '@/utils/currency';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import type { DriverTrip } from '@/types/deliveryDriver';

function TripStatusBadge({ inProgress }: { inProgress: boolean }) {
  const classes = inProgress
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : 'bg-green-50 text-green-700 border-green-200';
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${classes}`}>
      {inProgress ? 'En curso' : 'Finalizado'}
    </span>
  );
}

function TripOrdersTable({ orders }: { orders: DriverTrip['orders'] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
          <th className="py-2 px-4">Pedido</th>
          <th className="py-2 px-4">Cliente</th>
          <th className="py-2 px-4">Dirección</th>
          <th className="py-2 px-4">Pago</th>
          <th className="py-2 px-4 text-right">Monto</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {orders.map((order) => (
          <tr key={order.id}>
            <td className="py-2 px-4 font-semibold">#{order.shift_number}</td>
            <td className="py-2 px-4">{order.customer_name}</td>
            <td className="py-2 px-4 text-gray-600">{order.shipping_address}</td>
            <td className="py-2 px-4">{order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method] : '-'}</td>
            <td className="py-2 px-4 text-right font-semibold">{formatCurrency(order.total_amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un viaje del repartidor: resumen en la cabecera y, al expandirlo, los pedidos que lo componen. */
export function DriverTripCard({ trip }: { trip: DriverTrip }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`Viaje #${trip.id}`}
        onClick={() => setExpanded((current) => !current)}
        className="w-full flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-left hover:bg-gray-50/50 transition"
      >
        <span className="font-bold text-gray-900">Viaje #{trip.id}</span>
        <TripStatusBadge inProgress={trip.is_in_progress} />
        <span className="text-xs text-gray-600">
          Salida: <strong>{formatDayAndTime(trip.dispatched_at)}</strong>
        </span>
        <span className="text-xs text-gray-600">
          Fin: <strong>{trip.finished_at ? formatTime(trip.finished_at) : '-'}</strong>
        </span>
        <span className="text-xs text-gray-600">
          {trip.stops_count} {trip.stops_count === 1 ? 'parada' : 'paradas'}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <TripOrdersTable orders={trip.orders} />
        </div>
      )}
    </li>
  );
}
