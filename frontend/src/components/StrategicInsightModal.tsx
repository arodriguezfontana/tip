import { useState } from 'react';
import { fetchStrategicInsight } from '@/services/statsService';
import type { StatsParams, StrategicInsightResponse } from '@/types/stats';

interface StrategicInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: StatsParams;
}

export function StrategicInsightModal({ isOpen, onClose, params }: StrategicInsightModalProps) {
  const [data, setData] = useState<StrategicInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStrategicInsight(params);
      setData(res);
    } catch {
      setError('El servicio de Inteligencia Artificial tardó demasiado o no pudo responder. Podés reintentar.');
    } finally {
      setLoading(false);
    }
  };

  // Cargar al abrir
  const handleOpen = () => {
    if (!data && !loading) {
      loadData();
    }
  };

  if (!isOpen) return null;

  if (!data && !loading && !error) {
    handleOpen();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="insight-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h2 id="insight-modal-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
              Análisis del Negocio y Consejos con IA
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Evaluación de ventas, tiempos de espera y flujo de pedidos para identificar debilidades operativas y oportunidades.
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
          <div className="my-4 p-4 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-xs transition shrink-0 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-black rounded-full animate-spin" />
            <p className="text-sm text-gray-800 font-bold">Analizando métricas del negocio con IA...</p>
            <p className="text-xs text-gray-400">Evaluando demoras de cocina, cuellos de botella en horas pico y rentabilidad de insumos.</p>
          </div>
        ) : data ? (
          <div className="mt-5 space-y-5 text-sm">
            {/* Métricas operativas contextuales */}
            {data.operational_metrics && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50/70 p-3 rounded-2xl border border-gray-200/60 text-xs text-gray-700">
                <div className="flex items-center gap-2">
                  <div>
                    <span className="font-semibold block text-[11px] text-gray-500 uppercase">Demora promedio</span>
                    <span className="font-bold text-gray-900">{data.operational_metrics.avg_wait_minutes} min</span>
                    <span className="text-[10px] text-gray-400 ml-1">(máx {data.operational_metrics.max_wait_minutes} min)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <span className="font-semibold block text-[11px] text-gray-500 uppercase">Hora pico de demanda</span>
                    <span className="font-bold text-gray-900">
                      {data.operational_metrics.peak_hour !== null ? `${data.operational_metrics.peak_hour}:00 hs` : 'Sin picos'}
                    </span>
                    <span className="text-[10px] text-gray-400 ml-1">({data.operational_metrics.peak_hour_orders} ped.)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div>
                    <span className="font-semibold block text-[11px] text-gray-500 uppercase">Modalidad de entrega</span>
                    <span className="font-bold text-gray-900">
                      {data.operational_metrics.delivery_pct}% Domicilio / {data.operational_metrics.pickup_pct}% Retiro
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Resumen Ejecutivo */}
            <div className="bg-gradient-to-br from-gray-900 to-zinc-800 text-white rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Diagnóstico General
              </span>
              <p className="text-sm leading-relaxed text-gray-100">{data.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Debilidades Operativas Detectadas */}
              <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 flex items-center gap-1.5 mb-2.5">
                  Debilidades
                </span>
                <ul className="space-y-2 text-xs text-amber-950 font-medium">
                  {(data.operational_weaknesses ?? data.warnings).map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-600 font-bold shrink-0">•</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recomendaciones Concretas y Accionables */}
              <div className="bg-sky-50/70 border border-sky-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-sky-900 flex items-center gap-1.5 mb-2.5">
                  Recomendaciones
                </span>
                <ul className="space-y-2 text-xs text-sky-950 font-medium">
                  {data.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-sky-600 font-bold shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recomendaciones de Compras y Gastos */}
            {data.spending_recommendations && data.spending_recommendations.length > 0 && (
              <div className="bg-violet-50/70 border border-violet-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-violet-900 flex items-center gap-1.5 mb-1">
                  Compras y Control de Gastos
                </span>
                <p className="text-[11px] text-violet-800/80 mb-2.5">
                  Sugerencias de abastecimiento según consumo de ingredientes y rotación de platos:
                </p>
                <ul className="space-y-2 text-xs text-violet-950 font-medium">
                  {data.spending_recommendations.map((g, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-violet-600 font-bold shrink-0">•</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Puntos Destacados */}
            {data.highlights.length > 0 && (
              <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-900 flex items-center gap-1.5 mb-2.5">
                  Oportunidades
                </span>
                <ul className="space-y-2 text-xs text-emerald-950 font-medium">
                  {data.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold shrink-0">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="text-xs font-semibold text-gray-600 hover:text-black underline flex items-center gap-1 cursor-pointer"
              >
                Actualizar análisis
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-black hover:bg-gray-800 text-white text-xs font-semibold py-2 px-5 rounded-xl transition cursor-pointer"
              >
                Cerrar consejos
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
