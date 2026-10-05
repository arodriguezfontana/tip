import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import ProfilePage from '@/pages/ProfilePage';
import { ADMIN, CUSTOMER, fakeAuth, renderWithProviders } from '@/test/utils';

const PANEL = <div>Panel del admin</div>;

describe('ProtectedRoute', () => {
  const renderPanel = (auth: ReturnType<typeof fakeAuth>) =>
    renderWithProviders(<ProtectedRoute>{PANEL}</ProtectedRoute>, {
      auth,
      route: '/admin',
      path: '/admin',
      routes: [{ path: '/login', element: <div>Pantalla de login</div> }],
    });

  it('muestra el panel al administrador', () => {
    renderPanel(fakeAuth(ADMIN));
    expect(screen.getByText('Panel del admin')).toBeInTheDocument();
  });

  it('espera mientras se recupera la sesión', () => {
    renderPanel(fakeAuth(null, { isLoading: true }));
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/admin');
  });

  it.each([
    ['sin sesión', null],
    ['con sesión de cliente', CUSTOMER],
  ])('redirige al login %s', (_, user) => {
    renderPanel(fakeAuth(user));
    expect(screen.queryByText('Panel del admin')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });
});

describe('LoginPage', () => {
  const renderLogin = (auth: ReturnType<typeof fakeAuth>) =>
    renderWithProviders(<LoginPage />, {
      auth,
      route: '/login',
      path: '/login',
      routes: [{ path: '/admin', element: PANEL }],
    });

  async function submit(email = 'admin@restoit.com', password = 'clave1234') {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Contraseña'), password);
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
  }

  it('el administrador ingresa y va al panel', async () => {
    const auth = fakeAuth(null, { login: vi.fn().mockResolvedValue(ADMIN) });
    renderLogin(auth);

    await submit();

    expect(auth.login).toHaveBeenCalledWith('admin@restoit.com', 'clave1234');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin'));
  });

  it('una cuenta de cliente no entra al panel y se cierra su sesión', async () => {
    const auth = fakeAuth(null, { login: vi.fn().mockResolvedValue(CUSTOMER) });
    renderLogin(auth);

    await submit('ana@mail.com');

    expect(await screen.findByText('Esta cuenta no tiene acceso al panel de administración.')).toBeInTheDocument();
    expect(auth.logout).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('muestra el error de credenciales y vuelve a habilitar el botón', async () => {
    const auth = fakeAuth(null, {
      login: vi.fn().mockRejectedValue({ statusCode: 401, message: 'Credenciales inválidas' }),
    });
    renderLogin(auth);

    await submit();

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  it('si ya hay un administrador logueado va directo al panel', () => {
    renderLogin(fakeAuth(ADMIN));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin');
  });
});

describe('ProfilePage', () => {
  const renderProfile = (auth: ReturnType<typeof fakeAuth>) =>
    renderWithProviders(<ProfilePage />, {
      auth,
      route: '/perfil',
      path: '/perfil',
      routes: [{ path: '/menu', element: <div>Menú</div> }],
    });

  it.each([
    ['sin sesión', null],
    ['siendo administrador', ADMIN],
  ])('redirige al menú %s', (_, user) => {
    renderProfile(fakeAuth(user));
    expect(screen.getByTestId('location')).toHaveTextContent('/menu');
  });

  it('muestra los datos de la cuenta con el email bloqueado', () => {
    renderProfile(fakeAuth(CUSTOMER));

    expect(screen.getByLabelText('Email')).toHaveValue('ana@mail.com');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Gómez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('11 5555-1234');
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle Falsa 123');
  });

  it('guarda los cambios sin espacios de más', async () => {
    const auth = fakeAuth(CUSTOMER, { updateProfile: vi.fn().mockResolvedValue(undefined) });
    renderProfile(auth);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), '  Av. Siempreviva 742 ');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(auth.updateProfile).toHaveBeenCalledWith({
      full_name: 'Ana Gómez',
      phone: '11 5555-1234',
      address: 'Av. Siempreviva 742',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Tus datos se guardaron correctamente.');
  });

  it('valida antes de guardar', async () => {
    const auth = fakeAuth(CUSTOMER);
    renderProfile(auth);
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Teléfono'));
    await user.type(screen.getByLabelText('Teléfono'), 'abc');
    await user.clear(screen.getByLabelText('Nombre'));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText('Ingresá tu nombre.')).toBeInTheDocument();
    expect(screen.getByText(/Ingresá un teléfono válido/)).toBeInTheDocument();
    expect(auth.updateProfile).not.toHaveBeenCalled();
  });

  it('muestra el error si no se pudo guardar', async () => {
    const auth = fakeAuth(CUSTOMER, {
      updateProfile: vi.fn().mockRejectedValue({ message: 'No se pudo conectar con el servidor.' }),
    });
    renderProfile(auth);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.');
  });
});
