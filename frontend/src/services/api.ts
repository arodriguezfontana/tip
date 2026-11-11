import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

export interface ApiErrorResponse {
  message: string;
  statusCode: number;
  details?: unknown;
}

/** Error que rechaza toda llamada a la API fallida: el mensaje ya viene listo para mostrarle al usuario. */
export class ApiError extends Error implements ApiErrorResponse {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor({ message, statusCode, details }: ApiErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

let adminPrivilegedToken: string | null = null;
let cashPrivilegedToken: string | null = null;

export function setAdminPrivilegedToken(token: string | null): void {
  adminPrivilegedToken = token;
}

export function setCashPrivilegedToken(token: string | null): void {
  cashPrivilegedToken = token;
}

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (adminPrivilegedToken && config.headers) {
      config.headers['X-Privileged-Token'] = adminPrivilegedToken;
    }
    if (cashPrivilegedToken && config.headers) {
      config.headers['X-Cash-Privileged-Token'] = cashPrivilegedToken;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: unknown }>) => {
    const errorResponse: ApiErrorResponse = {
      message: 'Ocurrió un error inesperado.',
      statusCode: error.response?.status || 500,
      details: error.response?.data,
    };

    if (!error.response) {
      errorResponse.message = 'No se pudo conectar con el servidor. Revisa tu conexión a internet.';
      return Promise.reject(new ApiError(errorResponse));
    }

    const serverMessage =
      typeof error.response.data?.detail === 'string'
        ? error.response.data.detail
        : null;

    switch (error.response.status) {
      case 400:
        errorResponse.message = serverMessage || 'Solicitud incorrecta. Revisa los datos enviados.';
        break;

      case 401:
        errorResponse.message = serverMessage || 'Sesión expirada o no autorizada. Por favor, inicia sesión nuevamente.';
        localStorage.removeItem('token');
        break;

      case 403:
        if (serverMessage?.toLowerCase().includes('pin de administración')) {
          adminPrivilegedToken = null;
        }
        if (serverMessage?.toLowerCase().includes('pin de caja')) {
          cashPrivilegedToken = null;
        }
        errorResponse.message = serverMessage || 'No tienes permisos necesarios para realizar esta acción.';
        break;

      case 404:
        errorResponse.message = serverMessage || 'El recurso solicitado no fue encontrado.';
        break;

      case 422:
        errorResponse.message = 'Algunos datos enviados no son válidos. Revisalos e intentá nuevamente.';
        break;

      case 500:
        errorResponse.message = 'Error interno del servidor. Por favor, intenta más tarde.';
        break;

      default:
        errorResponse.message = serverMessage || `Error inesperado (${error.response.status}).`;
        break;
    }

    return Promise.reject(new ApiError(errorResponse));
  }
);
