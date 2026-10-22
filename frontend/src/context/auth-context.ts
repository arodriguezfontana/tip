import { createContext } from 'react';
import type { CustomerProfileData, Me, RegisterData } from '@/services/authService';

export interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  login: (email: string, password: string) => Promise<Me>;
  register: (data: RegisterData) => Promise<Me>;
  updateProfile: (data: CustomerProfileData) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
