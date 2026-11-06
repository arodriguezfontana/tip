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

function BusinessGoalsForm({ initialGoals, onClose, onSaved }: BusinessGoalsFormProps) {
  const byType = useMemo(() => {
    const map: Record<string, BusinessGoalItem> = {};
    initialGoals.forEach((g) => {
      map[g.period_type] = g;
    });
    return map;
  }, [initialGoals]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [monthlyRev, setMonthlyRev] = useState(() => String(byType.monthly?.target_revenue ?? 5000000));
  const [monthlyOrders, setMonthlyOrders] = useState(() => String(byType.monthly?.target_orders ?? 300));

  const [weeklyRev, setWeeklyRev] = useState(() => String(byType.weekly?.target_revenue ?? 1250000));
  const [weeklyOrders, setWeeklyOrders] = useState(() => String(byType.weekly?.target_orders ?? 75));

  const [dailyRev, setDailyRev] = useState(() => String(byType.daily?.target_revenue ?? 200000));
  const [dailyOrders, setDailyOrders] = useState(() => String(byType.daily?.target_orders ?? 15));

  const handleAutoCalculate = () => {
    const mRev = Number(monthlyRev) || 0;
    const mOrd = Number(monthlyOrders) || 0;

    const wRev = Math.round(mRev / 4);
    const wOrd = Math.round(mOrd / 4);

    const dRev = Math.round(wRev / 6);
    const dOrd = Math.max(1, Math.round(wOrd / 6));

    setWeeklyRev(String(wRev));
    setWeeklyOrders(String(wOrd));
    setDailyRev(String(dRev));
    setDailyOrders(String(dOrd));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const goals: BusinessGoalItem[] = [
      {
        period_type: 'monthly',
        target_revenue: Math.max(0, Number(monthlyRev) || 0),
        target_orders: Math.max(0, Number(monthlyOrders) || 0),
      },
      {
        period_type: 'weekly',
        target_revenue: Math.max(0, Number(weeklyRev) || 0),
        target_orders: Math.max(0, Number(weeklyOrders) || 0),
      },
      {
        period_type: 'daily',
        target_revenue: Math.max(0, Number(dailyRev) || 0),
        target_orders: Math.max(0, Number(dailyOrders) || 0),
      },
    ];

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

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200">
          {error}
        </div>
      )}

      {/* Meta Mensual */}
      <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200/70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
            📅 Meta Mensual (Último mes)
          </span>
          <span className="text-[11px] text-amber-700 font-medium">Base principal</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="monthly-rev-input" className="block text-xs font-medium text-gray-700 mb-1">
              Facturación esperada ($)
            </label>
            <input
              id="monthly-rev-input"
              type="number"
              min="0"
              step="any"
              value={monthlyRev}
              onChange={(e) => setMonthlyRev(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(Number(monthlyRev) || 0)}</p>
          </div>
          <div>
            <label htmlFor="monthly-orders-input" className="block text-xs font-medium text-gray-700 mb-1">
              Cantidad de pedidos
            </label>
            <input
              id="monthly-orders-input"
              type="number"
              min="0"
              value={monthlyOrders}
              onChange={(e) => setMonthlyOrders(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">pedidos completados</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAutoCalculate}
          className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline flex items-center gap-1"
        >
          ⚡ Autocalcular semanal y diario proporcionalmente
        </button>
      </div>

      {/* Meta Semanal */}
      <div className="bg-sky-50/60 rounded-2xl p-4 border border-sky-200/70">
        <span className="text-xs font-bold uppercase tracking-wider text-sky-900 mb-2 block">
          📆 Meta Semanal (Última semana)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="weekly-rev-input" className="block text-xs font-medium text-gray-700 mb-1">
              Facturación esperada ($)
            </label>
            <input
              id="weekly-rev-input"
              type="number"
              min="0"
              step="any"
              value={weeklyRev}
              onChange={(e) => setWeeklyRev(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(Number(weeklyRev) || 0)}</p>
          </div>
          <div>
            <label htmlFor="weekly-orders-input" className="block text-xs font-medium text-gray-700 mb-1">
              Cantidad de pedidos
            </label>
            <input
              id="weekly-orders-input"
              type="number"
              min="0"
              value={weeklyOrders}
              onChange={(e) => setWeeklyOrders(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">pedidos completados</p>
          </div>
        </div>
      </div>

      {/* Meta Diaria */}
      <div className="bg-emerald-50/60 rounded-2xl p-4 border border-emerald-200/70">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2 block">
          ☀️ Meta Diaria (Hoy)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="daily-rev-input" className="block text-xs font-medium text-gray-700 mb-1">
              Facturación esperada ($)
            </label>
            <input
              id="daily-rev-input"
              type="number"
              min="0"
              step="any"
              value={dailyRev}
              onChange={(e) => setDailyRev(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">{formatCurrency(Number(dailyRev) || 0)}</p>
          </div>
          <div>
            <label htmlFor="daily-orders-input" className="block text-xs font-medium text-gray-700 mb-1">
              Cantidad de pedidos
            </label>
            <input
              id="daily-orders-input"
              type="number"
              min="0"
              value={dailyOrders}
              onChange={(e) => setDailyOrders(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-[11px] text-gray-400 mt-0.5">pedidos completados</p>
          </div>
        </div>
      </div>

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
