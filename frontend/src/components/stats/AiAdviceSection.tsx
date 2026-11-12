import type { StrategicInsightResponse } from '@/types/stats';

interface AiAdviceSectionProps {
  aiData: StrategicInsightResponse | null;
  aiLoading: boolean;
  aiError: string | null;
  handleRequestAi: () => void;
  hasActivity?: boolean;
}

/** Consejos de IA sobre ventas, insumos y operación del período. */
export function AiAdviceSection({
  aiData,
  aiLoading,
  aiError,
  handleRequestAi,
  hasActivity = true,
}: AiAdviceSectionProps) {
  const debilidades = (aiData?.operational_weaknesses ?? aiData?.warnings ?? []).slice(0, 3);
  const oportunidades = (aiData?.highlights ?? []).slice(0, 3);
  const recomendaciones = (aiData?.recommendations ?? []).slice(0, 6);
  const gastosRecomendaciones = (aiData?.spending_recommendations ?? []).slice(0, 5);

  const hasMetrics = Boolean(
    aiData?.operational_metrics &&
      (aiData.operational_metrics.avg_wait_minutes > 0 ||
        (aiData.operational_metrics.peak_hour_orders ?? 0) > 0 ||
        aiData.operational_metrics.delivery_pct > 0 ||
        aiData.operational_metrics.pickup_pct > 0)
  );

  const hasContent =
    debilidades.length > 0 ||
    oportunidades.length > 0 ||
    recomendaciones.length > 0 ||
    gastosRecomendaciones.length > 0;

  return (
    <div className="shrink-0 bg-white rounded-2xl shadow-md p-6 border border-gray-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h4 className="text-base font-bold text-gray-900">Consejos de IA</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Análisis operativo y sugerencias prácticas para tu local.
          </p>
        </div>
        {(aiData || aiLoading) && (
          <button
            type="button"
            onClick={handleRequestAi}
            disabled={aiLoading}
            aria-label={aiLoading ? 'Analizando...' : 'Actualizar consejos'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-xs bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 cursor-pointer"
          >
            {aiLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Analizando...</span>
              </>
            ) : (
              <span>Actualizar consejos</span>
            )}
          </button>
        )}
      </div>

      {aiError && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-2">
          <span>{aiError}</span>
          <button
            type="button"
            onClick={handleRequestAi}
            className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs transition shrink-0 cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {aiLoading ? (
        <div className="py-10 flex flex-col items-center justify-center text-center space-y-2 bg-gray-50/60 rounded-xl border border-gray-100">
          <div className="w-7 h-7 border-3 border-gray-300 border-t-sky-600 rounded-full animate-spin" />
          <p className="text-xs font-bold text-gray-800">Analizando métricas con IA...</p>
          <p className="text-[11px] text-gray-500">Evaluando demoras, consumo de insumos y rentabilidad.</p>
        </div>
      ) : aiData ? (
        !hasContent ? (
          <div className="py-6 px-4 bg-gray-50/70 rounded-xl border border-gray-200 text-center">
            <p className="text-xs font-bold text-gray-800">No hay datos suficientes</p>
            <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
              {aiData.summary || 'No se registraron ventas ni actividad comercial suficiente en este período para generar un análisis.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Métricas operativas contextuales (solo si hay datos reales) */}
            {hasMetrics && aiData.operational_metrics && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50/70 p-3 rounded-xl border border-gray-200/60 text-gray-700">
                <div>
                  <span className="font-semibold block text-[11px] text-gray-500 uppercase">Demora promedio</span>
                  <span className="font-bold text-gray-900">{aiData.operational_metrics.avg_wait_minutes} min</span>
                  <span className="text-[10px] text-gray-400 ml-1">(máx {aiData.operational_metrics.max_wait_minutes} min)</span>
                </div>
                <div>
                  <span className="font-semibold block text-[11px] text-gray-500 uppercase">Hora pico</span>
                  <span className="font-bold text-gray-900">
                    {aiData.operational_metrics.peak_hour !== null ? `${aiData.operational_metrics.peak_hour}:00 hs` : 'Sin picos'}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-1">({aiData.operational_metrics.peak_hour_orders} pedidos)</span>
                </div>
                <div>
                  <span className="font-semibold block text-[11px] text-gray-500 uppercase">Modalidad de entrega</span>
                  <span className="font-bold text-gray-900">
                    {aiData.operational_metrics.delivery_pct}% Domicilio / {aiData.operational_metrics.pickup_pct}% Retiro
                  </span>
                </div>
              </div>
            )}

            {/* Diagnóstico General */}
            <div className="bg-zinc-900 text-white rounded-xl p-4 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Diagnóstico
              </span>
              <p className="text-xs leading-relaxed text-gray-100">{aiData.summary}</p>
            </div>

            {/* Debilidades y Oportunidades: 3 puntos cada uno */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Debilidades */}
              <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 block mb-2.5">
                  Debilidades
                </span>
                <ul className="space-y-2 text-xs text-amber-950 font-medium">
                  {debilidades.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold shrink-0">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Oportunidades */}
              <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-900 block mb-2.5">
                  Oportunidades
                </span>
                <ul className="space-y-2 text-xs text-emerald-950 font-medium">
                  {oportunidades.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recomendaciones Generales: 6 recomendaciones sin números */}
            <div className="bg-sky-50/70 border border-sky-200/70 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wide text-sky-900">
                  Recomendaciones
                </span>
                <span className="text-[11px] text-sky-700 font-semibold">Ventas, margen y rentabilidad</span>
              </div>
              <ul className="space-y-2 text-xs text-sky-950 font-medium">
                {recomendaciones.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recomendaciones de compras y gastos de insumos */}
            {gastosRecomendaciones.length > 0 && (
              <div className="bg-violet-50/70 border border-violet-200/70 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-violet-900">
                    Compras y Control de Gastos
                  </span>
                  <span className="text-[11px] text-violet-700 font-semibold">Insumos y rotación de platos</span>
                </div>
                <p className="text-[11px] text-violet-800/80 mb-2.5">
                  Sugerencias de abastecimiento según el consumo de ingredientes y la demanda de tus productos:
                </p>
                <ul className="space-y-2 text-xs text-violet-950 font-medium">
                  {gastosRecomendaciones.map((g, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-violet-600 font-bold shrink-0">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="py-6 px-4 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div>
            <p className="text-xs font-semibold text-gray-700">
              {!hasActivity
                ? 'Sin datos suficientes en este período'
                : 'El análisis con IA se genera solo a pedido para el período seleccionado.'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {!hasActivity
                ? 'No hay ventas registradas en el rango seleccionado. Elegí un período con actividad comercial.'
                : 'Elegí el rango de fechas arriba y presioná el botón para obtener debilidades, oportunidades y recomendaciones.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleRequestAi}
            className="px-3.5 py-1.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition shrink-0 cursor-pointer"
          >
            Analizar con IA
          </button>
        </div>
      )}
    </div>
  );
}
