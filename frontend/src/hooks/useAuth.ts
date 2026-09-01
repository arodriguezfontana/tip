import { useContext } from 'react';
import { AuthContext } from '@/context/auth-context';
import type { AuthContextValue } from '@/context/auth-context';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
