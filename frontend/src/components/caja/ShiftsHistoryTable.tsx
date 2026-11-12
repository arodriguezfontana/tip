import { ClockIcon } from '@/components/Icons';
import type { CashShift } from '@/types/cashShift';
import { formatCurrency } from '@/utils/currency';
import { formatDayAndTime } from '@/utils/dateTime';

const DIFFERENCE_BADGE_CLASS = {
  sobrante: 'bg-emerald-100 text-emerald-800',
  faltante: 'bg-rose-100 text-rose-800',
  exacta: 'bg-gray-100 text-gray-700',
};

function differenceLabel(shift: CashShift): string {
  if (shift.difference_type === 'exacta') return 'Exacta';
  const amount = formatCurrency(shift.difference ?? 0);
  return shift.difference_type === 'sobrante' ? `+${amount}` : amount;
}

function DifferenceBadge({ shift }: { shift: CashShift }) {
  if (!shift.difference_type) return <>-</>;
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${DIFFERENCE_BADGE_CLASS[shift.difference_type]}`}
    >
      {differenceLabel(shift)}
    </span>
  );
}

const orDash = (amount?: number | null) => (amount === null || amount === undefined ? '-' : formatCurrency(amount));

interface ShiftsHistoryTableProps {
  title: string;
  items: CashShift[];
  loading: boolean;
  onViewDetail: (id: number) => void;
  loadingDetailId: number | null;
}

function ShiftRow({
  shift,
  onViewDetail,
  loadingDetail,
}: {
  shift: CashShift;
  onViewDetail: (id: number) => void;
  loadingDetail: boolean;
}) {
  return (
    <tr className="hover:bg-gray-50 transition">
      <td className="py-3 px-3 font-bold text-gray-900">#{shift.id}</td>
      <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
          <span>{formatDayAndTime(shift.opened_at)}</span>
        </div>
      </td>
      <td className="py-3 px-3 text-gray-600 whitespace-nowrap">
        {shift.status === 'abierta' ? (
          <span className="text-emerald-600 font-bold">En curso</span>
        ) : (
          formatDayAndTime(shift.closed_at)
        )}
      </td>
      <td className="py-3 px-3 text-right font-medium text-gray-700">{formatCurrency(shift.initial_amount)}</td>
      <td className="py-3 px-3 text-right font-medium text-gray-900">{orDash(shift.expected_amount)}</td>
      <td className="py-3 px-3 text-right font-bold text-gray-900">{orDash(shift.final_amount)}</td>
      <td className="py-3 px-3 text-center whitespace-nowrap">
        <DifferenceBadge shift={shift} />
      </td>
      <td className="py-3 px-3 text-center">
        <button
          type="button"
          disabled={loadingDetail}
          onClick={() => onViewDetail(shift.id)}
          className="text-xs font-semibold text-gray-700 hover:text-black underline transition disabled:opacity-50"
        >
          {loadingDetail ? '...' : 'Ver detalle'}
        </button>
      </td>
    </tr>
  );
}

/** Los turnos de caja anteriores, del más nuevo al más viejo. */
export function ShiftsHistoryTable({ title, items, loading, onViewDetail, loadingDetailId }: ShiftsHistoryTableProps) {
  const heading = <h2 className="text-base font-bold text-gray-900 px-5 py-4">{title}</h2>;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {heading}
        <p className="text-xs text-gray-500 pb-6 text-center">Cargando historial de turnos...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {heading}
        <p className="pb-8 px-4 text-center text-sm text-gray-400">No hay turnos de caja registrados aún.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {heading}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase tracking-wider">
              <th className="py-3 px-3">Turno</th>
              <th className="py-3 px-3">Apertura</th>
              <th className="py-3 px-3">Cierre</th>
              <th className="py-3 px-3 text-right">Fondo inicial</th>
              <th className="py-3 px-3 text-right">Caja teórica</th>
              <th className="py-3 px-3 text-right">Monto real</th>
              <th className="py-3 px-3 text-center">Diferencia</th>
              <th className="py-3 px-3 text-center">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((shift) => (
              <ShiftRow
                key={shift.id}
                shift={shift}
                onViewDetail={onViewDetail}
                loadingDetail={loadingDetailId === shift.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
