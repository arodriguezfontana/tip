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
  localStorage.clear();
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

  it('cancela un pedido desde su detalle: sale del tablero y la ventana se cierra', async () => {
    service.updateOrderStatus.mockResolvedValue(makeOrder({ id: 3, status: 'Cancelado' }));
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Ya Confirmado');

    await user.click(screen.getByRole('button', { name: 'Ver detalle del pedido #3' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pedido #3' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }));

    expect(service.updateOrderStatus).toHaveBeenCalledWith(3, 'Cancelado', undefined);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Ya Confirmado')).not.toBeInTheDocument();
  });

  it('el modo simulación carga pedidos de prueba sin llamar a la API', async () => {
    render(<ComandasBoard />);
    const user = userEvent.setup();
    await screen.findByText('Pendiente Ahora');

    await user.click(screen.getByRole('button', { name: 'Simular 50 Pedidos' }));

    expect(screen.getByText('Panel de Comandas (Modo Simulación)')).toBeInTheDocument();
    expect(screen.queryByText('Pendiente Ahora')).not.toBeInTheDocument();
    await user.click(within(column('Pendientes')).getAllByRole('button', { name: 'Rechazar' })[0]);
    expect(service.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('el modo simulación no se ofrece en producción', async () => {
    vi.stubEnv('DEV', false);
    try {
      render(<ComandasBoard />);
      await screen.findByText('Pendiente Ahora');

      expect(screen.queryByRole('button', { name: 'Simular 50 Pedidos' })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  describe('Separación de comandas por sector (US-34)', () => {
    const SECTOR_ORDERS = [
      makeOrder({
        id: 11,
        customer_name: 'Solo Pizza',
        status: 'Confirmado',
        items: [
          { id: 101, product_id: 1, product_name: 'Muzza', quantity: 2, unit_price: 8000, subtotal: 16000, sector: 'pizzeria', is_prepared: false },
        ],
        sectors: ['pizzeria'],
      }),
      makeOrder({
        id: 12,
        customer_name: 'Solo Tragos',
        status: 'Confirmado',
        items: [
          { id: 102, product_id: 2, product_name: 'Fernet', quantity: 1, unit_price: 5000, subtotal: 5000, sector: 'barra', is_prepared: false },
        ],
        sectors: ['barra'],
      }),
      makeOrder({
        id: 13,
        customer_name: 'Pizza y Barra',
        status: 'Confirmado',
        items: [
          { id: 103, product_id: 1, product_name: 'Fugazzeta', quantity: 1, unit_price: 9000, subtotal: 9000, sector: 'pizzeria', is_prepared: false },
          { id: 104, product_id: 3, product_name: 'Cerveza', quantity: 2, unit_price: 3000, subtotal: 6000, sector: 'barra', is_prepared: false },
        ],
        sectors: ['pizzeria', 'barra'],
      }),
    ];

    it('muestra las pestañas de sectores con sus respectivos contadores', async () => {
      service.fetchOrders.mockResolvedValue(SECTOR_ORDERS);
      render(<ComandasBoard />);

      expect(await screen.findByText('Solo Pizza')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Todos/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pizzería/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Barra/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cocina/ })).toBeInTheDocument();
    });

    it('filtrar por un sector muestra únicamente los pedidos que tienen platos para ese sector', async () => {
      service.fetchOrders.mockResolvedValue(SECTOR_ORDERS);
      render(<ComandasBoard />);
      const user = userEvent.setup();

      expect(await screen.findByText('Solo Pizza')).toBeInTheDocument();
      expect(screen.getByText('Solo Tragos')).toBeInTheDocument();
      expect(screen.getByText('Pizza y Barra')).toBeInTheDocument();

      // Filtrar por Pizzería
      await user.click(screen.getByRole('button', { name: /Pizzería/ }));

      expect(screen.getByText('Solo Pizza')).toBeInTheDocument();
      expect(screen.getByText('Pizza y Barra')).toBeInTheDocument();
      expect(screen.queryByText('Solo Tragos')).not.toBeInTheDocument();
      expect(localStorage.getItem('resto_comandas_sector')).toBe('pizzeria');

      // Filtrar por Barra
      await user.click(screen.getByRole('button', { name: /Barra/ }));

      expect(screen.getByText('Solo Tragos')).toBeInTheDocument();
      expect(screen.getByText('Pizza y Barra')).toBeInTheDocument();
      expect(screen.queryByText('Solo Pizza')).not.toBeInTheDocument();
      expect(localStorage.getItem('resto_comandas_sector')).toBe('barra');

      // Volver a Todos
      await user.click(screen.getByRole('button', { name: /Todos/ }));
      expect(screen.getByText('Solo Pizza')).toBeInTheDocument();
      expect(screen.getByText('Solo Tragos')).toBeInTheDocument();
    });

    it('las tarjetas en el tablero no muestran platos ni checks para mantener legibilidad', async () => {
      service.fetchOrders.mockResolvedValue([SECTOR_ORDERS[0]]);
      render(<ComandasBoard />);

      expect(await screen.findByText('Solo Pizza')).toBeInTheDocument();
      expect(screen.queryByText('Muzza')).not.toBeInTheDocument();
      expect(screen.queryByText('2×')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar listo' })).not.toBeInTheDocument();
      expect(screen.queryByText('✓ Listo')).not.toBeInTheDocument();
      expect(screen.queryByText(/Progreso general/)).not.toBeInTheDocument();
    });
  });


});
