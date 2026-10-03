import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComandasBoard } from '@/components/ComandasBoard';
import * as orderService from '@/services/orderService';
import { makeOrder, makeOrderDetail } from '@/test/utils';

vi.mock('@/services/orderService');
// El navegador de los tests no tiene audio: la alerta se prueba por separado.
vi.mock('@/hooks/useNewOrderAlert', () => ({
  useNewOrderAlert: () => ({
    enabled: true,
    toggleEnabled: vi.fn(),
    unlockAudio: vi.fn(),
    audioSupported: true,
    audioBlocked: false,
  }),
}));

const service = vi.mocked(orderService);

function column(title: string) {
  return screen.getByRole('heading', { name: title }).closest('div.rounded-2xl') as HTMLElement;
}

const ORDERS = [
  makeOrder({ id: 1, customer_name: 'Pendiente Ahora', status: 'Pendiente' }),
  makeOrder({ id: 2, customer_name: 'Pendiente Programado', status: 'Pendiente', scheduled_for: '2026-10-04T00:30:00Z' }),
  makeOrder({ id: 3, customer_name: 'Ya Confirmado', status: 'Confirmado', estimated_minutes: 20 }),
  makeOrder({ id: 4, customer_name: 'Viajando', status: 'En Camino' }),
  makeOrder({ id: 5, customer_name: 'Para Retirar', status: 'Listo para Retirar', delivery_method: 'retiro' }),
];

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchOrders.mockResolvedValue(ORDERS);
  service.fetchOrderDetail.mockResolvedValue(makeOrderDetail());
});

describe('ComandasBoard', () => {
  it('pide solo los pedidos activos y los reparte por columna', async () => {
    render(<ComandasBoard />);

    expect(await screen.findByText('Pendiente Ahora')).toBeInTheDocument();
    expect(service.fetchOrders).toHaveBeenCalledWith({
      status: ['Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar'],
    });
    expect(within(column('Confirmados')).getByText('Ya Confirmado')).toBeInTheDocument();
    expect(within(column('En Camino')).getByText('Viajando')).toBeInTheDocument();
    expect(within(column('Listo para Retirar')).getByText('Para Retirar')).toBeInTheDocument();
  });

  it('separa los pendientes para ahora de los programados, pero el contador los incluye a todos', async () => {
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Pendiente Ahora');
    const pendientes = column('Pendientes');

    expect(within(pendientes).getByText('2')).toBeInTheDocument();
    expect(within(pendientes).queryByText('Pendiente Programado')).not.toBeInTheDocument();

    await user.click(within(pendientes).getByRole('button', { name: 'Programados' }));

    expect(within(pendientes).getByText('Pendiente Programado')).toBeInTheDocument();
    expect(within(pendientes).queryByText('Pendiente Ahora')).not.toBeInTheDocument();
  });

  it('confirmar un pedido lo mueve a la columna de confirmados', async () => {
    service.updateOrderStatus.mockResolvedValue({ ...ORDERS[0], status: 'Confirmado', estimated_minutes: 15 });
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Pendiente Ahora');

    await user.click(within(column('Pendientes')).getByRole('button', { name: 'Confirmar' }));

    expect(service.updateOrderStatus).toHaveBeenCalledWith(1, 'Confirmado', undefined);
    await waitFor(() => expect(within(column('Confirmados')).getByText('Pendiente Ahora')).toBeInTheDocument());
    expect(within(column('Pendientes')).queryByText('Pendiente Ahora')).not.toBeInTheDocument();
  });

  it('finalizar un pedido lo saca del tablero', async () => {
    service.updateOrderStatus.mockResolvedValue({ ...ORDERS[3], status: 'Finalizado' });
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Viajando');

    await user.click(within(column('En Camino')).getByRole('button', { name: 'Finalizar' }));

    await waitFor(() => expect(screen.queryByText('Viajando')).not.toBeInTheDocument());
  });

  it('muestra el error si el cambio de estado falla y deja el pedido donde estaba', async () => {
    service.updateOrderStatus.mockRejectedValue({ message: "No se puede pasar de 'Rechazado' a 'Confirmado'." });
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Pendiente Ahora');

    await user.click(within(column('Pendientes')).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByText("No se puede pasar de 'Rechazado' a 'Confirmado'.")).toBeInTheDocument();
    expect(within(column('Pendientes')).getByText('Pendiente Ahora')).toBeInTheDocument();
  });

  it('avisa si no se pudieron cargar las comandas', async () => {
    service.fetchOrders.mockRejectedValue(new Error('caído'));
    render(<ComandasBoard />);

    expect(await screen.findByText('No se pudieron cargar las comandas.')).toBeInTheDocument();
  });

  it('pagina cada columna según la cantidad elegida', async () => {
    const muchos = Array.from({ length: 7 }, (_, i) =>
      makeOrder({ id: 100 + i, customer_name: `Cliente ${i}`, status: 'Confirmado', created_at: new Date(2026, 9, 3, 12, i).toISOString() })
    );
    service.fetchOrders.mockResolvedValue(muchos);
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Cliente 0');
    const confirmados = column('Confirmados');

    expect(within(confirmados).getByText('1 de 2')).toBeInTheDocument();
    expect(within(confirmados).queryByText('Cliente 5')).not.toBeInTheDocument();

    await user.click(within(confirmados).getByRole('button', { name: 'Siguiente' }));
    expect(within(confirmados).getByText('Cliente 5')).toBeInTheDocument();
    expect(within(confirmados).queryByText('Cliente 0')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7' }));
    expect(within(confirmados).queryByText(/de 2/)).not.toBeInTheDocument();
    expect(within(confirmados).getByText('Cliente 0')).toBeInTheDocument();
  });

  it('el botón Tomar pedido lleva a la carga de pedidos presenciales', async () => {
    const onTakeOrder = vi.fn();
    render(<ComandasBoard onTakeOrder={onTakeOrder} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /Tomar pedido/ }));

    expect(onTakeOrder).toHaveBeenCalled();
  });

  it('abre el detalle del pedido al tocar una tarjeta', async () => {
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Ya Confirmado');

    await user.click(screen.getByRole('button', { name: 'Ver detalle del pedido #3' }));

    expect(await screen.findByRole('dialog', { name: 'Pedido #3' })).toBeInTheDocument();
    expect(service.fetchOrderDetail).toHaveBeenCalledWith(3, expect.any(AbortSignal));
  });

  it('el modo simulación carga pedidos de prueba sin llamar a la API', async () => {
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Pendiente Ahora');

    await user.click(screen.getByRole('button', { name: 'Simular 55 Pedidos' }));

    expect(screen.getByText('Panel de Comandas (Modo Simulación)')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente Ahora')).not.toBeInTheDocument();
    await user.click(within(column('Pendientes')).getAllByRole('button', { name: 'Rechazar' })[0]);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
  });
});
