import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistorialView } from '@/components/HistorialView';
import { IngresosView } from '@/components/IngresosView';
import { StatsSection } from '@/components/StatsSection';
import * as orderService from '@/services/orderService';
import * as statsService from '@/services/statsService';
import { makeOrder, makeOrderDetail } from '@/test/utils';

vi.mock('@/services/orderService');
vi.mock('@/services/statsService');

const orders = vi.mocked(orderService);
const stats = vi.mocked(statsService);

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

function kpi(label: string) {
  return plain(screen.getByText(label).nextElementSibling!.textContent);
}

const HISTORY = [
  makeOrder({ id: 1, customer_name: 'Ana', status: 'Finalizado', total_amount: 10000, created_at: new Date(2026, 9, 3, 12).toISOString() }),
  makeOrder({ id: 2, customer_name: 'Beto', status: 'Rechazado', total_amount: 99999, created_at: new Date(2026, 9, 3, 13).toISOString() }),
  makeOrder({ id: 3, customer_name: 'Caro', status: 'Confirmado', total_amount: 5000, created_at: new Date(2026, 9, 2, 20).toISOString() }),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 3, 15, 0));
  orders.fetchOrders.mockResolvedValue(HISTORY);
  orders.fetchOrderDetail.mockResolvedValue(makeOrderDetail());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HistorialView', () => {
  it('pide la última semana y factura solo los pedidos no rechazados', async () => {
    render(<HistorialView />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(orders.fetchOrders).toHaveBeenCalledWith({ dateFrom: new Date(2026, 8, 27), dateTo: new Date(2026, 9, 3, 23, 59, 59, 999) });
    expect(kpi('Dinero facturado')).toBe('$ 15.000,00');
    expect(kpi('Pedidos')).toBe('2');
    // Los rechazados se listan igual, aunque no se facturen.
    expect(screen.getByText('Beto')).toBeInTheDocument();
  });

  it('cambia el rango con los filtros', async () => {
    render(<HistorialView />);
    const user = userEvent.setup();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() =>
      expect(orders.fetchOrders).toHaveBeenLastCalledWith({ dateFrom: new Date(2026, 9, 3), dateTo: new Date(2026, 9, 3, 23, 59, 59, 999) })
    );

    await user.click(screen.getByRole('button', { name: 'Todo' }));
    await waitFor(() => expect(orders.fetchOrders).toHaveBeenLastCalledWith({ dateFrom: undefined, dateTo: undefined }));
  });

  it('el rango personalizado espera a tener las dos fechas', async () => {
    render(<HistorialView />);
    const user = userEvent.setup();
    await screen.findByText('Ana');
    orders.fetchOrders.mockClear();

    await user.click(screen.getByRole('button', { name: 'Rango personalizado' }));
    const [desde, hasta] = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    await user.type(desde, '2026-09-01');
    expect(orders.fetchOrders).not.toHaveBeenCalled();

    await user.type(hasta, '2026-09-15');
    await waitFor(() =>
      expect(orders.fetchOrders).toHaveBeenCalledWith({ dateFrom: new Date(2026, 8, 1), dateTo: new Date(2026, 8, 15, 23, 59, 59, 999) })
    );
  });

  it('muestra el estado vacío y los errores', async () => {
    orders.fetchOrders.mockResolvedValueOnce([]);
    const { unmount } = render(<HistorialView />);
    expect(await screen.findByText('No hay pedidos en el rango seleccionado.')).toBeInTheDocument();
    unmount();

    orders.fetchOrders.mockRejectedValueOnce(new Error('caído'));
    render(<HistorialView />);
    expect(await screen.findByText('No se pudieron cargar los pedidos.')).toBeInTheDocument();
  });

  it('abre el detalle de un pedido desde la tabla', async () => {
    render(<HistorialView />);
    const user = userEvent.setup();
    await screen.findByText('Ana');

    await user.click(screen.getByRole('button', { name: 'Ver detalle del pedido #1' }));

    expect(screen.getByRole('dialog', { name: 'Pedido #1' })).toBeInTheDocument();
  });
});

describe('IngresosView', () => {
  it('agrupa la facturación por día y por mes', async () => {
    render(<IngresosView />);
    const user = userEvent.setup();

    const rows = async () => (await screen.findAllByRole('row')).slice(1).map((r) => plain(r.textContent));

    expect(await rows()).toEqual(['03/10/20261$ 10.000,00', '02/10/20261$ 5.000,00']);
    expect(kpi('Dinero facturado')).toBe('$ 15.000,00');

    await user.click(screen.getByRole('button', { name: 'Mes' }));
    expect(await rows()).toEqual(['octubre de 20262$ 15.000,00']);
  });

  it('avisa si no hay ingresos en el rango', async () => {
    orders.fetchOrders.mockResolvedValue([HISTORY[1]]); // solo un rechazado
    render(<IngresosView />);

    expect(await screen.findByText('No hay ingresos en el rango seleccionado.')).toBeInTheDocument();
  });
});

describe('StatsSection', () => {
  beforeEach(() => {
    stats.fetchStatusDistribution.mockResolvedValue({ Finalizado: 12, Rechazado: 2 });
    stats.fetchTopProducts.mockResolvedValue([
      { product_name: 'Pizza Muzzarella', total_quantity: 30, total_revenue: 255000 },
      { product_name: 'Coca-Cola 500ml', total_quantity: 18, total_revenue: 45000 },
    ]);
    stats.fetchBestSellingDay.mockResolvedValue({ best_selling_day: 'Sábado', total_revenue: 120000 });
  });

  it('muestra el día más rentable, los estados y el top de productos', async () => {
    render(<StatsSection />);

    expect(await screen.findByText('Sábado')).toBeInTheDocument();
    expect(screen.getByText(/120\.000,00/)).toBeInTheDocument();
    expect(within(screen.getByText('Finalizado').parentElement!).getByText('12')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1).map((r) => plain(r.textContent));
    expect(rows).toEqual(['Pizza Muzzarella30$ 255.000,00', 'Coca-Cola 500ml18$ 45.000,00']);
  });

  it('vuelve a consultar al cambiar el período', async () => {
    render(<StatsSection />);
    const user = userEvent.setup();
    await screen.findByText('Sábado');

    await user.click(screen.getByRole('button', { name: 'Último mes' }));

    await waitFor(() =>
      expect(stats.fetchBestSellingDay).toHaveBeenLastCalledWith({ dateFrom: new Date(2026, 8, 4), dateTo: new Date(2026, 9, 3, 23, 59, 59, 999) })
    );
  });

  it('sin ventas muestra los estados vacíos', async () => {
    stats.fetchStatusDistribution.mockResolvedValue({});
    stats.fetchTopProducts.mockResolvedValue([]);
    stats.fetchBestSellingDay.mockResolvedValue({ best_selling_day: null, total_revenue: null });
    render(<StatsSection />);

    expect(await screen.findByText('Sin datos')).toBeInTheDocument();
    expect(screen.getByText('No hay registros de pedidos en este período.')).toBeInTheDocument();
    expect(screen.getByText('No hay productos vendidos registrados en este período.')).toBeInTheDocument();
  });

  it('muestra un error si falla alguna consulta', async () => {
    stats.fetchTopProducts.mockRejectedValue(new Error('caído'));
    render(<StatsSection />);

    expect(await screen.findByText('No se pudieron cargar las estadísticas del negocio.')).toBeInTheDocument();
  });
});
