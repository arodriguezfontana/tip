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
import { BestDayAndStatuses } from '@/components/stats/BestDayAndStatuses';
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

  return (
    <div className="flex flex-col gap-6 lg:h-full">
      {/* Barra superior con filtros y acciones */}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Panel de Rendimiento y Ventas</h3>
          <p className="text-xs text-gray-500 mt-0.5">Métricas clave, seguimiento de metas y evaluación de rentabilidad comercial.</p>
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

          <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={() => setGoalsModalOpen(true)}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition flex items-center gap-1.5 shadow-2xs"
          >
            <span>🎯</span> Metas Comerciales
          </button>

          <button
            type="button"
            onClick={handleRequestAi}
            className="rounded-xl px-3 py-1.5 text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>💡</span> Consejos de IA
          </button>
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
        <div className="flex flex-col gap-6 lg:flex-1 lg:min-h-0">
          <GoalsProgress kpis={kpis} setGoalsModalOpen={setGoalsModalOpen} />
          <KpiCards kpis={kpis} />
          <AiAdviceSection aiData={aiData} aiLoading={aiLoading} aiError={aiError} handleRequestAi={handleRequestAi} />
          <BestDayAndStatuses kpis={kpis} bestDay={bestDay} statusDistribution={statusDistribution} />
          <TopProductsTable kpis={kpis} topProducts={topProducts} />
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
