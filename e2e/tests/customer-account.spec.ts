import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL } from '../env';
import { unique } from './helpers';

test.describe('Cuenta de cliente en la web', () => {
  test('se registra, pide con los datos autocompletados y edita su perfil', async ({ page }) => {
    const nombre = unique('Ana');
    const email = `${nombre.replace(/\s/g, '.').toLowerCase()}@mail.com`;
    await page.goto('/menu');

    // Registro desde la barra superior.
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Registrarme' }).click();
    await modal.getByLabel('Nombre').fill(nombre);
    await modal.getByLabel('Email').fill(email);
    await modal.getByLabel('Contraseña').fill('secreta123');
    await modal.getByLabel('Teléfono').fill('11 5555-1234');
    await modal.getByLabel('Dirección').fill('Calle Falsa 123');
    await modal.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();

    // El formulario del pedido se completa con los datos de la cuenta.
    await page
      .locator('div.bg-white', { has: page.getByRole('heading', { name: 'Pizza Roquefort', level: 3 }) })
      .getByRole('button', { name: 'Agregar' })
      .click();
    await expect(page.getByLabel('Nombre')).toHaveValue(nombre);
    await expect(page.getByLabel('Teléfono')).toHaveValue('11 5555-1234');
    await expect(page.getByLabel('Dirección')).toHaveValue('Calle Falsa 123');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();
    await expect(page.getByText(/¡Recibimos tu pedido!/)).toBeVisible();
    await expect(page.getByText('Calle Falsa 123')).toBeVisible();

    // Edita su perfil.
    await page.getByRole('link', { name: 'Mi perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await page.getByLabel('Dirección').fill('Av. Siempreviva 742');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status')).toHaveText('Tus datos se guardaron correctamente.');

    // El cambio persiste al recargar (vuelve a leerse de la API).
    await page.reload();
    await expect(page.getByLabel('Dirección')).toHaveValue('Av. Siempreviva 742');

    // Cerrar sesión desde el menú.
    await page.getByRole('link', { name: '← Volver al menú' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await page.goto('/perfil');
    await expect(page).toHaveURL(/\/menu$/);
  });

  test('no permite registrar dos cuentas con el mismo email', async ({ page, request }) => {
    const email = `${unique('dup').replace(/\s/g, '')}@mail.com`;
    const datos = { email, password: 'secreta123', full_name: 'Primera', phone: '1155551234', address: 'Calle 1' };
    expect((await request.post(`${API_URL}/auth/register`, { data: datos })).status()).toBe(201);

    await page.goto('/menu');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('button', { name: 'Registrarme' }).click();
    await modal.getByLabel('Nombre').fill('Segunda');
    await modal.getByLabel('Email').fill(email.toUpperCase());
    await modal.getByLabel('Contraseña').fill('secreta123');
    await modal.getByLabel('Teléfono').fill('1155551234');
    await modal.getByLabel('Dirección').fill('Calle 2');
    await modal.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(modal.getByRole('alert')).toHaveText('Ya existe una cuenta con ese email.');
  });

  test('la cuenta del administrador no sirve para pedir como cliente', async ({ page }) => {
    await page.goto('/menu');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Email').fill(ADMIN_EMAIL);
    await modal.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
    await modal.locator('button[type="submit"]').click();

    await expect(modal.getByRole('alert')).toContainText('Esta cuenta es de administración');
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeHidden();
  });
});
