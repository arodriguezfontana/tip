import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchMe, loginRequest } from '@/services/authService';
import type { Me } from '@/services/authService';
import { AuthContext } from '@/context/auth-context';

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

  const login = async (email: string, password: string) => {
    const data = await loginRequest(email, password);
    localStorage.setItem('token', data.access_token);
    setUser(await fetchMe());
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
