import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_PORT, API_URL, DATABASE_URL, WEB_PORT, WEB_URL } from './env';

/**
 * Levanta un entorno propio para los tests: backend en el puerto 8001 y frontend en el 5174,
 * contra una base exclusiva (se vacía en cada corrida). No toca la base ni los puertos de desarrollo.
 */
const BACKEND_DIR = path.resolve(import.meta.dirname, '../backend');
const FRONTEND_DIR = path.resolve(import.meta.dirname, '../frontend');

/** Python del backend: el del venv si existe, si no el del sistema (en CI). */
function backendPython(): string {
  if (process.env.E2E_PYTHON) return process.env.E2E_PYTHON;
  const candidates = ['venv/Scripts/python.exe', '.venv/Scripts/python.exe', 'venv/bin/python', '.venv/bin/python'];
  const found = candidates.map((c) => path.join(BACKEND_DIR, c)).find((c) => existsSync(c));
  return found ? `"${found}"` : 'python';
}

const python = backendPython();

export default defineConfig({
  testDir: './tests',
  // Todos los tests comparten la misma base: se corren de a uno para que no se pisen.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'on-failure' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: `${python} ../e2e/scripts/prepare_backend.py && ${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: BACKEND_DIR,
      url: `${API_URL}/health-check`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      env: {
        PYTHONPATH: BACKEND_DIR,
        DATABASE_URL,
        CORS_ORIGINS: JSON.stringify([WEB_URL, `http://127.0.0.1:${WEB_PORT}`]),
        ADMIN_EMAIL,
        ADMIN_PASSWORD,
        JWT_SECRET_KEY: 'e2e-jwt-secret-key-con-largo-suficiente',
        // Credenciales falsas: los tests nunca hablan con Telegram ni con Gemini.
        TELEGRAM_TOKEN: 'e2e-telegram-token',
        TELEGRAM_WEBHOOK_SECRET: '',
        GOOGLE_API_KEY: 'e2e-google-api-key',
        PUBLIC_URL: '',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: FRONTEND_DIR,
      url: WEB_URL,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
