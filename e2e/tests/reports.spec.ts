import { expect, test } from '@playwright/test';
import { adminToken, createWebOrder, goToSection, loginAsAdmin, money, setOrderStatus, unique } from './helpers';

test.describe('Reportes del panel', () => {
  test('ingresos y estadísticas reflejan las ventas y excluyen los rechazados', async ({ page, request }) => {
    const token = await adminToken(request);
    const vendido = await createWebOrder(request, { customerName: unique('Vendido'), items: [['Helado 2 bochas', 3]] });
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

    await goToSection(page, 'Ingresos');
    await page.getByRole('button', { name: 'Hoy' }).click();
    const fila = page.getByRole('row').nth(1);
    await expect(fila).toBeVisible();
    // El total del día incluye la venta y no el pedido rechazado.
    const totalDelDia = await fila.locator('td').last().textContent();
    const pesos = Number(totalDelDia!.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(pesos).toBeGreaterThanOrEqual(3 * 4000);
    await expect(page.getByText(money(20 * 1800))).toBeHidden();
  });
});
