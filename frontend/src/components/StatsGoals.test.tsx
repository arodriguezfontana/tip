import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsSection } from '@/components/StatsSection';
import { BusinessGoalsModal } from '@/components/BusinessGoalsModal';
import { StrategicInsightModal } from '@/components/StrategicInsightModal';
import * as statsService from '@/services/statsService';
import type { DashboardKPIsResponse, BusinessGoalsResponse, StrategicInsightResponse } from '@/types/stats';

vi.mock('@/services/statsService');

const stats = vi.mocked(statsService);

const MOCK_KPIS: DashboardKPIsResponse = {
  revenue: { current: 150000, previous: 120000, growth_pct: 25.0, trend: 'up', is_positive: true },
  orders_count: { current: 15, previous: 12, growth_pct: 25.0, trend: 'up', is_positive: true },
  completed_orders_count: 15,
  average_ticket: { current: 10000, previous: 10000, growth_pct: 0.0, trend: 'neutral', is_positive: true },
  cancellation_rate: { current: 6.25, previous: 14.28, growth_pct: -56.23, trend: 'down', is_positive: true },
  cogs: { current: 45000, previous: 40000, growth_pct: 12.5, trend: 'up', is_positive: false },
  gross_profit: { current: 105000, previous: 80000, growth_pct: 31.25, trend: 'up', is_positive: true },
  gross_margin_pct: 70.0,
  goal: {
    period_type: 'weekly',
    target_revenue: 200000,
    revenue_progress_pct: 75.0,
    revenue_remaining: 50000,
    target_orders: 20,
    orders_progress_pct: 80.0,
    orders_remaining: 4,
  },
  best_selling_day: {
    day: 'Viernes',
    revenue: 90000,
    growth_pct: 20.0,
    trend: 'up',
  },
  status_distribution: { Finalizado: 15, Rechazado: 1 },
  top_products: [
    {
      product_name: 'Pizza Especial',
      total_quantity: 10,
      total_revenue: 90000,
      estimated_cost: 30000,
      gross_profit: 60000,
      margin_pct: 66.67,
      quantity_growth_pct: 10.0,
      revenue_growth_pct: 15.0,
    },
  ],
};

const MOCK_GOALS_RESPONSE: BusinessGoalsResponse = {
  goals: [
    { period_type: 'monthly', target_revenue: 4000000, target_orders: 240 },
    { period_type: 'weekly', target_revenue: 1000000, target_orders: 60 },
    { period_type: 'daily', target_revenue: 160000, target_orders: 10 },
  ],
};

const MOCK_INSIGHT: StrategicInsightResponse = {
  summary: 'Rendimiento comercial excelente impulsado por alta demanda de pizzas especiales.',
  highlights: ['Margen bruto superior al 65%', 'Ticket promedio estable en $10.000'],
  warnings: ['Costo de muzzarella en aumento'],
  recommendations: ['Crear combos de pizzas y bebidas para subir ticket promedio'],
  generated_at: '2026-11-05T20:00:00Z',
};

describe('US-49: Dashboard de Metas de Negocio y Rendimiento Comercial', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    stats.fetchStatusDistribution.mockResolvedValue({ Finalizado: 15, Rechazado: 1 });
    stats.fetchTopProducts.mockResolvedValue([
      { product_name: 'Pizza Especial', total_quantity: 10, total_revenue: 90000 },
    ]);
    stats.fetchBestSellingDay.mockResolvedValue({ best_selling_day: 'Viernes', total_revenue: 90000 });
    stats.fetchDashboardKPIs.mockResolvedValue(MOCK_KPIS);
    stats.fetchBusinessGoals.mockResolvedValue(MOCK_GOALS_RESPONSE);
    stats.fetchStrategicInsight.mockResolvedValue(MOCK_INSIGHT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('StatsSection con KPIs y Seguimiento de Metas', () => {
    it('renderiza las barras de progreso de metas y los 4 KPIs estratégicos con indicadores de tendencia', async () => {
      render(<StatsSection />);

      // Verifica los botones de acción para Metas e Inteligencia Artificial
      expect(await screen.findByRole('button', { name: /Metas Comerciales/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Diagnóstico IA/i })).toBeInTheDocument();

      // Verifica sección de Progreso vs Metas
      expect(screen.getByText('Seguimiento de Metas Comerciales')).toBeInTheDocument();
      expect(screen.getByText('75% alcanzado')).toBeInTheDocument();
      expect(screen.getByText('80% alcanzado')).toBeInTheDocument();
      expect(screen.getByText('Faltan $ 50.000,00')).toBeInTheDocument();
      expect(screen.getByText('Faltan 4 pedidos')).toBeInTheDocument();

      // Verifica los 4 KPIs estratégicos
      expect(screen.getByText('Facturación Total')).toBeInTheDocument();
      expect(screen.getByText('Ticket Promedio')).toBeInTheDocument();
      expect(screen.getByText('Margen Bruto')).toBeInTheDocument();
      expect(screen.getByText('Tasa de Cancelación')).toBeInTheDocument();

      // Verifica valores formateados
      expect(screen.getByText('70%')).toBeInTheDocument(); // Margen bruto %
      expect(screen.getByText('6.25%')).toBeInTheDocument(); // Tasa de rechazo

      // Verifica tabla de productos enriquecida con columnas de rentabilidad
      expect(screen.getByText('Costo Est.')).toBeInTheDocument();
      expect(screen.getByText('Ganancia Bruta')).toBeInTheDocument();
      expect(screen.getByText('Margen %')).toBeInTheDocument();
      expect(screen.getByText('66.67%')).toBeInTheDocument();
    });

    it('abre el modal de Metas Comerciales al hacer clic en el botón', async () => {
      render(<StatsSection />);
      const user = userEvent.setup();

      const metasBtn = await screen.findByRole('button', { name: /Metas Comerciales/i });
      await user.click(metasBtn);

      expect(await screen.findByRole('dialog', { name: /Configuración de Metas Comerciales/i })).toBeInTheDocument();
      expect(screen.getByText(/Meta Mensual/i)).toBeInTheDocument();
    });

    it('abre el modal de Diagnóstico IA al hacer clic en el botón', async () => {
      render(<StatsSection />);
      const user = userEvent.setup();

      const aiBtn = await screen.findByRole('button', { name: /Diagnóstico IA/i });
      await user.click(aiBtn);

      expect(await screen.findByRole('dialog', { name: /Análisis Estratégico Comercial con IA/i })).toBeInTheDocument();
      expect(await screen.findByText(MOCK_INSIGHT.summary)).toBeInTheDocument();
    });
  });

  describe('BusinessGoalsModal', () => {
    it('carga las metas existentes y permite autocalcular y guardar', async () => {
      const handleClose = vi.fn();
      const handleSaved = vi.fn();
      stats.updateBusinessGoals.mockResolvedValue(MOCK_GOALS_RESPONSE);

      render(<BusinessGoalsModal isOpen={true} onClose={handleClose} onSaved={handleSaved} />);
      const user = userEvent.setup();

      // Esperar a que se carguen los valores de las metas
      expect(await screen.findByDisplayValue('4000000')).toBeInTheDocument();
      expect(screen.getByDisplayValue('240')).toBeInTheDocument();

      // Probar autocalcular
      const calcBtn = screen.getByRole('button', { name: /Autocalcular semanal y diario/i });
      await user.click(calcBtn);

      // Guardar
      const saveBtn = screen.getByRole('button', { name: /Guardar Metas/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(stats.updateBusinessGoals).toHaveBeenCalledTimes(1);
        expect(handleSaved).toHaveBeenCalled();
        expect(handleClose).toHaveBeenCalled();
      });
    });

    it('cierra el modal al pulsar cancelar', async () => {
      const handleClose = vi.fn();
      render(<BusinessGoalsModal isOpen={true} onClose={handleClose} />);
      const user = userEvent.setup();

      expect(await screen.findByText('Configuración de Metas Comerciales')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('StrategicInsightModal', () => {
    it('muestra el diagnóstico, fortalezas, alertas y recomendaciones', async () => {
      const handleClose = vi.fn();
      render(<StrategicInsightModal isOpen={true} onClose={handleClose} params={{}} />);

      expect(await screen.findByText(MOCK_INSIGHT.summary)).toBeInTheDocument();
      expect(screen.getByText('Margen bruto superior al 65%')).toBeInTheDocument();
      expect(screen.getByText('Costo de muzzarella en aumento')).toBeInTheDocument();
      expect(screen.getByText('Crear combos de pizzas y bebidas para subir ticket promedio')).toBeInTheDocument();

      const user = userEvent.setup();
      const closeBtn = screen.getByRole('button', { name: '✕' });
      await user.click(closeBtn);
      expect(handleClose).toHaveBeenCalled();
    });

    it('muestra mensaje de error si falla la consulta', async () => {
      stats.fetchStrategicInsight.mockRejectedValueOnce(new Error('Network error'));
      render(<StrategicInsightModal isOpen={true} onClose={vi.fn()} params={{}} />);

      expect(await screen.findByText('No se pudo generar el análisis estratégico en este momento.')).toBeInTheDocument();
    });
  });
});
