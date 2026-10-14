import { expect, test } from '@playwright/test';
import { adminToken, createWebOrder, goToSection, loginAsAdmin, setOrderStatus, unique } from './helpers';

test.describe('Reportes del panel', () => {
  test('historial y estadísticas reflejan las ventas y excluyen los rechazados', async ({ page, request }) => {
    const token = await adminToken(request);
    const cliente = unique('Vendido');
    const vendido = await createWebOrder(request, { customerName: cliente, items: [['Helado 2 bochas', 3]] });
    for (const status of ['Confirmado', 'En Camino', 'Finalizado']) {
      await setOrderStatus(request, token, vendido.id, status);
    }
    const rechazado = await createWebOrder(request, { customerName: unique('No Vendido'), items: [['Agua Mineral 500ml', 20]] });
    await setOrderStatus(request, token, rechazado.id, 'Rechazado');

    await loginAsAdmin(page);

    await goToSection(page, 'Estadísticas');
    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.getByRole('row', { name: /Helado 2 bochas/ })).toBeVisible();
    // Las 20 aguas del pedido rechazado no cuentan como vendidas.
    await expect(page.getByRole('row', { name: /Agua Mineral 500ml/ })).toBeHidden();
    await expect(page.getByText('Rechazado', { exact: true })).toBeVisible();

    await goToSection(page, 'Historial');
    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.getByRole('row', { name: new RegExp(cliente) })).toBeVisible();
    // El dinero facturado del día incluye la venta (los pedidos rechazados no suman).
    const facturado = await page
      .getByText('Dinero facturado', { exact: true })
      .locator('xpath=following-sibling::p')
      .textContent();
    const pesos = Number(facturado!.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(pesos).toBeGreaterThanOrEqual(3 * 4000);
  });
});
