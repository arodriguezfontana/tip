import { createContext } from 'react';
import type { Me } from '@/services/authService';

export interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
