import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { CashIcon } from '@/components/Icons';
import type { OpenShiftForm } from '@/hooks/useCashForms';
import { parseAmount } from '@/utils/cashShift';

interface OpenShiftPanelProps {
  form: OpenShiftForm;
  onInvalid: (message: string) => void;
  onOpen: (amount: number, notes: string) => Promise<boolean>;
}

/** Aviso de caja cerrada y formulario para abrir el turno con el fondo inicial. */
export function OpenShiftPanel({ form, onInvalid, onOpen }: OpenShiftPanelProps) {
  const [opening, setOpening] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const amount = parseAmount(form.initialAmount);
    if (amount === null || amount < 0) {
      onInvalid('El monto inicial debe ser un número mayor o igual a 0.');
      return;
    }
    setOpening(true);
    try {
      if (await onOpen(amount, form.notes)) form.reset();
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <div
        className="rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 border"
        style={{
          backgroundColor: 'var(--primary-light, #f4f4f5)',
          borderColor: 'var(--primary-border, #e4e4e7)',
          color: 'var(--primary-text, #18181b)',
        }}
      >
        <div className="space-y-0.5">
          <h2 className="text-sm font-bold">La caja no está abierta actualmente</h2>
          <p className="text-xs opacity-90">
            Abrí un turno de caja para registrar cobros y pedidos.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-5">
          <div className="p-2.5 rounded-xl bg-gray-100 text-gray-800">
            <CashIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Apertura de turno de caja</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="open-initial-amount" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Fondo de caja inicial ($) *
            </label>
            <input
              id="open-initial-amount"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              value={form.initialAmount}
              onChange={(e) => form.setInitialAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-base font-medium focus:ring-2 focus:ring-black focus:border-black transition"
            />
          </div>

          <div>
            <label htmlFor="open-notes" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              Observaciones de apertura (opcional)
            </label>
            <textarea
              id="open-notes"
              rows={2}
              placeholder="Ej. Billetes de cambio chicos, cambio inicial entregado por encargado..."
              value={form.notes}
              onChange={(e) => form.setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-sm focus:ring-2 focus:ring-black focus:border-black transition"
            />
          </div>

          <button
            type="submit"
            disabled={opening}
            className="w-full py-3 rounded-xl bg-black text-white font-bold hover:bg-gray-800 transition disabled:opacity-50"
          >
            {opening ? 'Abriendo caja...' : 'Abrir caja e iniciar turno'}
          </button>
        </form>
      </div>
    </>
  );
}
