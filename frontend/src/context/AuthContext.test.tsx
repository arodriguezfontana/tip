import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import * as authService from '@/services/authService';
import { ADMIN, CUSTOMER } from '@/test/utils';

vi.mock('@/services/authService');

const service = vi.mocked(authService);

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

beforeEach(() => {
  vi.resetAllMocks();
  service.refreshAdminToken.mockResolvedValue({ access_token: 'renovado', token_type: 'bearer', role: 'ADMIN' });
});

describe('AuthProvider', () => {
  it('sin token guardado no consulta la sesión', () => {
    const { result } = renderAuth();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toBeNull();
    expect(service.fetchMe).not.toHaveBeenCalled();
  });

  it('con token guardado recupera la sesión del cliente', async () => {
    localStorage.setItem('token', 'guardado');
    service.fetchMe.mockResolvedValue(CUSTOMER);

    const { result } = renderAuth();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual(CUSTOMER);
    expect(result.current.isCustomer).toBe(true);
    expect(result.current.isAdmin).toBe(false);
    expect(service.refreshAdminToken).not.toHaveBeenCalled();
  });

  it('si el token guardado ya no sirve queda sin sesión', async () => {
    localStorage.setItem('token', 'vencido');
    service.fetchMe.mockRejectedValue({ statusCode: 401, message: 'Sesión expirada' });

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login guarda el token y carga el usuario', async () => {
    service.loginRequest.mockResolvedValue({ access_token: 'nuevo', token_type: 'bearer', role: 'CUSTOMER' });
    service.fetchMe.mockResolvedValue(CUSTOMER);
    const { result } = renderAuth();

    let me;
    await act(async () => {
      me = await result.current.login('ana@mail.com', 'secreta123');
    });

    expect(service.loginRequest).toHaveBeenCalledWith('ana@mail.com', 'secreta123');
    expect(me).toEqual(CUSTOMER);
    expect(localStorage.getItem('token')).toBe('nuevo');
    expect(result.current.isCustomer).toBe(true);
  });

  it('el admin renueva su token al entrar para que no se le cierre el panel', async () => {
    service.loginRequest.mockResolvedValue({ access_token: 'nuevo', token_type: 'bearer', role: 'ADMIN' });
    service.fetchMe.mockResolvedValue(ADMIN);
    const { result } = renderAuth();

    await act(async () => {
      await result.current.login('admin@restoit.com', 'clave');
    });

    expect(result.current.isAdmin).toBe(true);
    await waitFor(() => expect(localStorage.getItem('token')).toBe('renovado'));
  });

  it('register crea la cuenta y deja la sesión iniciada', async () => {
    service.registerRequest.mockResolvedValue({ access_token: 'registrado', token_type: 'bearer', role: 'CUSTOMER' });
    service.fetchMe.mockResolvedValue(CUSTOMER);
    const { result } = renderAuth();
    const data = { email: 'ana@mail.com', password: 'secreta123', full_name: 'Ana', phone: '1155551234', address: 'Calle 1' };

    await act(async () => {
      await result.current.register(data);
    });

    expect(service.registerRequest).toHaveBeenCalledWith(data);
    expect(localStorage.getItem('token')).toBe('registrado');
    expect(result.current.user).toEqual(CUSTOMER);
  });

  it('updateProfile actualiza los datos del usuario en memoria', async () => {
    localStorage.setItem('token', 'guardado');
    service.fetchMe.mockResolvedValue(CUSTOMER);
    const nuevos = { full_name: 'Ana María', phone: '1100000000', address: 'Av. Siempreviva 742' };
    service.updateCustomerProfile.mockResolvedValue(nuevos);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.updateProfile(nuevos);
    });

    expect(result.current.user).toEqual({ ...CUSTOMER, ...nuevos });
  });

  it('logout borra el token y el usuario', async () => {
    localStorage.setItem('token', 'guardado');
    service.fetchMe.mockResolvedValue(CUSTOMER);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.logout());

    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('useAuth fuera del provider avisa del error de uso', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth debe usarse dentro de un AuthProvider');
  });
});
