import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL } from '../env';
import { loginAsAdmin } from './helpers';

test.describe('Acceso al panel de administración', () => {
  test('sin sesión el panel redirige al login', async ({ page }) => {
    await page.goto('/admin');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Acceso exclusivo para administradores')).toBeVisible();
  });

  test('con una contraseña incorrecta muestra el error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ADMIN_EMAIL);
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByText('Credenciales inválidas')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('el administrador ingresa, la sesión sobrevive a recargar y puede cerrarla', async ({ page }) => {
    await loginAsAdmin(page);

    await page.reload();
    await expect(page.getByText('Panel de Comandas')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login$/);
  });
});
