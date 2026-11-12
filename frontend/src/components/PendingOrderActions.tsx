import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useOrderEstimate } from '@/hooks/useOrderEstimate';
import type { AdminOrder, OrderStatus } from '@/types/order';

/** Evita que los clics en los controles de la tarjeta abran el detalle del pedido. */
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

interface PendingOrderActionsProps {
  order: AdminOrder;
  /** En el modo simulación los pedidos no existen en el servidor: no se consulta la estimación de demora. */
  simulated: boolean;
  pending: boolean;
  onAction: (newStatus: OrderStatus, estimatedMinutes?: number) => void;
}

/** Aceptar (con la demora estimada) o rechazar un pedido pendiente. */
export function PendingOrderActions({ order, simulated, pending, onAction }: PendingOrderActionsProps) {
  const [estimatedMinutesInput, setEstimatedMinutesInput] = useState('');
  // Con la demora automática, el empleado puede elegir cargar otra a mano.
  const [changingDelay, setChangingDelay] = useState(false);
  const isScheduled = order.scheduled_for != null;
  // Al aceptar un pedido para ahora, la demora sale del historial del local o, si todavía no hay datos, la indica el empleado.
  const needsEstimate = !isScheduled && !simulated;
  const { estimate, estimateLoading, smartMinutes, manualRequired } = useOrderEstimate(order.id, needsEstimate);
  const parsedMinutes = Number(estimatedMinutesInput);
  const hasValidMinutes = estimatedMinutesInput.trim() !== '' && Number.isInteger(parsedMinutes) && parsedMinutes > 0;
  // El campo de minutos se pide siempre sin estimación automática, y a pedido del empleado si quiere cambiarla.
  const showMinutesInput = manualRequired || (smartMinutes != null && changingDelay);
  const canConfirm = !(needsEstimate && estimateLoading) && (!showMinutesInput || hasValidMinutes);

  return (
    <div className="cursor-default space-y-2 pt-2 border-t border-gray-50" onClick={stopPropagation}>
        {/* Los programados se entregan en su horario: no llevan demora estimada. */}
        {needsEstimate && estimateLoading && (
          <p className="text-xs text-gray-400" role="status">
            Calculando demora estimada...
          </p>
        )}
        {smartMinutes != null && !changingDelay && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2">
            <div role="status" className="leading-tight">
              <p className="text-[11px] text-emerald-700">Demora estimada</p>
              <p className="text-base font-bold text-emerald-900">{smartMinutes} min</p>
            </div>
            <button
              type="button"
              onClick={() => setChangingDelay(true)}
              aria-label="Cambiar demora"
              className="shrink-0 whitespace-nowrap rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
            >
              Cambiar
            </button>
          </div>
        )}
        {smartMinutes != null && changingDelay && (
          <div className="space-y-1">
            <input
              type="number"
              min={1}
              step={1}
              required
              autoFocus
              aria-label="Demora estimada en minutos"
              placeholder={`Minutos (automática: ${smartMinutes})`}
              value={estimatedMinutesInput}
              onChange={(e) => setEstimatedMinutesInput(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black bg-gray-50/50"
            />
            <button
              type="button"
              onClick={() => {
                setChangingDelay(false);
                setEstimatedMinutesInput('');
              }}
              className="text-[11px] font-semibold text-gray-600 underline hover:text-gray-900"
            >
              Volver a la automática
            </button>
          </div>
        )}
        {manualRequired && (
          <div className="space-y-1">
            <input
              type="number"
              min={1}
              step={1}
              required
              aria-label="Demora estimada en minutos"
              placeholder={`Demora estimada en minutos (obligatoria)${estimate ? `, ej: ${estimate.suggested_minutes}` : ''}`}
              value={estimatedMinutesInput}
              onChange={(e) => setEstimatedMinutesInput(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black bg-gray-50/50"
            />
            {estimate && (
              <p className="text-[11px] text-gray-500">
                Todavía no hay datos suficientes para estimarla ({estimate.samples} de {estimate.min_samples} pedidos
                similares).
              </p>
            )}
          </div>
        )}
        {simulated && !isScheduled && (
          <input
            type="number"
            min={1}
            step={1}
            aria-label="Demora estimada en minutos"
            placeholder="Demora estimada en minutos (opcional)"
            value={estimatedMinutesInput}
            onChange={(e) => setEstimatedMinutesInput(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-black bg-gray-50/50"
          />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending || !canConfirm || (simulated && estimatedMinutesInput.trim() !== '' && !hasValidMinutes)}
            onClick={() =>
              onAction('Confirmado', showMinutesInput || simulated ? (hasValidMinutes ? parsedMinutes : undefined) : undefined)
            }
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction('Rechazado')}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-xl text-xs font-bold transition shadow-xs"
          >
            Rechazar
          </button>
        </div>
      </div>
  );
}
