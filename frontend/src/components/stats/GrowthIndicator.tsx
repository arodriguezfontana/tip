import type { GrowthMetric } from '@/types/stats';

export function GrowthIndicator({ metric, label }: { metric?: GrowthMetric; label?: string }) {
  if (!metric || metric.growth_pct === null || metric.growth_pct === undefined) return null;

  const value = Number(metric.growth_pct);
  if (isNaN(value)) return null;

  // Si metric.is_positive está definido, indica si la variación es favorable para el negocio.
  // Para métricas como cancelaciones o costos, que bajen (value < 0) es bueno (is_positive: true, en VERDE).
  // Si suben las cancelaciones (value > 0), es malo (is_positive: false, en ROJO).
  const isNeutral = value === 0 || metric.trend === 'neutral';
  const isFavorable = metric.is_positive !== undefined ? metric.is_positive : value > 0;

  const colorClass = isNeutral
    ? 'text-gray-600 bg-gray-50 border-gray-200'
    : isFavorable
    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : 'text-red-700 bg-red-50 border-red-200';

  const symbol = value > 0 ? '↑' : value < 0 ? '↓' : '•';
  const formattedValue = value > 0
    ? `+${value}%`
    : value < 0
    ? `-${Math.abs(value)}%`
    : '0%';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}
      title={`Período previo: ${metric.previous}`}
    >
      <span>{symbol}</span>
      <span>{formattedValue}</span>
      {label && <span className="font-normal opacity-85">{label}</span>}
    </span>
  );
}
