import { api } from './api';

export type UserRole = 'ADMIN' | 'CUSTOMER';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
}

export interface Me {
  id: number;
  email: string;
  role: UserRole;
  is_active: boolean;
  full_name: string | null;
  phone: string | null;
  address: string | null;
}

export interface CustomerProfileData {
  full_name: string;
  phone: string;
  address: string;
}

export interface RegisterData extends CustomerProfileData {
  email: string;
  password: string;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function registerRequest(payload: RegisterData): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/register', payload);
  return data;
}

export async function refreshAdminToken(): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/refresh');
  return data;
}

export async function fetchMe(): Promise<Me> {
  const { data } = await api.get<Me>('/auth/me');
  return data;
}

export async function updateCustomerProfile(payload: CustomerProfileData): Promise<CustomerProfileData> {
  const { data } = await api.put<CustomerProfileData>('/customers/me', payload);
  return data;
}
