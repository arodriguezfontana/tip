import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomerAuthModal } from '@/components/CustomerAuthModal';
import { ADMIN, CUSTOMER, fakeAuth, renderWithProviders } from '@/test/utils';

/** El botón de envío (la pestaña "Ingresar" tiene el mismo nombre). */
function submitButton() {
  return screen.getAllByRole('button', { name: /^(Ingresar|Crear cuenta)$/ }).find((b) => b.getAttribute('type') === 'submit')!;
}

function renderModal(auth = fakeAuth(), initialMode: 'login' | 'register' = 'login') {
  const onClose = vi.fn();
  renderWithProviders(<CustomerAuthModal initialMode={initialMode} onClose={onClose} />, { auth });
  return { onClose, user: userEvent.setup() };
}

describe('CustomerAuthModal', () => {
  it('ingresa con una cuenta de cliente y se cierra', async () => {
    const auth = fakeAuth(null, { login: vi.fn().mockResolvedValue(CUSTOMER) });
    const { onClose, user } = renderModal(auth);

    await user.type(screen.getByLabelText('Email'), ' ana@mail.com ');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.click(submitButton());

    expect(auth.login).toHaveBeenCalledWith('ana@mail.com', 'secreta123');
    expect(onClose).toHaveBeenCalled();
  });

  it('no deja usar una cuenta de administración en la web', async () => {
    const auth = fakeAuth(null, { login: vi.fn().mockResolvedValue(ADMIN) });
    const { onClose, user } = renderModal(auth);

    await user.type(screen.getByLabelText('Email'), 'admin@restoit.com');
    await user.type(screen.getByLabelText('Contraseña'), 'clave');
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta cuenta es de administración');
    expect(auth.logout).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor al ingresar', async () => {
    const auth = fakeAuth(null, { login: vi.fn().mockRejectedValue({ message: 'Credenciales inválidas' }) });
    const { user } = renderModal(auth);

    await user.type(screen.getByLabelText('Email'), 'ana@mail.com');
    await user.type(screen.getByLabelText('Contraseña'), 'mala');
    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  it('valida todos los campos del registro', async () => {
    const auth = fakeAuth();
    const { user } = renderModal(auth, 'register');

    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.type(screen.getByLabelText('Teléfono'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(screen.getByText('Ingresá tu email.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá tu nombre.')).toBeInTheDocument();
    expect(screen.getByText(/Ingresá un teléfono válido/)).toBeInTheDocument();
    expect(screen.getByText('Ingresá tu dirección.')).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('registra una cuenta nueva', async () => {
    const auth = fakeAuth(null, { register: vi.fn().mockResolvedValue(CUSTOMER) });
    const { onClose, user } = renderModal(auth, 'register');

    await user.type(screen.getByLabelText('Nombre'), 'Ana Gómez');
    await user.type(screen.getByLabelText('Email'), 'ana@mail.com');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await user.type(screen.getByLabelText('Teléfono'), '11 5555-1234');
    await user.type(screen.getByLabelText('Dirección'), 'Calle Falsa 123');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(auth.register).toHaveBeenCalledWith({
      email: 'ana@mail.com',
      password: 'secreta123',
      full_name: 'Ana Gómez',
      phone: '11 5555-1234',
      address: 'Calle Falsa 123',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('cambiar de pestaña limpia los errores', async () => {
    const { user } = renderModal(fakeAuth(), 'login');

    await user.click(submitButton());
    expect(screen.getByText('Ingresá tu email.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Registrarme' }));

    expect(screen.getByRole('dialog', { name: 'Crear cuenta' })).toBeInTheDocument();
    expect(screen.queryByText('Ingresá tu email.')).not.toBeInTheDocument();
  });

  it.each([
    ['la tecla Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['el botón cerrar', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Cerrar' }))],
    ['seguir como invitado', async (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('button', { name: 'Seguir como invitado' }))],
  ])('se cierra con %s', async (_, action) => {
    const { onClose, user } = renderModal();

    await action(user);

    expect(onClose).toHaveBeenCalled();
  });
});
