import { api } from './api';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: string;
}

export interface Me {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function fetchMe(): Promise<Me> {
  const { data } = await api.get<Me>('/auth/me');
  return data;
}
