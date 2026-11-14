import { useState } from 'react';
import type { CloseShiftForm } from '@/hooks/useCashForms';
import type { DifferenceType } from '@/types/cashShift';
import { classifyDifference, parseAmount } from '@/utils/cashShift';
import { formatCurrency } from '@/utils/currency';

const DIFFERENCE_BOX_CLASS: Record<DifferenceType, string> = {
  sobrante: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  faltante: 'bg-rose-50 text-rose-900 border-rose-200',
  exacta: 'bg-blue-50 text-blue-900 border-blue-200',
};

const DIFFERENCE_TITLE: Record<DifferenceType, string> = {
  sobrante: 'Sobrante detectado:',
  faltante: 'Faltante detectado:',
  exacta: 'Caja exacta:',
};

function differenceAmount(type: DifferenceType, difference: number): string {
  if (type === 'exacta') return '$ 0.00';
  return type === 'sobrante' ? `+${formatCurrency(difference)}` : formatCurrency(difference);
}

function ConfirmCloseModal({
  declared,
  difference,
  closing,
  onCancel,
  onConfirm,
}: {
  declared: number;
  difference: number;
  closing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const type = classifyDifference(difference);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-bold text-gray-900">¿Confirmás el cierre de la caja?</h3>
        <p className="text-sm text-gray-600">
          Monto real declarado: <strong>{formatCurrency(declared)}</strong>
          <br />
          {type === 'sobrante' && (
            <span className="text-emerald-700 font-semibold">Se registrará un sobrante de +{formatCurrency(difference)}.</span>
          )}
          {type === 'faltante' && (
            <span className="text-rose-700 font-semibold">Se registrará un faltante de {formatCurrency(difference)}.</span>
          )}
          {type === 'exacta' && <span className="text-blue-700 font-semibold">La caja cierra de manera exacta.</span>}
        </p>
        <p
          className="text-xs p-2.5 rounded-lg border"
          style={{
            backgroundColor: 'var(--primary-light, #f4f4f5)',
            borderColor: 'var(--primary-border, #e4e4e7)',
            color: 'var(--primary-text, #18181b)',
          }}
        >
          Esta acción no se puede deshacer. Los pedidos y movimientos de este turno quedarán sellados.
        </p>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            disabled={closing}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={closing}
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-black text-white text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50"
          >
            {closing ? 'Cerrando...' : 'Sí, cerrar turno'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CloseShiftTabProps {
  form: CloseShiftForm;
  expectedCash: number;
  onClose: (finalAmount: number, notes: string) => Promise<boolean>;
}

/** Arqueo: compara el efectivo contado con el esperado y, tras confirmar, cierra el turno. */
export function CloseShiftTab({ form, expectedCash, onClose }: CloseShiftTabProps) {
  const [closing, setClosing] = useState(false);
  const counted = parseAmount(form.finalAmount);
  const validCounted = counted !== null && counted >= 0 ? counted : null;
  const difference = validCounted === null ? null : validCounted - expectedCash;
  const differenceType = difference === null ? null : classifyDifference(difference);

  const handleConfirm = async () => {
    if (validCounted === null) return;
    setClosing(true);
    try {
      if (await onClose(validCounted, form.notes)) form.reset();
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
      <div className="border-b border-gray-100 pb-3">
        <h2 className="text-lg font-bold text-gray-900">Cierre de caja</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <div className="bg-gray-50 rounded-xl p-4 space-y-4 border border-gray-200">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600 font-medium">Caja teórica esperada:</span>
            <span className="font-extrabold text-gray-900 text-base">{formatCurrency(expectedCash)}</span>
          </div>

          <div>
            <label htmlFor="close-final-amount" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Monto real contado en efectivo ($) *
            </label>
            <input
              id="close-final-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.finalAmount}
              onChange={(e) => form.setFinalAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-lg font-bold text-gray-900 focus:ring-2 focus:ring-black focus:border-black transition"
            />
          </div>

          {difference !== null && differenceType && (
            <div
              className={`p-3.5 rounded-xl text-sm font-semibold flex items-center justify-between border ${DIFFERENCE_BOX_CLASS[differenceType]}`}
            >
              <span>{DIFFERENCE_TITLE[differenceType]}</span>
              <span className="text-base font-extrabold">{differenceAmount(differenceType, difference)}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="close-notes" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Observaciones de cierre (opcional)
            </label>
            <textarea
              id="close-notes"
              rows={3}
              placeholder="Justificación de diferencias, retiros finales..."
              value={form.notes}
              onChange={(e) => form.setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
            />
          </div>

          <div
            className="rounded-xl p-3.5 text-xs border"
            style={{
              backgroundColor: 'var(--primary-light, #f4f4f5)',
              borderColor: 'var(--primary-border, #e4e4e7)',
              color: 'var(--primary-text, #18181b)',
            }}
          >
            Al cerrar la caja, el turno quedará sellado y se guardará el arqueo final.
          </div>

          <button
            type="button"
            disabled={validCounted === null || closing}
            onClick={() => form.setConfirming(true)}
            className="w-full py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition disabled:opacity-50"
          >
            Cerrar turno de caja
          </button>
        </div>
      </div>

      {form.confirming && validCounted !== null && difference !== null && (
        <ConfirmCloseModal
          declared={validCounted}
          difference={difference}
          closing={closing}
          onCancel={() => form.setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
