import { expect, test } from '@playwright/test';
import { clearBoard, column, goToSection, loginAsAdmin, money, orderCard, unique, uniquePhone } from './helpers';

test.describe('Pedido presencial (mostrador)', () => {
  test.beforeEach(async ({ request }) => {
    await clearBoard(request);
  });

  test('se registra confirmado, aparece en comandas y el cliente queda en la agenda', async ({ page }) => {
    const nombre = unique('Cliente Mostrador');
    const telefono = uniquePhone();
    await loginAsAdmin(page);
    await goToSection(page, 'Tomar pedido');

    await page.getByLabel('Teléfono *').fill(telefono);
    await expect(page.getByText('Cliente nuevo: se registrará al confirmar.')).toBeVisible();
    await page.getByLabel('Nombre *').fill(nombre);
    await page.getByRole('radio', { name: 'Envío a domicilio' }).click();
    await page.getByLabel(/Dirección/).fill('Rivadavia 1200');

    const catalogo = page.locator('section', { has: page.getByRole('heading', { name: 'Productos' }) });
    await catalogo.getByRole('button', { name: /Pizza Calabresa/ }).click();
    await catalogo.getByRole('button', { name: /Pizza Calabresa/ }).click();
    await catalogo.getByRole('button', { name: /Cerveza Quilmes/ }).click();
    await expect(page.getByText('Unidades: 3 · Productos: 2')).toBeVisible();

    await page.getByRole('radio', { name: 'Efectivo' }).click();
    await page.getByRole('checkbox', { name: 'Ya abonado' }).check();
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    const exito = page.getByRole('status').filter({ hasText: 'registrado correctamente' });
    await expect(exito).toBeVisible();
    const orderId = Number((await exito.textContent())!.match(/#(\d+)/)![1]);
    await expect(page.getByLabel('Teléfono *')).toHaveValue('');

    // Entra directo como confirmado, con la etiqueta de mostrador.
    await goToSection(page, 'Comandas');
    const card = orderCard(column(page, 'Confirmados'), orderId);
    await expect(card).toContainText(nombre);
    await expect(card).toContainText('Mostrador');
    await expect(card).toContainText(money(2 * 10200 + 3200));

    await card.getByRole('button', { name: `Ver detalle del pedido #${orderId}` }).click();
    const detalle = page.getByRole('dialog', { name: `Pedido #${orderId}` });
    await expect(detalle.getByText('Efectivo')).toBeVisible();
    await expect(detalle.getByText('Pagado', { exact: true })).toBeVisible();
    await detalle.getByRole('button', { name: 'Cerrar', exact: true }).click();

    // En el próximo pedido, el teléfono autocompleta al cliente.
    await goToSection(page, 'Tomar pedido');
    await page.getByLabel('Teléfono *').fill(telefono);
    await expect(page.getByText(/Cliente registrado: datos completados/)).toBeVisible();
    await expect(page.getByLabel('Nombre *')).toHaveValue(nombre);
    await page.getByRole('radio', { name: 'Envío a domicilio' }).click();
    await expect(page.getByLabel(/Dirección/)).toHaveValue('Rivadavia 1200');
  });

  test('no deja confirmar un pedido incompleto', async ({ page }) => {
    await loginAsAdmin(page);
    await goToSection(page, 'Tomar pedido');

    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page.getByText('Ingresá el nombre del cliente.')).toBeVisible();
    await expect(page.getByText('Ingresá el teléfono.')).toBeVisible();
    await expect(page.getByText('Agregá al menos un producto al pedido.')).toBeVisible();
  });
});
