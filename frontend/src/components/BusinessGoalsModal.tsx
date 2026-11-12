import { useMemo, useState } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchBusinessGoals, updateBusinessGoals } from '@/services/statsService';
import type { BusinessGoalItem } from '@/types/stats';
import { formatCurrency } from '@/utils/currency';

interface BusinessGoalsFormProps {
  initialGoals: BusinessGoalItem[];
  onClose: () => void;
  onSaved?: () => void;
}

type GoalPeriod = 'monthly' | 'weekly' | 'daily';

interface GoalValues {
  revenue: string;
  orders: string;
}

const DEFAULT_GOALS: Record<GoalPeriod, { revenue: number; orders: number }> = {
  monthly: { revenue: 5000000, orders: 300 },
  weekly: { revenue: 1250000, orders: 75 },
  daily: { revenue: 200000, orders: 15 },
};

const toNumber = (text: string) => Number(text) || 0;

function initialValues(goals: BusinessGoalItem[]): Record<GoalPeriod, GoalValues> {
  const valuesFor = (period: GoalPeriod): GoalValues => {
    const saved = goals.find((goal) => goal.period_type === period);
    return {
      revenue: String(saved?.target_revenue ?? DEFAULT_GOALS[period].revenue),
      orders: String(saved?.target_orders ?? DEFAULT_GOALS[period].orders),
    };
  };
  return { monthly: valuesFor('monthly'), weekly: valuesFor('weekly'), daily: valuesFor('daily') };
}

/** Semanal = mensual / 4 y diaria = semanal / 6 (el local abre 6 días), con al menos 1 pedido por día. */
function proportionalGoals(monthly: GoalValues): Pick<Record<GoalPeriod, GoalValues>, 'weekly' | 'daily'> {
  const weeklyRevenue = Math.round(toNumber(monthly.revenue) / 4);
  const weeklyOrders = Math.round(toNumber(monthly.orders) / 4);
  return {
    weekly: { revenue: String(weeklyRevenue), orders: String(weeklyOrders) },
    daily: {
      revenue: String(Math.round(weeklyRevenue / 6)),
      orders: String(Math.max(1, Math.round(weeklyOrders / 6))),
    },
  };
}

const PERIODS: { period: GoalPeriod; title: string; boxClass: string; titleClass: string; note?: string }[] = [
  {
    period: 'monthly',
    title: '📅 Meta Mensual (Último mes)',
    boxClass: 'bg-amber-50/60 border-amber-200/70',
    titleClass: 'text-amber-900',
    note: 'Base principal',
  },
  { period: 'weekly', title: '📆 Meta Semanal (Última semana)', boxClass: 'bg-sky-50/60 border-sky-200/70', titleClass: 'text-sky-900' },
  { period: 'daily', title: '☀️ Meta Diaria (Hoy)', boxClass: 'bg-emerald-50/60 border-emerald-200/70', titleClass: 'text-emerald-900' },
];

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black';

interface GoalCardProps {
  period: GoalPeriod;
  title: string;
  boxClass: string;
  titleClass: string;
  note?: string;
  values: GoalValues;
  onChange: (values: GoalValues) => void;
}

function GoalCard({ period, title, boxClass, titleClass, note, values, onChange }: GoalCardProps) {
  return (
    <div className={`rounded-2xl p-4 border ${boxClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${titleClass}`}>{title}</span>
        {note && <span className="text-[11px] text-amber-700 font-medium">{note}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${period}-rev-input`} className="block text-xs font-medium text-gray-700 mb-1">
            Facturación esperada ($)
          </label>
          <input
            id={`${period}-rev-input`}
            type="number"
            min="0"
            step="any"
            value={values.revenue}
            onChange={(e) => onChange({ ...values, revenue: e.target.value })}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(toNumber(values.revenue))}</p>
        </div>
        <div>
          <label htmlFor={`${period}-orders-input`} className="block text-xs font-medium text-gray-700 mb-1">
            Cantidad de pedidos
          </label>
          <input
            id={`${period}-orders-input`}
            type="number"
            min="0"
            value={values.orders}
            onChange={(e) => onChange({ ...values, orders: e.target.value })}
            className={INPUT_CLASS}
          />
          <p className="text-[11px] text-gray-400 mt-0.5">pedidos completados</p>
        </div>
      </div>
    </div>
  );
}

function BusinessGoalsForm({ initialGoals, onClose, onSaved }: BusinessGoalsFormProps) {
  const [values, setValues] = useState(() => initialValues(initialGoals));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAutoCalculate = () => setValues((current) => ({ ...current, ...proportionalGoals(current.monthly) }));

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const goals: BusinessGoalItem[] = PERIODS.map(({ period }) => ({
      period_type: period,
      target_revenue: Math.max(0, toNumber(values[period].revenue)),
      target_orders: Math.max(0, toNumber(values[period].orders)),
    }));
    try {
      await updateBusinessGoals({ goals });
      onSaved?.();
      onClose();
    } catch {
      setError('Error al guardar las metas comerciales. Verificá los valores.');
    } finally {
      setSaving(false);
    }
  };

  const card = (index: number) => {
    const { period, ...style } = PERIODS[index];
    return (
      <GoalCard
        period={period}
        {...style}
        values={values[period]}
        onChange={(next) => setValues((current) => ({ ...current, [period]: next }))}
      />
    );
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200">{error}</div>
      )}

      {card(0)}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAutoCalculate}
          className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline flex items-center gap-1"
        >
          ⚡ Autocalcular semanal y diario proporcionalmente
        </button>
      </div>

      {card(1)}
      {card(2)}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-black hover:bg-gray-800 text-white text-xs font-bold py-2.5 px-5 rounded-xl transition shadow-xs disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar Metas'}
        </button>
      </div>
    </form>
  );
}

interface BusinessGoalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function BusinessGoalsModal({ isOpen, onClose, onSaved }: BusinessGoalsModalProps) {
  const loadGoals = useMemo(() => (isOpen ? () => fetchBusinessGoals() : null), [isOpen]);
  const { data, loading, error } = useAsyncData(loadGoals, 'No se pudieron cargar las metas comerciales actuales.');

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="goals-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 id="goals-modal-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span>🎯</span> Configuración de Metas Comerciales
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Definí objetivos cuantitativos para evaluar el crecimiento real y supervisar el cumplimiento.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="my-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 py-10 text-center">Cargando metas configuradas...</p>
        ) : (
          <BusinessGoalsForm
            initialGoals={data?.goals ?? []}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </div>
    </div>
  );
}