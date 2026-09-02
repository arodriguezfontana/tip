import type { AdminOrder } from '@/types/order';

export type GroupBy = 'day' | 'week' | 'month';

export interface RevenueGroup {
  key: string;
  label: string;
  orderCount: number;
  revenue: number;
}

function isoWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7; // Monday = 0
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

function groupKeyAndLabel(date: Date, groupBy: GroupBy): { key: string; label: string } {
  if (groupBy === 'day') {
    const key = date.toLocaleDateString('en-CA'); // YYYY-MM-DD, sortable
    const label = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return { key, label };
  }

  if (groupBy === 'week') {
    const weekStart = isoWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const key = weekStart.toLocaleDateString('en-CA');
    const label = `${weekStart.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} – ${weekEnd.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    return { key, label };
  }

  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return { key, label };
}

export function groupOrdersByPeriod(orders: AdminOrder[], groupBy: GroupBy): RevenueGroup[] {
  const groups = new Map<string, RevenueGroup>();

  for (const order of orders) {
    const date = new Date(order.created_at);
    const { key, label } = groupKeyAndLabel(date, groupBy);

    const existing = groups.get(key);
    if (existing) {
      existing.orderCount += 1;
      existing.revenue += order.total_amount;
    } else {
      groups.set(key, { key, label, orderCount: 1, revenue: order.total_amount });
    }
  }

  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}
