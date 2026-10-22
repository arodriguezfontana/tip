import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderDetailModal } from '@/components/OrderDetailModal';
import * as orderService from '@/services/orderService';
import type { AdminOrder } from '@/types/order';
import { makeOrder, makeOrderDetail } from '@/test/utils';

vi.mock('@/services/orderService');

const service = vi.mocked(orderService);

const ORDER = makeOrder({
  id: 55,
  status: 'Confirmado',
  source: 'mostrador',
  created_at: '2026-10-03T23:15:00Z', // 20:15 en Argentina
  estimated_minutes: 25,
  notes: 'Sin cebolla',
  total_amount: 19500,
});

function renderModal(
  order: AdminOrder = ORDER,
  simulated = false,
  onMarkPaid?: (orderId: number, isPaid: boolean) => Promise<void>,
  onCancel?: (orderId: number) => Promise<void>
) {
  const onClose = vi.fn();
  render(
    <OrderDetailModal order={order} simulated={simulated} onMarkPaid={onMarkPaid} onCancel={onCancel} onClose={onClose} />
  );
  return { onClose, user: userEvent.setup() };
}

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchOrderDetail.mockResolvedValue(
    makeOrderDetail({
      ...ORDER,
      items: [
        { product_id: 1, product_name: 'Pizza Muzzarella', quantity: 2, unit_price: 8500, subtotal: 17000 },
        { product_id: 3, product_name: 'Coca-Cola 500ml', quantity: 1, unit_price: 2500, subtotal: 2500 },
      ],
      subtotal: 19500,
      payment_method: 'transferencia',
      is_paid: true,
    })
  );
});

describe('OrderDetailModal', () => {
  it('muestra cliente, entrega, productos y facturación', async () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Pedido #55' });

    expect(within(dialog).getByText('Confirmado')).toBeInTheDocument();
    expect(within(dialog).getByText('Mostrador')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Recibido el 0?3\/10 a las 20:15 hs$/)).toBeInTheDocument();
    expect(within(dialog).getByText('Envío a domicilio')).toBeInTheDocument();
    expect(within(dialog).getByText('Belgrano 95')).toBeInTheDocument();
    expect(within(dialog).getByText('25 min')).toBeInTheDocument();
    expect(within(dialog).getByText('Sin cebolla')).toBeInTheDocument();

    const rows = await within(dialog).findAllByRole('row');
    expect(rows.slice(1).map((row) => plain(row.textContent))).toEqual([
      '2Pizza Muzzarella$ 8.500,00$ 17.000,00',
      '1Coca-Cola 500ml$ 2.500,00$ 2.500,00',
    ]);
    expect(within(dialog).getByText('Transferencia')).toBeInTheDocument();
    expect(within(dialog).getByText('Pagado')).toBeInTheDocument();
    expect(within(dialog).getByText('Sin cargo')).toBeInTheDocument();
    expect(within(dialog).getByText('Total (abonado)')).toBeInTheDocument();
  });

  it('un pedido sin pago informado figura pendiente de pago', async () => {
    service.fetchOrderDetail.mockResolvedValue(makeOrderDetail({ ...ORDER, payment_method: null, is_paid: false }));
    renderModal();

    expect(await screen.findByText('No informado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
    expect(screen.getByText('Total a pagar')).toBeInTheDocument();
  });

  it('un pedido con mercadopago abonado muestra el estado Abonado', async () => {
    service.fetchOrderDetail.mockResolvedValue(
      makeOrderDetail({ ...ORDER, payment_method: 'mercadopago', is_paid: true })
    );
    renderModal();

    expect(await screen.findByText('MercadoPago')).toBeInTheDocument();
    expect(screen.getByText('Abonado')).toBeInTheDocument();
    expect(screen.getByText('Total (abonado)')).toBeInTheDocument();
  });

  it('un programado muestra su horario en vez de la demora', () => {
    renderModal(makeOrder({ ...ORDER, scheduled_for: '2026-10-04T00:30:00Z', estimated_minutes: null }));

    expect(screen.getByText('Programado para')).toBeInTheDocument();
    expect(screen.getByText(/^0?3\/10 21:30 hs$/)).toBeInTheDocument();
    expect(screen.queryByText('Demora estimada')).not.toBeInTheDocument();
  });

  it('si falla la carga del detalle permite reintentar', async () => {
    service.fetchOrderDetail.mockRejectedValueOnce({ message: 'Pedido no encontrado' });
    const { user } = renderModal();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Pedido no encontrado');

    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Pizza Muzzarella')).toBeInTheDocument();
    expect(service.fetchOrderDetail).toHaveBeenCalledTimes(2);
  });

  it('en modo simulación no pide el detalle al servidor', () => {
    renderModal(ORDER, true);

    expect(screen.getByText(/no está disponible en el modo simulación/)).toBeInTheDocument();
    expect(service.fetchOrderDetail).not.toHaveBeenCalled();
  });

  it('pone el foco en cerrar y se cierra con Escape, la cruz o el botón', async () => {
    const { onClose, user } = renderModal();

    expect(screen.getByRole('button', { name: 'Cerrar detalle del pedido' })).toHaveFocus();

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cerrar detalle del pedido' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('bloquea el scroll de la página mientras está abierto', () => {
    const { unmount } = render(<OrderDetailModal order={ORDER} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('permite marcar como abonado un pedido pendiente de pago', async () => {
    service.fetchOrderDetail.mockResolvedValueOnce(
      makeOrderDetail({
        ...ORDER,
        payment_method: 'mercadopago',
        is_paid: false,
      })
    );
    const onMarkPaid = vi.fn().mockResolvedValue(undefined);
    const { user } = renderModal(ORDER, false, onMarkPaid);

    const button = await screen.findByRole('button', { name: 'Marcar como abonado' });
    expect(button).toBeInTheDocument();
    await user.click(button);
    expect(onMarkPaid).toHaveBeenCalledWith(55, true);
  });

  it.each(['Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar'] as const)(
    'un pedido %s se puede cancelar desde el detalle, después de confirmarlo',
    async (status) => {
      const onCancel = vi.fn().mockResolvedValue(undefined);
      const { user } = renderModal({ ...ORDER, status }, false, undefined, onCancel);
      const dialog = screen.getByRole('dialog', { name: 'Pedido #55' });

      await user.click(within(dialog).getByRole('button', { name: 'Cancelar pedido' }));
      expect(within(dialog).getByText('¿Cancelar el pedido?')).toBeInTheDocument();
      expect(onCancel).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }));
      expect(onCancel).toHaveBeenCalledWith(55);
    }
  );

  it('el botón de cancelar está al lado del de cerrar', () => {
    renderModal(ORDER, false, undefined, vi.fn());

    const cancel = screen.getByRole('button', { name: 'Cancelar pedido' });
    const close = screen.getByRole('button', { name: 'Cerrar detalle del pedido' });
    expect(cancel.parentElement).toBe(close.parentElement);
  });

  it('se puede desistir de cancelar', async () => {
    const onCancel = vi.fn();
    const { user } = renderModal(ORDER, false, undefined, onCancel);

    await user.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    await user.click(screen.getByRole('button', { name: 'No' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it.each(['Finalizado', 'Rechazado', 'Cancelado'] as const)('un pedido %s ya no se puede cancelar', (status) => {
    renderModal({ ...ORDER, status }, false, undefined, vi.fn());

    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('sin acción de cancelar (por ejemplo en el historial) no muestra el botón', () => {
    renderModal();

    expect(screen.queryByRole('button', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });
});
