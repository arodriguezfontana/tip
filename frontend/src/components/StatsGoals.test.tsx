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
  warnings: ['Demoras elevadas en la hora pico'],
  operational_weaknesses: [
    'Demora promedio de preparación de 38 min (máx 55 min) con 3 pedidos superando los 45 min',
    'Cuello de botella a las 21:00 hs con el 45% de los pedidos concentrados en esa franja',
  ],
  recommendations: [
    'Reforzar personal de cocina y pre-elaborar bases antes de las 21:00 hs',
    'Crear combos de pizzas y bebidas para subir el ticket promedio actual',
  ],
  operational_metrics: {
    avg_wait_minutes: 38.0,
    max_wait_minutes: 55,
    high_wait_count: 3,
    high_wait_pct: 20.0,
    peak_hour: 21,
    peak_hour_orders: 8,
    delivery_pct: 70.0,
    pickup_pct: 30.0,
  },
  generated_at: '2026-11-05T20:00:00Z',
};

describe('Dashboard de Métricas, Metas y Asistente IA', () => {
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

  describe('US-49: Dashboard de Metas y Rendimiento', () => {
    it('renderiza las barras de progreso de metas y los 4 KPIs estratégicos con indicadores de tendencia', async () => {
      render(<StatsSection />);

      // Verifica los botones de acción para Metas e Inteligencia Artificial
      expect(await screen.findByRole('button', { name: /Metas Comerciales/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Consejos de IA/i })).toBeInTheDocument();

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
  });

  describe('US-46: Análisis del negocio y recomendaciones con Inteligencia Artificial', () => {
    it('el análisis se genera a pedido del administrador y presenta debilidades operativas y recomendaciones concretas', async () => {
      render(<StatsSection />);
      const user = userEvent.setup();

      // Antes de presionar, la IA no se ejecutó automáticamente (solo a pedido)
      expect(stats.fetchStrategicInsight).not.toHaveBeenCalled();
      expect(await screen.findByText(/El análisis con IA se genera solo a pedido para el período seleccionado/i)).toBeInTheDocument();

      // Pedir análisis con IA
      const pedirBtn = screen.getByRole('button', { name: /Analizar con IA/i });
      await user.click(pedirBtn);

      // Esperar que se llame con el rango seleccionado
      await waitFor(() => expect(stats.fetchStrategicInsight).toHaveBeenCalledTimes(1));

      // Verifica apartado "Consejos de IA"
      expect(await screen.findByText(MOCK_INSIGHT.summary)).toBeInTheDocument();

      // Verifica métricas operativas de tiempos de espera y flujo de pedidos
      expect(screen.getByText('38 min')).toBeInTheDocument(); // Demora promedio
      expect(screen.getByText('21:00 hs')).toBeInTheDocument(); // Hora pico
      expect(screen.getByText('70% Domicilio / 30% Retiro')).toBeInTheDocument(); // Modalidad de entrega

      // Verifica debilidades operativas detectadas
      expect(screen.getByText(/Debilidades Operativas Detectadas/i)).toBeInTheDocument();
      expect(screen.getByText(/Demora promedio de preparación de 38 min/i)).toBeInTheDocument();
      expect(screen.getByText(/Cuello de botella a las 21:00 hs/i)).toBeInTheDocument();

      // Verifica recomendaciones concretas de acción
      expect(screen.getByText(/Recomendaciones Concretas/i)).toBeInTheDocument();
      expect(screen.getByText(/Reforzar personal de cocina y pre-elaborar bases antes de las 21:00 hs/i)).toBeInTheDocument();
      expect(screen.getByText(/Crear combos de pizzas y bebidas/i)).toBeInTheDocument();

      // Verifica que el botón cambie a "Actualizar consejos"
      expect(screen.getByRole('button', { name: /Actualizar consejos/i })).toBeInTheDocument();
    });

    it('si el servicio de IA falla o tarda demasiado, muestra mensaje de error con opción de reintentar y el resto de estadísticas sigue funcionando', async () => {
      stats.fetchStrategicInsight.mockRejectedValueOnce(new Error('Timeout de API'));

      render(<StatsSection />);
      const user = userEvent.setup();

      // El resto de la sección de Estadísticas funciona y está visible
      expect(await screen.findByText('Facturación Total')).toBeInTheDocument();
      expect(screen.getByText('Ticket Promedio')).toBeInTheDocument();
      expect(screen.getByText('Viernes')).toBeInTheDocument(); // Mejor día

      // Pedir análisis con IA que falla
      const pedirBtn = screen.getByRole('button', { name: /Analizar con IA/i });
      await user.click(pedirBtn);

      // Muestra mensaje de error claro y botón de reintentar
      expect(await screen.findByText(/El servicio de Inteligencia Artificial tardó demasiado o no pudo responder/i)).toBeInTheDocument();
      const reintentarBtn = screen.getByRole('button', { name: /Reintentar/i });
      expect(reintentarBtn).toBeInTheDocument();

      // El resto de las estadísticas sigue visible y funcionando
      expect(screen.getByText('Facturación Total')).toBeInTheDocument();
      expect(screen.getByText('Pizza Especial')).toBeInTheDocument();

      // Reintentar con éxito
      stats.fetchStrategicInsight.mockResolvedValueOnce(MOCK_INSIGHT);
      await user.click(reintentarBtn);

      expect(await screen.findByText(MOCK_INSIGHT.summary)).toBeInTheDocument();
      expect(screen.queryByText(/El servicio de Inteligencia Artificial tardó demasiado/i)).not.toBeInTheDocument();
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
    it('muestra el diagnóstico, fortalezas, debilidades operativas y recomendaciones', async () => {
      const handleClose = vi.fn();
      render(<StrategicInsightModal isOpen={true} onClose={handleClose} params={{}} />);

      expect(await screen.findByText(MOCK_INSIGHT.summary)).toBeInTheDocument();
      expect(screen.getByText('Margen bruto superior al 65%')).toBeInTheDocument();
      expect(screen.getByText(/Demora promedio de preparación de 38 min/i)).toBeInTheDocument();
      expect(screen.getByText(/Reforzar personal de cocina y pre-elaborar bases/i)).toBeInTheDocument();

      const user = userEvent.setup();
      const closeBtn = screen.getByRole('button', { name: '✕' });
      await user.click(closeBtn);
      expect(handleClose).toHaveBeenCalled();
    });

    it('muestra mensaje de error con botón de reintentar si falla la consulta', async () => {
      stats.fetchStrategicInsight.mockRejectedValueOnce(new Error('Network error'));
      render(<StrategicInsightModal isOpen={true} onClose={vi.fn()} params={{}} />);

      expect(await screen.findByText(/El servicio de Inteligencia Artificial tardó demasiado o no pudo responder/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
    });
  });
});
