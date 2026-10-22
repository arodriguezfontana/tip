import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientesView } from '@/components/ClientesView';
import * as clientService from '@/services/clientService';
import type { Client, ClientPaginatedResponse } from '@/types/client';

vi.mock('@/services/clientService');

const service = vi.mocked(clientService);

const PAULA: Client = { id: 1, phone: '1144445555', full_name: 'Paula Gómez', address: 'Belgrano 95', created_at: '2026-10-01T15:00:00Z' };
const MARTIN: Client = { id: 2, phone: '1155556666', full_name: 'Martín Pérez', address: null, created_at: '2026-10-02T15:00:00Z' };

function page(items: Client[], overrides: Partial<ClientPaginatedResponse> = {}): ClientPaginatedResponse {
  return { items, total: items.length, page: 1, per_page: 10, total_pages: 1, ...overrides };
}

function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchClients.mockResolvedValue(page([MARTIN, PAULA]));
});

describe('ClientesView', () => {
  it('lista los clientes con su teléfono y dirección', async () => {
    render(<ClientesView />);

    expect(await screen.findByText('Paula Gómez')).toBeInTheDocument();
    expect(service.fetchClients).toHaveBeenCalledWith({ search: undefined, page: 1, per_page: 10 });
    expect(within(row('Paula Gómez')).getByText('Belgrano 95')).toBeInTheDocument();
    expect(within(row('Martín Pérez')).getByText('Sin dirección')).toBeInTheDocument();
    expect(screen.getByText(/\(2 en total\)/)).toBeInTheDocument();
  });

  it('busca después de que se deja de escribir y vuelve a la primera página', async () => {
    service.fetchClients.mockResolvedValue(page([MARTIN, PAULA], { total: 25, total_pages: 3 }));
    render(<ClientesView />);
    const user = userEvent.setup();
    await screen.findByText('Paula Gómez');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(service.fetchClients).toHaveBeenLastCalledWith({ search: undefined, page: 2, per_page: 10 }));

    await user.type(screen.getByPlaceholderText('Buscar por nombre o teléfono...'), 'paula');

    await waitFor(() => expect(service.fetchClients).toHaveBeenLastCalledWith({ search: 'paula', page: 1, per_page: 10 }));
    // No se consulta una vez por cada letra.
    expect(service.fetchClients).not.toHaveBeenCalledWith(expect.objectContaining({ search: 'p' }));
  });

  it('ignora la respuesta de una búsqueda vieja que llega tarde', async () => {
    let responderVieja!: (value: ClientPaginatedResponse) => void;
    service.fetchClients
      .mockReturnValueOnce(new Promise((resolve) => (responderVieja = resolve)))
      .mockResolvedValueOnce(page([PAULA]));
    render(<ClientesView />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Buscar por nombre o teléfono...'), 'paula');
    expect(await screen.findByText('Paula Gómez')).toBeInTheDocument();

    responderVieja(page([MARTIN]));

    await waitFor(() => expect(screen.queryByText('Martín Pérez')).not.toBeInTheDocument());
    expect(screen.getByText('Paula Gómez')).toBeInTheDocument();
  });

  it('cambia la cantidad por página', async () => {
    render(<ClientesView />);
    const user = userEvent.setup();
    await screen.findByText('Paula Gómez');

    await user.click(screen.getByRole('button', { name: '20' }));

    await waitFor(() => expect(service.fetchClients).toHaveBeenLastCalledWith({ search: undefined, page: 1, per_page: 20 }));
  });

  it('muestra los estados vacíos y de error', async () => {
    service.fetchClients.mockResolvedValueOnce(page([]));
    const { unmount } = render(<ClientesView />);
    expect(await screen.findByText('Aún no hay clientes registrados en el sistema.')).toBeInTheDocument();
    unmount();

    service.fetchClients.mockRejectedValueOnce(new Error('caído'));
    render(<ClientesView />);
    expect(await screen.findByText('No se pudo cargar el listado de clientes.')).toBeInTheDocument();
  });

  it('edita un cliente, avisa que se guardó y recarga el listado', async () => {
    service.updateClient.mockResolvedValue({ ...PAULA, address: 'Rivadavia 1200' });
    render(<ClientesView />);
    const user = userEvent.setup();
    await screen.findByText('Paula Gómez');

    await user.click(within(row('Paula Gómez')).getByTitle('Editar cliente'));
    const direccion = screen.getByPlaceholderText('Sin dirección');
    await user.clear(direccion);
    await user.type(direccion, 'Rivadavia 1200');
    service.fetchClients.mockResolvedValue(page([MARTIN, { ...PAULA, address: 'Rivadavia 1200' }]));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(service.updateClient).toHaveBeenCalledWith(1, { full_name: 'Paula Gómez', phone: '1144445555', address: 'Rivadavia 1200' });
    expect(await screen.findByText('Los datos del cliente se actualizaron exitosamente.')).toBeInTheDocument();
    expect(await within(row('Paula Gómez')).findByText('Rivadavia 1200')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
  });

  it('si el servidor rechaza la edición muestra su motivo y deja el formulario abierto', async () => {
    service.updateClient.mockRejectedValue({ statusCode: 400, message: 'El número de teléfono ya está registrado por otro cliente.' });
    render(<ClientesView />);
    const user = userEvent.setup();
    await screen.findByText('Paula Gómez');

    await user.click(within(row('Paula Gómez')).getByTitle('Editar cliente'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('El número de teléfono ya está registrado por otro cliente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  });

  it('el nombre y el teléfono son obligatorios al editar', async () => {
    render(<ClientesView />);
    const user = userEvent.setup();
    await screen.findByText('Paula Gómez');

    await user.click(within(row('Paula Gómez')).getByTitle('Editar cliente'));
    await user.clear(screen.getByDisplayValue('Paula Gómez'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText('El nombre y el teléfono son obligatorios.')).toBeInTheDocument();
    expect(service.updateClient).not.toHaveBeenCalled();
  });
});
