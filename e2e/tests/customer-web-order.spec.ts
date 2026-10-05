import { expect, test } from '@playwright/test';
import { money, unique } from './helpers';

function productCard(page: import('@playwright/test').Page, name: string) {
  return page.locator('div.bg-white', { has: page.getByRole('heading', { name, exact: true, level: 3 }) });
}

test.describe('Pedido web de un cliente', () => {
  test('el menú muestra los productos del local agrupados por categoría', async ({ page }) => {
    await page.goto('/menu');

    await expect(page.getByRole('heading', { name: 'Nuestro menú' })).toBeVisible();
    for (const categoria of ['Pizzas', 'Bebidas', 'Postres']) {
      await expect(page.getByRole('heading', { name: categoria, exact: true })).toBeVisible();
    }
    await expect(productCard(page, 'Pizza Muzzarella')).toContainText(money(8500));
    await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
  });

  test('un invitado arma el carrito y pide para retirar en el local', async ({ page }) => {
    const nombre = unique('Invitado');
    await page.goto('/menu');

    await productCard(page, 'Pizza Muzzarella').getByRole('button', { name: 'Agregar' }).click();
    await productCard(page, 'Pizza Muzzarella').getByRole('button', { name: 'Agregar una unidad de Pizza Muzzarella' }).click();
    await productCard(page, 'Coca-Cola 500ml').getByRole('button', { name: 'Agregar' }).click();
    await productCard(page, 'Flan casero').getByRole('button', { name: 'Agregar' }).click();
    await page.getByRole('button', { name: 'Quitar Flan casero del carrito' }).click();

    await expect(page.getByText(money(2 * 8500 + 2500)).last()).toBeVisible();

    await page.getByLabel('Nombre').fill(nombre);
    await page.getByLabel('Teléfono').fill('11 5555-1234');
    await page.getByRole('button', { name: 'Retiro en el local' }).click();
    await page.getByLabel('Observaciones (opcional)').fill('Cortar en 8');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page.getByText(/¡Recibimos tu pedido!/)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pedido #\d+/ })).toBeVisible();
    await expect(page.getByText('Pizza Muzzarella x2')).toBeVisible();
    await expect(page.getByText('Coca-Cola 500ml x1')).toBeVisible();
    await expect(page.getByText(nombre)).toBeVisible();
    await expect(page.getByText(money(19500)).last()).toBeVisible();

    await page.getByRole('button', { name: 'Realizar otro pedido' }).click();
    await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
  });

  test('valida los datos antes de enviar', async ({ page }) => {
    await page.goto('/menu');
    await productCard(page, 'Pizza Napolitana').getByRole('button', { name: 'Agregar' }).click();

    await page.getByLabel('Teléfono').fill('no tengo');
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page.getByText('Ingresá tu nombre.')).toBeVisible();
    await expect(page.getByText(/Ingresá un teléfono válido/)).toBeVisible();
    await expect(page.getByText('Ingresá la dirección de entrega.')).toBeVisible();
    await expect(page.getByText(/¡Recibimos tu pedido!/)).toBeHidden();
  });
});
