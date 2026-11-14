import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepartidoresSection } from '@/components/repartidores/RepartidoresSection';
import * as deliveryDriverService from '@/services/deliveryDriverService';
import type { DeliveryDriver, DriverActivity } from '@/types/deliveryDriver';

vi.mock('@/services/deliveryDriverService');

const service = vi.mocked(deliveryDriverService);

const NICO: DeliveryDriver = {
  id: 7,
  name: 'Nico Moto',
  phone: '1144445555',
  is_active: true,
  created_at: '2026-10-01T15:00:00Z',
  updated_at: '2026-10-01T15:00:00Z',
};

const ACTIVITY: DriverActivity = {
  trips_count: 2,
  delivered_orders_count: 1,
  cash_to_hand_over: 1500,
  trips: [
    {
      id: 12,
      dispatched_at: '2026-10-05T23:00:00Z',
      finished_at: null,
      is_in_progress: true,
      stops_count: 2,
      orders: [
        { id: 1, shift_number: 3, customer_name: 'Ana', shipping_address: 'Calle 1', payment_method: 'efectivo', total_amount: 1500, status: 'Finalizado' },
        { id: 2, shift_number: 4, customer_name: 'Beto', shipping_address: 'Calle 2', payment_method: 'mercadopago', total_amount: 2000, status: 'En Camino' },
      ],
    },
    {
      id: 11,
      dispatched_at: '2026-10-05T21:00:00Z',
      finished_at: '2026-10-05T21:40:00Z',
      is_in_progress: false,
      stops_count: 1,
      orders: [],
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchDeliveryDrivers.mockResolvedValue([NICO]);
  service.fetchDriverActivity.mockResolvedValue(ACTIVITY);
});

async function openActivityOf(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Ver viajes' }));
}

describe('RepartidoresSection - actividad de un repartidor', () => {
  it('pide los viajes del turno actual del repartidor elegido y muestra el resumen', async () => {
    const user = userEvent.setup();
    render(<RepartidoresSection />);

    await openActivityOf(user);

    expect(await screen.findByText('Efectivo a rendir')).toBeInTheDocument();
    expect(service.fetchDriverActivity).toHaveBeenCalledWith(7, { dateFrom: undefined, dateTo: undefined, currentShift: true });
    expect(screen.getByText('Viajes realizados').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Pedidos entregados').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Efectivo a rendir').nextSibling).toHaveTextContent(/1\.500/);
  });

  it('lista cada viaje con su estado y cantidad de paradas', async () => {
    const user = userEvent.setup();
    render(<RepartidoresSection />);
    await openActivityOf(user);

    const enCurso = await screen.findByRole('button', { name: 'Viaje #12' });
    expect(within(enCurso).getByText('En curso')).toBeInTheDocument();
    expect(within(enCurso).getByText('2 paradas')).toBeInTheDocument();

    const finalizado = screen.getByRole('button', { name: 'Viaje #11' });
    expect(within(finalizado).getByText('Finalizado')).toBeInTheDocument();
    expect(within(finalizado).getByText('1 parada')).toBeInTheDocument();
  });

  it('al expandir un viaje muestra el detalle de sus pedidos', async () => {
    const user = userEvent.setup();
    render(<RepartidoresSection />);
    await openActivityOf(user);

    await user.click(await screen.findByRole('button', { name: 'Viaje #12' }));

    const row = screen.getByRole('row', { name: /Ana/ });
    expect(within(row).getByText('#3')).toBeInTheDocument();
    expect(within(row).getByText('Calle 1')).toBeInTheDocument();
    expect(within(row).getByText('Efectivo')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Beto/ })).getByText('MercadoPago')).toBeInTheDocument();
  });

  it('cambiar el período vuelve a pedir los viajes', async () => {
    const user = userEvent.setup();
    render(<RepartidoresSection />);
    await openActivityOf(user);
    await screen.findByText('Efectivo a rendir');

    await user.click(screen.getByRole('button', { name: 'Hoy' }));

    expect(service.fetchDriverActivity).toHaveBeenLastCalledWith(7, expect.objectContaining({ currentShift: false }));
  });

  it('sin repartidor elegido invita a elegir uno y no pide nada', async () => {
    const user = userEvent.setup();
    render(<RepartidoresSection />);

    await user.click(screen.getByRole('tab', { name: 'Actividad y viajes' }));

    expect(screen.getByText('Elegí un repartidor para ver sus viajes.')).toBeInTheDocument();
    expect(service.fetchDriverActivity).not.toHaveBeenCalled();
  });
});
