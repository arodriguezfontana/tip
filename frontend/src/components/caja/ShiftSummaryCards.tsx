import type { CashShiftDetail, CashShiftSummaryBreakdown } from '@/types/cashShift';
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
}: {
  summary?: CashShiftSummaryBreakdown | null;
}) {
  return (
    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Ventas digitales</span>
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
}

/** Datos del turno abierto, el dinero físico de la caja y lo cobrado por medios digitales. */
export function ShiftSummaryCards({ shift }: ShiftSummaryCardsProps) {
  const summary = shift.summary;

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

      <DigitalSales summary={summary} />
    </>
  );
}
