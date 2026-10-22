import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepartidoresView } from '@/components/RepartidoresView';
import * as deliveryDriverService from '@/services/deliveryDriverService';
import type { DeliveryDriver } from '@/types/deliveryDriver';

vi.mock('@/services/deliveryDriverService');

const service = vi.mocked(deliveryDriverService);

const CARLOS: DeliveryDriver = {
  id: 1,
  name: 'Carlos Repartos',
  phone: '11 4444-5555',
  is_active: true,
  created_at: '2026-10-01T15:00:00Z',
  updated_at: '2026-10-01T15:00:00Z',
};

const LAURA: DeliveryDriver = {
  id: 2,
  name: 'Laura Delivery',
  phone: '11 6666-7777',
  is_active: false,
  created_at: '2026-10-02T15:00:00Z',
  updated_at: '2026-10-02T15:00:00Z',
};

function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchDeliveryDrivers.mockResolvedValue([CARLOS, LAURA]);
});

describe('RepartidoresView', () => {
  it('lista los repartidores con nombre, teléfono y estado', async () => {
    render(<RepartidoresView />);

    expect(await screen.findByText('Carlos Repartos')).toBeInTheDocument();
    expect(within(row('Carlos Repartos')).getByText('11 4444-5555')).toBeInTheDocument();
    expect(within(row('Carlos Repartos')).getByText('Activo')).toBeInTheDocument();

    expect(screen.getByText('Laura Delivery')).toBeInTheDocument();
    expect(within(row('Laura Delivery')).getByText('11 6666-7777')).toBeInTheDocument();
    expect(within(row('Laura Delivery')).getByText('Inactivo')).toBeInTheDocument();

    expect(screen.getByText(/\(2 en total\)/)).toBeInTheDocument();
  });

  it('filtra los repartidores por el buscador', async () => {
    render(<RepartidoresView />);
    const user = userEvent.setup();

    expect(await screen.findByText('Carlos Repartos')).toBeInTheDocument();
    expect(screen.getByText('Laura Delivery')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar por nombre o teléfono...'), 'carlos');

    expect(screen.getByText('Carlos Repartos')).toBeInTheDocument();
    expect(screen.queryByText('Laura Delivery')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Buscar por nombre o teléfono...'));
    await user.type(screen.getByPlaceholderText('Buscar por nombre o teléfono...'), '6666');

    expect(screen.queryByText('Carlos Repartos')).not.toBeInTheDocument();
    expect(screen.getByText('Laura Delivery')).toBeInTheDocument();
  });

  it('muestra mensaje cuando no hay repartidores registrados', async () => {
    service.fetchDeliveryDrivers.mockResolvedValue([]);
    render(<RepartidoresView />);

    expect(
      await screen.findByText('Aún no hay repartidores registrados en el sistema.')
    ).toBeInTheDocument();
  });

  it('permite dar de alta un nuevo repartidor', async () => {
    service.createDeliveryDriver.mockResolvedValue({
      id: 3,
      name: 'Mario Envíos',
      phone: '11 8888-9999',
      is_active: true,
      created_at: '2026-10-16T12:00:00Z',
      updated_at: '2026-10-16T12:00:00Z',
    });

    render(<RepartidoresView />);
    const user = userEvent.setup();

    await screen.findByText('Carlos Repartos');

    await user.click(screen.getByRole('button', { name: /Nuevo repartidor/ }));

    expect(screen.getByRole('heading', { name: 'Nuevo Repartidor' })).toBeInTheDocument();

    // Intentar enviar vacío valida campos obligatorios
    await user.click(screen.getByRole('button', { name: 'Registrar repartidor' }));
    expect(await screen.findByText('El nombre del repartidor es obligatorio.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nombre y apellido/), 'Mario Envíos');
    await user.click(screen.getByRole('button', { name: 'Registrar repartidor' }));
    expect(await screen.findByText('El teléfono del repartidor es obligatorio.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Teléfono/), '11 8888-9999');
    await user.click(screen.getByRole('button', { name: 'Registrar repartidor' }));

    await waitFor(() => {
      expect(service.createDeliveryDriver).toHaveBeenCalledWith({
        name: 'Mario Envíos',
        phone: '11 8888-9999',
        is_active: true,
      });
    });

    expect(await screen.findByText('Repartidor registrado exitosamente.')).toBeInTheDocument();
  });

  it('permite editar un repartidor existente', async () => {
    service.updateDeliveryDriver.mockResolvedValue({
      ...CARLOS,
      name: 'Carlos Repartos Modificado',
      is_active: false,
    });

    render(<RepartidoresView />);
    const user = userEvent.setup();

    await screen.findByText('Carlos Repartos');

    const editBtn = within(row('Carlos Repartos')).getByRole('button', { name: 'Editar' });
    await user.click(editBtn);

    expect(screen.getByRole('heading', { name: /Editar Repartidor: Carlos Repartos/ })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Nombre y apellido/);
    expect(nameInput).toHaveValue('Carlos Repartos');

    await user.clear(nameInput);
    await user.type(nameInput, 'Carlos Repartos Modificado');

    const activeCheckbox = screen.getByLabelText(/Personal activo/);
    expect(activeCheckbox).toBeChecked();
    await user.click(activeCheckbox);
    expect(activeCheckbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(service.updateDeliveryDriver).toHaveBeenCalledWith(1, {
        name: 'Carlos Repartos Modificado',
        phone: '11 4444-5555',
        is_active: false,
      });
    });

    expect(await screen.findByText('Repartidor actualizado exitosamente.')).toBeInTheDocument();
  });

  it('muestra mensaje de error cuando falla la carga de repartidores', async () => {
    service.fetchDeliveryDrivers.mockRejectedValue(new Error('Fallo del servidor'));
    render(<RepartidoresView />);

    expect(await screen.findByText('No se pudo cargar la lista de repartidores.')).toBeInTheDocument();
  });
});

