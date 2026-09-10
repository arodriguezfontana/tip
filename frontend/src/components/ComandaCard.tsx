import { useState } from 'react';
import type { AdminOrder, OrderStatus } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { ALERT_THRESHOLD_MS, formatElapsed } from '@/utils/elapsedTime';

const DELIVERY_METHOD_LABEL: Record<AdminOrder['delivery_method'], string> = {
  domicilio: 'Envío a domicilio',
  retiro: 'Retiro en local',
};

interface ComandaCardProps {
  order: AdminOrder;
  onStatusChange: (orderId: number, newStatus: OrderStatus) => Promise<void>;
}

export function ComandaCard({ order, onStatusChange }: ComandaCardProps) {
  const [pending, setPending] = useState(false);
  const elapsedMs = useElapsedTime(order.created_at);

  const isOverdue = order.status === 'Pendiente' && elapsedMs > ALERT_THRESHOLD_MS;

  const handleClick = async (newStatus: OrderStatus) => {
    setPending(true);
    try {
      await onStatusChange(order.id, newStatus);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 space-y-3">
      <div className="flex justify-between items-center">
        <span className="font-bold text-gray-900">Pedido #{order.id}</span>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      <div className="text-sm space-y-1 text-gray-700">
        <p className="font-medium">{order.customer_name}</p>
        <p className="text-xs text-gray-500">{DELIVERY_METHOD_LABEL[order.delivery_method]}</p>
        <p className="text-xs text-gray-500">Ítems: {order.item_count}</p>
        <p className="font-semibold text-black">{formatCurrency(order.total_amount)}</p>
      </div>

      <div className="flex gap-2 pt-1">
        {order.status === 'Pendiente' && (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick('Confirmado')}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-sm"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick('Rechazado')}
              className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-sm"
            >
              Rechazar
            </button>
          </>
        )}

        {order.status === 'Confirmado' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => handleClick(order.delivery_method === 'retiro' ? 'Listo para Retirar' : 'En Camino')}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            {order.delivery_method === 'retiro' ? 'Marcar Listo para Retirar' : 'Marcar En Camino'}
          </button>
        )}

        {(order.status === 'En Camino' || order.status === 'Listo para Retirar') && (
          <button
            type="button"
            disabled={pending}
            onClick={() => handleClick('Finalizado')}
            className="flex-1 bg-black hover:bg-gray-800 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-sm"
          >
            Finalizar
          </button>
        )}
      </div>
    </div>
  );
}
