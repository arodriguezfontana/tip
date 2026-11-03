import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HandoffNotifications } from '@/components/HandoffNotifications';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import * as handoffService from '@/services/handoffService';
import { playHandoffAlertSound } from '@/utils/alertSound';
import type { HandoffDetail, HandoffSummary } from '@/types/handoff';
import { ADMIN, fakeAuth, renderWithProviders } from '@/test/utils';

vi.mock('@/services/handoffService');
vi.mock('@/hooks/useNewOrderAlert', () => ({ useNewOrderAlert: vi.fn() }));
vi.mock('@/utils/alertSound', () => ({ playHandoffAlertSound: vi.fn() }));

const WAITING: HandoffSummary = {
  id: 1,
  customer_name: 'Ana',
  reason: 'Quiere una reserva',
  status: 'waiting',
  handled_by: null,
  requested_at: '2026-10-23T12:00:00Z',
};

const DETAIL: HandoffDetail = {
  ...WAITING,
  status: 'in_progress',
  handled_by: 'empleado@test.com',
  messages: [{ author: 'customer', text: 'Hola, ¿hay mesa?', sent_at: '2026-10-23T12:01:00Z' }],
};

function renderHandoffs() {
  return renderWithProviders(<HandoffNotifications />, { auth: fakeAuth(ADMIN) });
}

const EN_CURSO: HandoffSummary = {
  ...WAITING,
  status: 'in_progress',
  handled_by: ADMIN.email,
  last_message: { author: 'employee', text: 'Sí, hay lugar', sent_at: '2026-10-23T12:02:00Z' },
};

beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([WAITING]);
  vi.mocked(handoffService.fetchHandoff).mockResolvedValue(DETAIL);
  vi.mocked(handoffService.takeHandoff).mockResolvedValue(DETAIL);
});

describe('HandoffNotifications', () => {
  it('no muestra nada si nadie pidió hablar con una persona', async () => {
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([]);
    renderHandoffs();

    await vi.waitFor(() => expect(handoffService.fetchHandoffs).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa del cliente en espera y el chat se abre solo desde el aviso', async () => {
    renderHandoffs();

    expect(await screen.findByText(/Ana quiere hablar con una persona/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Atender' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(handoffService.takeHandoff).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Hola, ¿hay mesa?')).toBeInTheDocument();
  });

  it('el empleado responde y finaliza la atención', async () => {
    vi.mocked(handoffService.sendHandoffMessage).mockResolvedValue({
      ...DETAIL,
      messages: [...DETAIL.messages, { author: 'employee', text: 'Sí, hay lugar', sent_at: '2026-10-23T12:02:00Z' }],
    });
    vi.mocked(handoffService.finishHandoff).mockResolvedValue();
    renderHandoffs();

    await userEvent.click(await screen.findByRole('button', { name: 'Atender' }));
    await screen.findByText('Hola, ¿hay mesa?');
    await userEvent.type(screen.getByLabelText('Mensaje'), 'Sí, hay lugar');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(handoffService.sendHandoffMessage).toHaveBeenCalledWith(1, 'Sí, hay lugar');
    expect(await screen.findByText('Sí, hay lugar')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Finalizar atención/ }));

    expect(handoffService.finishHandoff).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si otro empleado ya tomó la conversación lo informa y no deja escribir', async () => {
    vi.mocked(handoffService.takeHandoff).mockRejectedValue({
      message: 'Otro empleado ya está atendiendo esta conversación.',
    });
    renderHandoffs();

    await userEvent.click(await screen.findByRole('button', { name: 'Atender' }));

    expect(await screen.findByText('Otro empleado ya está atendiendo esta conversación.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mensaje')).toBeDisabled();
  });

  it('el historial muestra los chats que el empleado sigue atendiendo y deja volver a ellos', async () => {
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([
      EN_CURSO,
      { ...EN_CURSO, id: 2, customer_name: 'Beto', handled_by: 'otro@test.com' },
    ]);
    renderHandoffs();

    const historial = await screen.findByRole('region', { name: 'Chats en curso' });
    expect(within(historial).getByText('Ana')).toBeInTheDocument();
    expect(within(historial).getByText('Vos: Sí, hay lugar')).toBeInTheDocument();
    expect(within(historial).queryByText('Beto')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(within(historial).getByRole('button', { name: /Ana/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('sin chats en curso el historial no aparece', async () => {
    renderHandoffs();

    await screen.findByRole('alert');
    expect(screen.queryByRole('region', { name: 'Chats en curso' })).not.toBeInTheDocument();
  });

  it('marca con un puntito los mensajes nuevos del cliente, salvo en el chat abierto', async () => {
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([{ ...EN_CURSO, unread_count: 3 }]);
    renderHandoffs();

    expect(await screen.findByLabelText('3 mensajes nuevos')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Chat con Ana/ }));
    await screen.findByRole('dialog');
    expect(screen.queryByLabelText('3 mensajes nuevos')).not.toBeInTheDocument();
  });

  it('la alerta de clientes usa un sonido distinto al de pedidos', async () => {
    renderHandoffs();
    await screen.findByRole('alert');

    expect(useNewOrderAlert).toHaveBeenLastCalledWith([1], playHandoffAlertSound);
  });

  it('en el chat se ve la charla previa con el bot', async () => {
    vi.mocked(handoffService.takeHandoff).mockResolvedValue({
      ...DETAIL,
      messages: [
        { author: 'customer', text: 'Hola', sent_at: '2026-10-23T11:58:00Z' },
        { author: 'bot', text: 'Hola, quieres ver el menu?', sent_at: '2026-10-23T11:58:05Z' },
        ...DETAIL.messages,
      ],
    });
    renderHandoffs();

    await userEvent.click(await screen.findByRole('button', { name: 'Atender' }));

    expect(await screen.findByText(/quieres ver el menu/)).toBeInTheDocument();
    expect(screen.getByText('Bot')).toBeInTheDocument();
  });

  it('la flecha vuelve a la lista sin soltar la conversación, y avisa de mensajes nuevos en otros chats', async () => {
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([
      EN_CURSO,
      { ...EN_CURSO, id: 2, customer_name: 'Beto', unread_count: 2 },
    ]);
    renderHandoffs();

    await userEvent.click(await screen.findByRole('button', { name: /Chat con Ana/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chats en curso' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 mensajes nuevos en otros chats')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Volver a la lista de chats' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Chats en curso' })).toBeInTheDocument();
    expect(handoffService.finishHandoff).not.toHaveBeenCalled();
  });

  it('avisa a la página si la columna tiene algo para mostrar, para que le deje lugar', async () => {
    const onVisibleChange = vi.fn();
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([]);
    renderWithProviders(<HandoffNotifications onVisibleChange={onVisibleChange} />, {
      auth: fakeAuth(ADMIN),
    });
    await vi.waitFor(() => expect(handoffService.fetchHandoffs).toHaveBeenCalled());
    expect(onVisibleChange).toHaveBeenLastCalledWith(false);

    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([WAITING]);
    cleanup();
    renderWithProviders(<HandoffNotifications onVisibleChange={onVisibleChange} />, { auth: fakeAuth(ADMIN) });
    await vi.waitFor(() => expect(onVisibleChange).toHaveBeenLastCalledWith(true), { timeout: 4000 });
  });

  it('distingue a clientes con el mismo nombre por su número, @usuario y teléfono', async () => {
    vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([
      { ...EN_CURSO, id: 4, customer_username: 'anita', customer_phone: '1155551234' },
      { ...EN_CURSO, id: 7, customer_username: 'ana_gomez' },
      { ...EN_CURSO, id: 9, customer_name: null, customer_username: 'sinnombre' },
    ]);
    renderHandoffs();

    const historial = await screen.findByRole('region', { name: 'Chats en curso' });
    expect(within(historial).getByText('#4')).toBeInTheDocument();
    expect(within(historial).getByText('#7')).toBeInTheDocument();
    expect(within(historial).getByText('@anita · 1155551234')).toBeInTheDocument();
    expect(within(historial).getByText('@ana_gomez')).toBeInTheDocument();
    expect(within(historial).getByRole('button', { name: 'Chat con @sinnombre #9' })).toBeInTheDocument();

    await userEvent.click(within(historial).getByRole('button', { name: 'Chat con Ana #7' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
