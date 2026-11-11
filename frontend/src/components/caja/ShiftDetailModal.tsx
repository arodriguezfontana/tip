import type { ReactNode } from 'react';
import type { CashMovement, CashShiftDetail } from '@/types/cashShift';
import { differenceTextClass } from '@/utils/cashShift';
import { formatCurrency } from '@/utils/currency';
import { formatDayAndTime, formatTime } from '@/utils/dateTime';

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
      <span className="text-gray-500 block">{label}</span>
      {children}
    </div>
  );
}

function MovementsTable({ movements }: { movements: CashMovement[] }) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
      <table className="w-full text-left">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500">
          <tr>
            <th className="py-2 px-3">Hora</th>
            <th className="py-2 px-3">Tipo</th>
            <th className="py-2 px-3">Categoría</th>
            <th className="py-2 px-3">Detalle</th>
            <th className="py-2 px-3 text-right">Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {movements.map((movement) => {
            const isIncome = movement.type === 'ingreso';
            return (
              <tr key={movement.id}>
                <td className="py-2 px-3 text-gray-500">{formatTime(movement.created_at)}</td>
                <td className="py-2 px-3 font-semibold">
                  <span className={isIncome ? 'text-emerald-700' : 'text-rose-700'}>{isIncome ? 'Ingreso' : 'Egreso'}</span>
                </td>
                <td className="py-2 px-3">{movement.category}</td>
                <td className="py-2 px-3 text-gray-600">{movement.description || '-'}</td>
                <td className={`py-2 px-3 text-right font-bold ${isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isIncome ? '+' : '-'}
                  {formatCurrency(movement.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Detalle de un turno ya cerrado: sus montos, observaciones y movimientos. */
export function ShiftDetailModal({ shift, onClose }: { shift: CashShiftDetail; onClose: () => void }) {
  const movements = shift.movements ?? [];
  const difference = shift.difference ?? 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Detalle del turno #{shift.id}</h3>
            <p className="text-xs text-gray-500">
              {formatDayAndTime(shift.opened_at)} al {formatDayAndTime(shift.closed_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 leading-none">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Figure label="Fondo inicial">
            <span className="text-sm font-bold text-gray-900">{formatCurrency(shift.initial_amount)}</span>
          </Figure>
          <Figure label="Caja teórica">
            <span className="text-sm font-bold text-gray-900">{formatCurrency(shift.expected_amount ?? 0)}</span>
          </Figure>
          <Figure label="Monto real contado">
            <span className="text-sm font-bold text-gray-900">{formatCurrency(shift.final_amount ?? 0)}</span>
          </Figure>
          <Figure label="Diferencia">
            <span className={`text-sm font-bold ${differenceTextClass(difference)}`}>
              {difference > 0 && '+'}
              {formatCurrency(difference)}
            </span>
          </Figure>
        </div>

        {shift.notes && (
          <div className="text-xs bg-gray-50 p-3 rounded-xl border border-gray-200 text-gray-700">
            <strong>Observaciones:</strong> {shift.notes}
          </div>
        )}

        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
            Movimientos del turno ({movements.length})
          </h4>
          {movements.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center border border-dashed rounded-xl">
              No se registraron movimientos manuales en este turno.
            </p>
          ) : (
            <MovementsTable movements={movements} />
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
