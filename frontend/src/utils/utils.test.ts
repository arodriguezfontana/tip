import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCurrency } from '@/utils/currency';
import { PHONE_PATTERN, getErrorMessage, validateCustomerData } from '@/utils/customerValidation';
import { parseDateInputValue, presetLabel, rangeForPreset } from '@/utils/dateRange';
import { ALERT_THRESHOLD_MS, formatElapsed, getDelayLevel } from '@/utils/elapsedTime';
import { groupOrdersByPeriod } from '@/utils/orderGrouping';
import { groupByCategory } from '@/utils/productGrouping';
import { COCA, FUGAZZETA, MUZZA, makeOrder } from '@/test/utils';

// Intl usa espacios no separables: se normalizan para comparar contra texto legible.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('formatea en pesos argentinos', () => {
    expect(plain(formatCurrency(8500))).toBe('$ 8.500,00');
    expect(plain(formatCurrency(1234567.5))).toBe('$ 1.234.567,50');
    expect(plain(formatCurrency(0))).toBe('$ 0,00');
  });
});

describe('validateCustomerData', () => {
  const valid = { full_name: 'Ana Gómez', phone: '+54 11 5555-1234', address: 'Calle Falsa 123' };

  it('acepta datos completos', () => {
    expect(validateCustomerData(valid)).toEqual({});
  });

  it('exige nombre, teléfono y dirección (ignorando espacios)', () => {
    expect(validateCustomerData({ full_name: '  ', phone: '', address: ' ' })).toEqual({
      full_name: 'Ingresá tu nombre.',
      phone: 'Ingresá tu número de teléfono.',
      address: 'Ingresá tu dirección.',
    });
  });

  it.each(['abc', '12345', '11-4444-5555 int 2', '1'.repeat(31)])('rechaza el teléfono inválido %s', (phone) => {
    expect(validateCustomerData({ ...valid, phone }).phone).toMatch(/teléfono válido/);
  });

  it.each(['1144445555', '(011) 4444-5555', '+54 9 11 4444 5555'])('acepta el teléfono %s', (phone) => {
    expect(PHONE_PATTERN.test(phone)).toBe(true);
  });
});

describe('getErrorMessage', () => {
  it('usa el mensaje del error de la API si lo hay', () => {
    expect(getErrorMessage({ message: 'Sin stock', statusCode: 400 }, 'fallback')).toBe('Sin stock');
  });

  it.each([null, undefined, 'texto', { statusCode: 500 }, { message: 42 }])('usa el mensaje por defecto con %s', (err) => {
    expect(getErrorMessage(err, 'fallback')).toBe('fallback');
  });
});

describe('dateRange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 15, 30)); // 3/10/2026 15:30 hora local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parsea el valor de un input date como fecha local (sin correrse un día)', () => {
    const date = parseDateInputValue('2026-09-28');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 8, 28, 0]);
  });

  it('hoy va de las 00:00 a las 23:59:59.999', () => {
    const { from, to } = rangeForPreset('today');
    expect(from).toEqual(new Date(2026, 9, 3, 0, 0, 0, 0));
    expect(to).toEqual(new Date(2026, 9, 3, 23, 59, 59, 999));
  });

  it('la última semana incluye hoy y los 6 días anteriores', () => {
    expect(rangeForPreset('week').from).toEqual(new Date(2026, 8, 27));
  });

  it('el último mes incluye hoy y los 29 días anteriores', () => {
    expect(rangeForPreset('month').from).toEqual(new Date(2026, 8, 4));
  });

  it('todo no filtra por fecha', () => {
    expect(rangeForPreset('all')).toEqual({});
  });

  it('el rango personalizado abarca los días completos', () => {
    const range = rangeForPreset('custom', { from: new Date(2026, 8, 1, 12), to: new Date(2026, 8, 2, 8) });
    expect(range).toEqual({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 2, 23, 59, 59, 999) });
    expect(rangeForPreset('custom')).toEqual({ from: undefined, to: undefined });
  });

  it('tiene etiquetas en español', () => {
    expect(presetLabel('week')).toBe('Última semana');
    expect(presetLabel('custom')).toBe('Rango personalizado');
  });
});

describe('elapsedTime', () => {
  const created = new Date('2026-10-03T18:00:00Z').getTime();
  const at = (minutes: number) => created + minutes * 60000;

  it('formatea los minutos transcurridos sin negativos', () => {
    expect(formatElapsed(0)).toBe('0min');
    expect(formatElapsed(125000)).toBe('2min');
    expect(formatElapsed(-5000)).toBe('0min');
    expect(ALERT_THRESHOLD_MS).toBe(2 * 60 * 1000);
  });

  it('un pedido para ahora pasa a "por vencer" en el último 25% del tiempo estimado y luego a "atrasado"', () => {
    const order = makeOrder({ status: 'Confirmado', estimated_minutes: 40, created_at: new Date(created).toISOString() });
    expect(getDelayLevel(order, at(29))).toBe('on-time');
    expect(getDelayLevel(order, at(30))).toBe('warning');
    expect(getDelayLevel(order, at(40))).toBe('warning');
    expect(getDelayLevel(order, at(41))).toBe('late');
  });

  it('un programado pasa a "por vencer" 15 minutos antes de su horario', () => {
    const order = makeOrder({
      status: 'En Camino',
      created_at: new Date(created).toISOString(),
      scheduled_for: new Date(at(120)).toISOString(),
    });
    expect(getDelayLevel(order, at(104))).toBe('on-time');
    expect(getDelayLevel(order, at(105))).toBe('warning');
    expect(getDelayLevel(order, at(121))).toBe('late');
  });

  it.each(['Pendiente', 'Listo para Retirar', 'Finalizado', 'Rechazado'] as const)(
    'no aplica a pedidos en estado %s',
    (status) => {
      expect(getDelayLevel(makeOrder({ status, estimated_minutes: 30 }), Date.now())).toBeNull();
    }
  );

  it('no aplica si no hay demora ni horario', () => {
    expect(getDelayLevel(makeOrder({ status: 'Confirmado' }), Date.now())).toBeNull();
  });
});

describe('groupOrdersByPeriod', () => {
  const orders = [
    makeOrder({ id: 1, total_amount: 1000, created_at: new Date(2026, 8, 28, 12).toISOString() }), // lunes
    makeOrder({ id: 2, total_amount: 2000, created_at: new Date(2026, 8, 28, 21).toISOString() }),
    makeOrder({ id: 3, total_amount: 500, created_at: new Date(2026, 9, 4, 13).toISOString() }), // domingo
    makeOrder({ id: 4, total_amount: 700, created_at: new Date(2026, 9, 5, 13).toISOString() }), // lunes siguiente
  ];

  it('agrupa por día, del más reciente al más antiguo', () => {
    const groups = groupOrdersByPeriod(orders, 'day');
    expect(groups.map((g) => [g.key, g.orderCount, g.revenue])).toEqual([
      ['2026-10-05', 1, 700],
      ['2026-10-04', 1, 500],
      ['2026-09-28', 2, 3000],
    ]);
    expect(groups[2].label).toBe('28/09/2026');
  });

  it('agrupa por semana de lunes a domingo', () => {
    const groups = groupOrdersByPeriod(orders, 'week');
    expect(groups.map((g) => [g.key, g.orderCount, g.revenue])).toEqual([
      ['2026-10-05', 1, 700],
      ['2026-09-28', 3, 3500],
    ]);
  });

  it('agrupa por mes', () => {
    const groups = groupOrdersByPeriod(orders, 'month');
    expect(groups.map((g) => [g.key, g.orderCount, g.revenue])).toEqual([
      ['2026-10', 2, 1200],
      ['2026-09', 2, 3000],
    ]);
    expect(groups[0].label).toBe('octubre de 2026');
  });

  it('sin pedidos no hay grupos', () => {
    expect(groupOrdersByPeriod([], 'day')).toEqual([]);
  });
});

describe('groupByCategory', () => {
  it('agrupa respetando el orden en que aparecen las categorías', () => {
    const groups = groupByCategory([MUZZA, COCA, FUGAZZETA]);
    expect(groups.map((g) => [g.category.name, g.products.map((p) => p.name)])).toEqual([
      ['Pizzas', ['Pizza Muzzarella', 'Fugazzeta']],
      ['Bebidas', ['Coca-Cola 500ml']],
    ]);
  });
});
