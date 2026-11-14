import { useState } from 'react';
import type { CashShiftDetail, CashShiftSummaryBreakdown, CreateCashMovementPayload } from '@/types/cashShift';
import { parseAmount } from '@/utils/cashShift';
import { formatCurrency } from '@/utils/currency';
import { formatDayAndTime } from '@/utils/dateTime';

function MoneyCard({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-lg md:text-xl font-bold mt-2 ${valueClass}`}>{value}</span>
    </div>
  );
}

function DigitalSales({
  summary,
  onOpenModal,
}: {
  summary?: CashShiftSummaryBreakdown | null;
  onOpenModal?: (category: 'Transferencia' | 'Tarjeta') => void;
}) {
  return (
    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Ventas digitales</span>
          {onOpenModal && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenModal('Transferencia')}
                className="px-2 py-0.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 transition"
              >
                + Transferencia
              </button>
              <button
                type="button"
                onClick={() => onOpenModal('Tarjeta')}
                className="px-2 py-0.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-[11px] font-semibold text-gray-700 transition"
              >
                + Tarjeta
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
          <span>
            MercadoPago: <strong className="text-gray-900">{formatCurrency(summary?.mercadopago_sales ?? 0)}</strong>
          </span>
          <span>·</span>
          <span>
            Transferencia: <strong className="text-gray-900">{formatCurrency(summary?.transferencia_sales ?? 0)}</strong>
          </span>
          <span>·</span>
          <span>
            Tarjeta: <strong className="text-gray-900">{formatCurrency(summary?.tarjeta_sales ?? 0)}</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-gray-200 pt-3 md:pt-0 md:pl-6 shrink-0">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total digital</div>
          <div className="text-sm font-bold text-gray-900">{formatCurrency(summary?.total_digital_sales ?? 0)}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Total facturado</div>
          <div className="text-base font-extrabold text-gray-900">{formatCurrency(summary?.total_sales ?? 0)}</div>
        </div>
      </div>
    </div>
  );
}

interface ShiftSummaryCardsProps {
  shift: CashShiftDetail;
  onAddMovement?: (movement: CreateCashMovementPayload) => Promise<boolean>;
}

/** Datos del turno abierto, el dinero físico de la caja y lo cobrado por medios digitales. */
export function ShiftSummaryCards({ shift, onAddMovement }: ShiftSummaryCardsProps) {
  const summary = shift.summary;
  const [digitalCategory, setDigitalCategory] = useState<'Transferencia' | 'Tarjeta' | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveDigital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!digitalCategory || !onAddMovement) return;
    const parsed = parseAmount(amount);
    if (parsed === null || parsed <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ok = await onAddMovement({
        type: 'ingreso',
        amount: parsed,
        category: digitalCategory,
        description: description.trim() || undefined,
      });
      if (ok) {
        setDigitalCategory(null);
        setAmount('');
        setDescription('');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-gray-600">
        <div>
          <span className="font-semibold text-gray-900">Turno iniciado: </span>
          {formatDayAndTime(shift.opened_at)}
          {shift.opened_by_name && <span className="ml-2 text-gray-500">por {shift.opened_by_name}</span>}
        </div>
        {shift.notes && (
          <div className="italic text-gray-500 max-w-md truncate">Nota: &ldquo;{shift.notes}&rdquo;</div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MoneyCard label="Fondo inicial" value={formatCurrency(summary?.initial_amount ?? 0)} valueClass="text-gray-900" />
        <MoneyCard
          label="Ventas en efectivo"
          value={`+${formatCurrency(summary?.cash_sales ?? 0)}`}
          valueClass="text-emerald-600"
        />
        <MoneyCard
          label="Ingresos manuales"
          value={`+${formatCurrency(summary?.manual_income ?? 0)}`}
          valueClass="text-emerald-600"
        />
        <MoneyCard
          label="Egresos manuales"
          value={`-${formatCurrency(summary?.manual_expense ?? 0)}`}
          valueClass="text-rose-600"
        />
        <div className="col-span-2 md:col-span-1 bg-zinc-900 text-white rounded-2xl p-4 shadow-md flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">Caja teórica esperada</span>
          <span className="text-xl md:text-2xl font-black text-white mt-2">
            {formatCurrency(summary?.expected_cash ?? 0)}
          </span>
        </div>
      </div>

      <DigitalSales summary={summary} onOpenModal={onAddMovement ? setDigitalCategory : undefined} />

      {digitalCategory && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-900">Registrar venta ({digitalCategory})</h3>
              <button
                type="button"
                onClick={() => {
                  setDigitalCategory(null);
                  setError(null);
                }}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            {error && <div className="p-2 rounded-lg bg-red-50 text-red-700 text-xs">{error}</div>}
            <form onSubmit={handleSaveDigital} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Monto ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-base font-bold focus:ring-2 focus:ring-black focus:border-black"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
                  Detalle / Comprobante (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej. Transferencia cliente Juan..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDigitalCategory(null);
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-black text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
