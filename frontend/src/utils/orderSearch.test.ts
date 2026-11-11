import { describe, expect, it } from 'vitest';
import { makeOrder } from '@/test/utils';
import { orderMatchesSearch } from '@/utils/orderSearch';

const order = makeOrder({
  id: 900,
  shift_number: 66,
  customer_name: 'Emanuel Menager',
  shipping_address: 'Rodolfo López 1234, entre Mitre y Sarmiento',
  customer_phone: '1162939338',
});

describe('orderMatchesSearch', () => {
  it('coincide con todo cuando no hay texto', () => {
    expect(orderMatchesSearch(order, '')).toBe(true);
    expect(orderMatchesSearch(order, '   ')).toBe(true);
  });

  it('busca por número de pedido, con o sin numeral, exacto o parcial', () => {
    expect(orderMatchesSearch(order, '#66')).toBe(true);
    expect(orderMatchesSearch(order, '66')).toBe(true);
    expect(orderMatchesSearch(order, '6')).toBe(true);
    expect(orderMatchesSearch(order, '#7')).toBe(false);
  });

  it('usa el número del turno y no el id interno', () => {
    expect(orderMatchesSearch(makeOrder({ id: 900, shift_number: 5, customer_phone: null }), '900')).toBe(false);
  });

  it('busca por nombre sin distinguir mayúsculas', () => {
    expect(orderMatchesSearch(order, 'emanuel')).toBe(true);
    expect(orderMatchesSearch(order, 'MENAGER')).toBe(true);
    expect(orderMatchesSearch(order, 'fede')).toBe(false);
  });

  it('busca por dirección sin distinguir acentos', () => {
    expect(orderMatchesSearch(order, 'rodolfo lopez')).toBe(true);
    expect(orderMatchesSearch(order, 'mitre')).toBe(true);
  });

  it('busca por teléfono ignorando separadores', () => {
    expect(orderMatchesSearch(order, '1162939338')).toBe(true);
    expect(orderMatchesSearch(order, '11 6293-9338')).toBe(true);
    expect(orderMatchesSearch(order, '99999')).toBe(false);
  });
});
