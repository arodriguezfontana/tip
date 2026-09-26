import { useState } from 'react';
import type { AdminOrder, OrderStatus } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { ALERT_THRESHOLD_MS, formatElapsed } from '@/utils/elapsedTime';

const SOURCE_BADGE: Record<AdminOrder['source'], { label: string; className: string }> = {
  web: { label: 'Web', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  bot: { label: 'Bot', className: 'bg-sky-50 text-sky-700 border border-sky-200' },
  mostrador: { label: 'Mostrador', className: 'bg-orange-50 text-orange-700 border border-orange-200' },
};

const DELIVERY_METHOD_LABEL: Record<AdminOrder['delivery_method'], string> = {
  domicilio: 'A domicilio',
  retiro: 'Retiro en local',
};

interface ComandaCardProps {
  order: AdminOrder;
  onStatusChange: (orderId: number, newStatus: OrderStatus, estimatedMinutes?: number) => Promise<void>;
}

export function ComandaCard({ order, onStatusChange }: ComandaCardProps) {
  const [pending, setPending] = useState(false);
  const [estimatedMinutesInput, setEstimatedMinutesInput] = useState('');
  const elapsedMs = useElapsedTime(order.created_at);

  const isOverdue = order.status === 'Pendiente' && elapsedMs > ALERT_THRESHOLD_MS;
  const parsedMinutes = Number(estimatedMinutesInput);
  
  const isValidMinutes = estimatedMinutesInput.trim() === '' || (Number.isInteger(parsedMinutes) && parsedMinutes > 0);

  const handleClick = async (newStatus: OrderStatus, estimatedMinutes?: number) => {
    setPending(true);
    try {
      await onStatusChange(order.id, newStatus, estimatedMinutes);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`bg-white rounded-2xl border p-4 transition-all shadow-xs hover:shadow-md ${isOverdue ? 'border-red-300 bg-red-50/20' : 'border-gray-100'}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-gray-50 pb-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-sm">#{order.id}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                (SOURCE_BADGE[order.source] ?? SOURCE_BADGE.bot).className
              }`}
            >
              {(SOURCE_BADGE[order.source] ?? SOURCE_BADGE.bot).label}
            </span>
          </div>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              isOverdue ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {formatElapsed(elapsedMs)}
          </span>
        </div>

        <div className="text-sm space-y-1">
          <p className="font-medium text-gray-900">{order.customer_name}</p>
          <p className="text-xs text-gray-500">{DELIVERY_METHOD_LABEL[order.delivery_method]}</p>
          {order.customer_phone && <p className="text-xs text-gray-500">Tel: {order.customer_phone}</p>}
          {order.notes && <p className="text-xs text-gray-600 italic break-words">“{order.notes}”</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {order.scheduled_for ? (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-xl font-semibold">
              <span>{new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-xl font-semibold">
              <span>Para ahora</span>
            </div>
          )}

          <span className="font-bold text-black text-sm">{formatCurrency(order.total_amount)}</span>
        </div>

        <div className="text-xs text-gray-500 flex justify-between items-center pt-1 border-t border-gray-50">
          <span>Ítems: {order.item_count}</span>
          {order.estimated_minutes != null && (
            <span className="bg-purple-50 text-purple-800 border border-purple-200 px-2.5 py-0.5 rounded-md font-semibold">
              Estimado: {order.estimated_minutes} min
            </span>
          )}
        </div>

        {order.status === 'Pendiente' && (
          <div className="space-y-2 pt-2 border-t border-gray-50">
            <input
              type="number"
              min={1}
              step={1}
              placeholder="Automática (15+ min) o manual"
              value={estimatedMinutesInput}
              onChange={(e) => setEstimatedMinutesInput(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black bg-gray-50/50"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !isValidMinutes}
                onClick={() => handleClick('Confirmado', estimatedMinutesInput.trim() === '' ? undefined : parsedMinutes)}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
              >
                Confirmar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleClick('Rechazado')}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
              >
                Rechazar
              </button>
            </div>
          </div>
        )}

        {order.status === 'Confirmado' && (
          <div className="pt-2 border-t border-gray-50">
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick(order.delivery_method === 'retiro' ? 'Listo para Retirar' : 'En Camino')}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
            >
              {order.delivery_method === 'retiro' ? 'Marcar Listo para Retirar' : 'Marcar En Camino'}
            </button>
          </div>
        )}

        {(order.status === 'En Camino' || order.status === 'Listo para Retirar') && (
          <div className="pt-2 border-t border-gray-50">
            <button
              type="button"
              disabled={pending}
              onClick={() => handleClick('Finalizado')}
              className="w-full bg-black hover:bg-gray-800 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
            >
              Finalizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}