/** Configuración compartida entre playwright.config.ts y los tests. */
export const API_PORT = 8001;
export const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}/api/v1`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@restoit.com';
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin-e2e-1234';
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/tip_e2e';
