import { useMemo } from 'react';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchStrategicInsight } from '@/services/statsService';
import type { StatsParams } from '@/types/stats';

interface StrategicInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: StatsParams;
}

export function StrategicInsightModal({ isOpen, onClose, params }: StrategicInsightModalProps) {
  const loadInsight = useMemo(() => (isOpen ? () => fetchStrategicInsight(params) : null), [isOpen, params]);
  const { data, loading, error } = useAsyncData(loadInsight, 'No se pudo generar el análisis estratégico en este momento.');

  if (!isOpen) return null;

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
              <span>💡</span> Análisis Estratégico Comercial con IA
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Diagnóstico ejecutivo inteligente sobre tendencias, márgenes de ganancia y recomendaciones comerciales.
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
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-black rounded-full animate-spin" />
            <p className="text-sm text-gray-600 font-medium">Analizando métricas del negocio con IA...</p>
            <p className="text-xs text-gray-400">Evaluando rentabilidad de insumos, variaciones vs período previo y metas.</p>
          </div>
        ) : data ? (
          <div className="mt-5 space-y-5 text-sm">
            {/* Resumen Ejecutivo */}
            <div className="bg-gradient-to-br from-gray-900 to-zinc-800 text-white rounded-2xl p-5 shadow-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1">
                📋 Diagnóstico General
              </span>
              <p className="text-sm leading-relaxed text-gray-100">{data.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Puntos Destacados */}
              <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-emerald-900 flex items-center gap-1.5 mb-2.5">
                  <span>✨</span> Puntos Destacados
                </span>
                <ul className="space-y-2 text-xs text-emerald-950 font-medium">
                  {data.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Puntos de Atención / Riesgos */}
              <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-4">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-900 flex items-center gap-1.5 mb-2.5">
                  <span>⚠️</span> Puntos de Atención
                </span>
                {data.warnings.length === 0 ? (
                  <p className="text-xs text-amber-800">No se detectaron anomalías ni riesgos relevantes en el período.</p>
                ) : (
                  <ul className="space-y-2 text-xs text-amber-950 font-medium">
                    {data.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recomendaciones Estratégicas */}
            <div className="bg-sky-50/70 border border-sky-200/70 rounded-2xl p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-sky-900 flex items-center gap-1.5 mb-2.5">
                <span>🚀</span> Recomendaciones Accionables
              </span>
              <ul className="space-y-2 text-xs text-sky-950 font-medium">
                {data.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">→</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="bg-black hover:bg-gray-800 text-white text-xs font-semibold py-2 px-5 rounded-xl transition cursor-pointer"
              >
                Cerrar diagnóstico
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
