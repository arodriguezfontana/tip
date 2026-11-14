import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrowthIndicator } from './GrowthIndicator';

describe('GrowthIndicator', () => {
  it('muestra en verde cuando las ventas suben (is_positive: true)', () => {
    render(
      <GrowthIndicator
        metric={{
          current: 120,
          previous: 100,
          growth_pct: 20,
          trend: 'up',
          is_positive: true,
        }}
      />
    );
    const span = screen.getByTitle(/Período previo: 100/i);
    expect(span).toHaveClass('text-emerald-700');
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('muestra en rojo cuando las ventas bajan (is_positive: false)', () => {
    render(
      <GrowthIndicator
        metric={{
          current: 80,
          previous: 100,
          growth_pct: -20,
          trend: 'down',
          is_positive: false,
        }}
      />
    );
    const span = screen.getByTitle(/Período previo: 100/i);
    expect(span).toHaveClass('text-red-700');
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('muestra en VERDE cuando las cancelaciones bajan (growth negativo pero favorable)', () => {
    // Si bajan las cancelaciones, value es negativo (-15%), pero es bueno (is_positive: true) -> VERDE
    render(
      <GrowthIndicator
        metric={{
          current: 5,
          previous: 20,
          growth_pct: -15,
          trend: 'down',
          is_positive: true,
        }}
      />
    );
    const span = screen.getByTitle(/Período previo: 20/i);
    expect(span).toHaveClass('text-emerald-700');
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('muestra en ROJO cuando las cancelaciones suben (growth positivo pero desfavorable)', () => {
    // Si suben las cancelaciones, value es positivo (+10%), pero es malo (is_positive: false) -> ROJO
    render(
      <GrowthIndicator
        metric={{
          current: 25,
          previous: 15,
          growth_pct: 10,
          trend: 'up',
          is_positive: false,
        }}
      />
    );
    const span = screen.getByTitle(/Período previo: 15/i);
    expect(span).toHaveClass('text-red-700');
    expect(screen.getByText('↑')).toBeInTheDocument();
  });
});
