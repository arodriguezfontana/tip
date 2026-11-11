import type { GrowthMetric } from '@/types/stats';

export function GrowthIndicator({ metric, label }: { metric?: GrowthMetric; label?: string }) {
  if (!metric || metric.growth_pct === null) return null;
  const isUp = metric.trend === 'up';
  const isDown = metric.trend === 'down';
  const isPositive = metric.is_positive;

  const colorClass = isUp
    ? isPositive
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-700 bg-red-50 border-red-200'
    : isDown
    ? isPositive
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : 'text-red-700 bg-red-50 border-red-200'
    : 'text-gray-600 bg-gray-50 border-gray-200';

  const symbol = isUp ? '↑' : isDown ? '↓' : '•';
  const prefix = isUp ? '+' : '';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}
      title={`Período previo: ${metric.previous}`}
    >
      <span>{symbol}</span>
      <span>
        {prefix}
        {metric.growth_pct}%
      </span>
      {label && <span className="font-normal opacity-85">{label}</span>}
    </span>
  );
}
