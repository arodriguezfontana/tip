import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PinModal } from '@/components/PinModal';
import * as securityService from '@/services/securityService';

vi.mock('@/services/securityService');

describe('PinModal', () => {
  const onSuccess = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(securityService.fetchPinStatus).mockResolvedValue({
      admin_pin_required: true,
      admin_blocked: false,
      admin_blocked_seconds_remaining: 0,
      cash_pin_required: false,
      cash_blocked: false,
      cash_blocked_seconds_remaining: 0,
    });
  });

  it('no muestra nada si isOpen es false', () => {
    const { container } = render(
      <PinModal
        isOpen={false}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra el modal con teclado numérico e indicadores de 4 dígitos', () => {
    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Acceso a Datos Sensibles y Estadísticas' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('pin-dots').children).toHaveLength(4);

    // Botones del teclado
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Borrar dígito' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar PIN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al panel' })).toBeInTheDocument();
  });

  it('ingresar 4 dígitos llama a verifyAdminPin y al tener éxito invoca onSuccess con el token', async () => {
    const user = userEvent.setup();
    vi.mocked(securityService.verifyAdminPin).mockResolvedValue({
      token: 'jwt-admin-token-123',
      expires_in: 300,
      message: 'PIN verificado correctamente',
    });

    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await user.click(screen.getByRole('button', { name: '4' }));

    await waitFor(() => {
      expect(securityService.verifyAdminPin).toHaveBeenCalledWith('1234');
      expect(onSuccess).toHaveBeenCalledWith('jwt-admin-token-123');
    });
  });

  it('permite ingresar PIN para caja y llama a verifyCashPin', async () => {
    const user = userEvent.setup();
    vi.mocked(securityService.verifyCashPin).mockResolvedValue({
      token: 'jwt-cash-token-456',
      expires_in: 300,
      message: 'PIN verificado correctamente',
    });

    render(
      <PinModal
        isOpen={true}
        pinType="cash"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Control de Caja Protegido' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '6' }));
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '8' }));

    await waitFor(() => {
      expect(securityService.verifyCashPin).toHaveBeenCalledWith('5678');
      expect(onSuccess).toHaveBeenCalledWith('jwt-cash-token-456');
    });
  });

  it('si el PIN es incorrecto muestra el mensaje de error con intentos restantes', async () => {
    const user = userEvent.setup();
    vi.mocked(securityService.verifyAdminPin).mockRejectedValue({
      message: 'PIN incorrecto. Le quedan 2 intentos.',
    });

    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: '0' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('PIN incorrecto. Le quedan 2 intentos.');
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('si está bloqueado temporalmente muestra cuenta regresiva y deshabilita los botones', async () => {
    vi.mocked(securityService.fetchPinStatus).mockResolvedValue({
      admin_pin_required: true,
      admin_blocked: true,
      admin_blocked_seconds_remaining: 295,
      cash_pin_required: false,
      cash_blocked: false,
      cash_blocked_seconds_remaining: 0,
    });

    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/bloqueado temporalmente/i);
      expect(screen.getByText(/Podrás reintentar en: 4:55/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirmar PIN' })).toBeDisabled();
  });

  it('soporta entrada desde el teclado físico y Escape para salir', async () => {
    const user = userEvent.setup();
    vi.mocked(securityService.verifyAdminPin).mockResolvedValue({
      token: 'jwt-key-token',
      expires_in: 300,
      message: 'PIN verificado correctamente',
    });

    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await user.keyboard('1234');

    await waitFor(() => {
      expect(securityService.verifyAdminPin).toHaveBeenCalledWith('1234');
      expect(onSuccess).toHaveBeenCalledWith('jwt-key-token');
    });

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('el botón volver al panel invoca onCancel', async () => {
    const user = userEvent.setup();
    render(
      <PinModal
        isOpen={true}
        pinType="admin"
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Volver al panel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

