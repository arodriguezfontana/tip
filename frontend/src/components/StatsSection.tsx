import { useCallback, useMemo, useState } from 'react';
import { useStats } from '@/hooks/useStats';
import type { DateRangePreset } from '@/utils/dateRange';
import { parseDateInputValue, presetLabel, rangeForPreset } from '@/utils/dateRange';
import { PanelNote } from '@/components/ui/PanelNote';
import { BusinessGoalsModal } from '@/components/BusinessGoalsModal';
import { StrategicInsightModal } from '@/components/StrategicInsightModal';
import { fetchStrategicInsight } from '@/services/statsService';
import type { StrategicInsightResponse } from '@/types/stats';

const PRESETS: DateRangePreset[] = ['today', 'week', 'month', 'all', 'custom'];

import { AiAdviceSection } from '@/components/stats/AiAdviceSection';
import { GoalsProgress } from '@/components/stats/GoalsProgress';
import { KpiCards } from '@/components/stats/KpiCards';
import { TopProductsTable } from '@/components/stats/TopProductsTable';

export function StatsSection() {
  const [preset, setPreset] = useState<DateRangePreset>('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [goalsModalOpen, setGoalsModalOpen] = useState(false);
  const [insightModalOpen, setInsightModalOpen] = useState(false);

  const [aiData, setAiData] = useState<StrategicInsightResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const range = useMemo(
    () =>
      rangeForPreset(preset, {
        from: customFrom ? parseDateInputValue(customFrom) : undefined,
        to: customTo ? parseDateInputValue(customTo) : undefined,
      }),
    [preset, customFrom, customTo]
  );

  const handleRequestAi = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetchStrategicInsight({
        dateFrom: range.from,
        dateTo: range.to,
      });
      setAiData(res);
    } catch {
      setAiError('El servicio de Inteligencia Artificial tardó demasiado o no pudo responder. Podés reintentar.');
    } finally {
      setAiLoading(false);
    }
  }, [range.from, range.to]);

  const { statusDistribution, topProducts, bestDay, kpis, loading, error, reload } = useStats({
    dateFrom: range.from,
    dateTo: range.to,
  });

  const hasActivity = kpis
    ? kpis.orders_count.current > 0 || kpis.completed_orders_count > 0 || kpis.revenue.current > 0
    : true;

  return (
    <div className="flex flex-col gap-6 lg:h-full pb-28">
      {/* Barra superior con filtros */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Estadísticas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Panel de Rendimiento y Ventas</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                preset === p ? 'bg-black text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {presetLabel(p)}
            </button>
          ))}
        </div>
      </div>

      {preset === 'custom' && (
        <div className="shrink-0 flex items-center gap-2 bg-white p-4 rounded-2xl shadow-md border border-gray-100">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
          <span className="text-gray-400 text-sm font-medium">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      )}

      {loading ? (
        <PanelNote>Cargando métricas y estadísticas...</PanelNote>
      ) : error ? (
        <div className="shrink-0 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-1 lg:min-h-0 pb-16">
          <AiAdviceSection
            aiData={aiData}
            aiLoading={aiLoading}
            aiError={aiError}
            handleRequestAi={handleRequestAi}
            hasActivity={hasActivity}
          />
          <GoalsProgress kpis={kpis} setGoalsModalOpen={setGoalsModalOpen} />
          <KpiCards kpis={kpis} bestDay={bestDay} statusDistribution={statusDistribution} />
          <TopProductsTable kpis={kpis} topProducts={topProducts} />
          <div className="h-10 shrink-0" aria-hidden="true" />
        </div>
      )}

      {/* Modales */}
      <BusinessGoalsModal
        isOpen={goalsModalOpen}
        onClose={() => setGoalsModalOpen(false)}
        onSaved={reload}
      />

      <StrategicInsightModal
        isOpen={insightModalOpen}
        onClose={() => setInsightModalOpen(false)}
        params={{ dateFrom: range.from, dateTo: range.to }}
      />
    </div>
  );
}
