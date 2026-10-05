import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComandaCard } from '@/components/ComandaCard';
import type { AdminOrder } from '@/types/order';
import { makeOrder } from '@/test/utils';

function renderCard(overrides: Partial<AdminOrder> = {}) {
  const onStatusChange = vi.fn().mockResolvedValue(undefined);
  const onOpenDetail = vi.fn();
  const order = makeOrder(overrides);
  render(<ComandaCard order={order} onStatusChange={onStatusChange} onOpenDetail={onOpenDetail} />);
  return { order, onStatusChange, onOpenDetail, user: userEvent.setup() };
}

const minutes = (n: number) => new Date(Date.now() - n * 60000).toISOString();

describe('ComandaCard', () => {
  it('muestra los datos del pedido', () => {
    renderCard({ notes: 'Sin cebolla', source: 'bot', delivery_method: 'retiro', total_amount: 19500 });

    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Bot')).toBeInTheDocument();
    expect(screen.getByText('Paula Gómez')).toBeInTheDocument();
    expect(screen.getByText('Retiro en local')).toBeInTheDocument();
    expect(screen.getByText('Tel: 11 4444-5555')).toBeInTheDocument();
    expect(screen.getByText('“Sin cebolla”')).toBeInTheDocument();
    expect(screen.getByText(/19\.500,00/)).toBeInTheDocument();
  });

  it('sin teléfono ni observaciones muestra marcadores', () => {
    renderCard({ customer_phone: null, notes: null, source: 'mostrador' });

    expect(screen.getByText('Tel: —')).toBeInTheDocument();
    expect(screen.getByText('Sin observaciones')).toBeInTheDocument();
    expect(screen.getByText('Mostrador')).toBeInTheDocument();
  });

  it('confirmar sin demora manual deja que el backend la calcule', async () => {
    const { onStatusChange, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', undefined);
  });

  it('confirmar con demora manual la envía', async () => {
    const { onStatusChange, user } = renderCard();

    await user.type(screen.getByPlaceholderText(/Automática/), '35');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', 35);
  });

  it.each(['0', '2.5'])('no deja confirmar con una demora inválida (%s)', async (value) => {
    const { user } = renderCard();

    await user.type(screen.getByPlaceholderText(/Automática/), value);

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('rechazar un pendiente', async () => {
    const { onStatusChange, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Rechazado', undefined);
  });

  it('un programado muestra su horario y se confirma sin demora', async () => {
    const { onStatusChange, user } = renderCard({ scheduled_for: '2026-10-04T00:30:00Z' }); // 21:30 en Argentina

    expect(screen.getByText('21:30')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Automática/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', undefined);
  });

  it.each([
    ['domicilio', 'Marcar En Camino', 'En Camino'],
    ['retiro', 'Marcar Listo para Retirar', 'Listo para Retirar'],
  ] as const)('un confirmado para %s avanza a "%s"', async (delivery_method, label, next) => {
    const { onStatusChange, user } = renderCard({ status: 'Confirmado', delivery_method, estimated_minutes: 30 });

    expect(screen.getByText('Estimado: 30 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: label }));

    expect(onStatusChange).toHaveBeenCalledWith(101, next, undefined);
  });

  it.each(['En Camino', 'Listo para Retirar'] as const)('un pedido %s se finaliza', async (status) => {
    const { onStatusChange, user } = renderCard({ status });

    await user.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Finalizado', undefined);
  });

  it('deshabilita las acciones mientras se actualiza el estado', async () => {
    let resolve!: () => void;
    const { onStatusChange, user } = renderCard();
    onStatusChange.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
    resolve();
    expect(await screen.findByRole('button', { name: 'Rechazar' })).toBeEnabled();
  });

  it('abre el detalle al tocar la tarjeta pero no al usar sus botones', async () => {
    const { order, onOpenDetail, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(onOpenDetail).not.toHaveBeenCalled();

    await user.click(screen.getByText('Paula Gómez'));
    expect(onOpenDetail).toHaveBeenCalledWith(order);

    await user.click(screen.getByRole('button', { name: 'Ver detalle del pedido #101' }));
    expect(onOpenDetail).toHaveBeenCalledTimes(2);
  });

  it('marca en rojo los pendientes sin atender hace más de 2 minutos', () => {
    renderCard({ created_at: minutes(5) });

    expect(screen.getByText('5min')).toHaveClass('bg-red-100', 'animate-pulse');
  });

  it('marca como atrasado un confirmado que superó su demora', () => {
    renderCard({ status: 'Confirmado', estimated_minutes: 20, created_at: minutes(25) });

    expect(screen.getByText('25min')).toHaveClass('bg-red-100');
    expect(screen.getByText('25min')).not.toHaveClass('animate-pulse');
  });
});
