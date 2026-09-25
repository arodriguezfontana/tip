import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  fetchMe,
  loginRequest,
  refreshAdminToken,
  registerRequest,
  updateCustomerProfile,
} from '@/services/authService';
import type { CustomerProfileData, LoginResponse, Me, RegisterData } from '@/services/authService';
import { AuthContext } from '@/context/auth-context';

/** Cada cuánto se renueva el token del admin mientras el panel está abierto. */
const ADMIN_TOKEN_RENEW_MS = 12 * 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => {
        // El interceptor de axios ya limpia el token en localStorage ante un 401.
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Renovación de la sesión del admin: al cargar y periódicamente, para que no se cierre mientras se usa.
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    const renew = () => {
      refreshAdminToken()
        .then((data) => {
          if (!cancelled) localStorage.setItem('token', data.access_token);
        })
        .catch(() => {
          // Si falla (por ejemplo, sin conexión) se reintenta en la próxima renovación.
        });
    };

    renew();
    const intervalId = setInterval(renew, ADMIN_TOKEN_RENEW_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isAdmin]);

  const startSession = async (data: LoginResponse): Promise<Me> => {
    localStorage.setItem('token', data.access_token);
    const me = await fetchMe();
    setUser(me);
    return me;
  };

  const login = async (email: string, password: string) => startSession(await loginRequest(email, password));

  const register = async (data: RegisterData) => startSession(await registerRequest(data));

  const updateProfile = async (data: CustomerProfileData) => {
    const updated = await updateCustomerProfile(data);
    setUser((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isAdmin,
        isCustomer: user?.role === 'CUSTOMER',
        login,
        register,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
