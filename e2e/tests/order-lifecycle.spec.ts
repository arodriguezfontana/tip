import { expect, test } from '@playwright/test';
import { clearBoard, column, createWebOrder, goToSection, loginAsAdmin, money, orderCard, unique } from './helpers';

test.describe('Ciclo de vida de un pedido en el panel', () => {
  test.beforeEach(async ({ request }) => {
    await clearBoard(request);
  });

  test('un pedido web entra confirmado, se despacha y se finaliza', async ({ page, request }) => {
    const nombre = unique('Cliente Web');
    const order = await createWebOrder(request, {
      customerName: nombre,
      items: [
        ['Pizza Muzzarella', 2],
        ['Coca-Cola 500ml', 1],
      ],
    });

    await loginAsAdmin(page);

    // Los pedidos web se aceptan solos: entran confirmados, con la demora automática y sus datos.
    const confirmado = orderCard(column(page, 'Confirmados'), order.id);
    await expect(confirmado).toContainText(nombre);
    await expect(confirmado).toContainText('Web');
    await expect(confirmado).toContainText('Tocar timbre 2B');
    await expect(confirmado).toContainText(money(19500));
    await expect(confirmado).toContainText(/Estimado: \d+ min/);
    await expect(confirmado.getByRole('button', { name: 'Rechazar' })).toHaveCount(0);

    // El detalle muestra productos y facturación.
    await confirmado.getByRole('button', { name: `Ver detalle del pedido #${order.id}` }).click();
    const detalle = page.getByRole('dialog', { name: `Pedido #${order.id}` });
    await expect(detalle.getByRole('row', { name: /Pizza Muzzarella/ })).toContainText(money(17000));
    await expect(detalle.getByRole('row', { name: /Coca-Cola 500ml/ })).toContainText(money(2500));
    await expect(detalle.getByText('Belgrano 95, Ramos Mejía')).toBeVisible();
    await expect(detalle.getByText('Pendiente de pago')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detalle).toBeHidden();

    await confirmado.getByRole('button', { name: 'Marcar En Camino' }).click();
    const enCamino = orderCard(column(page, 'En Camino'), order.id);
    await expect(enCamino).toBeVisible();

    await enCamino.getByRole('button', { name: 'Finalizar' }).click();
    await expect(page.getByRole('button', { name: `Ver detalle del pedido #${order.id}`, exact: true })).toBeHidden();

    // Queda en el historial como finalizado.
    await goToSection(page, 'Historial');
    const fila = page.getByRole('row', { name: new RegExp(nombre) });
    await expect(fila).toContainText('Finalizado');
    await expect(fila).toContainText(money(19500));
  });

  test('un pedido para retirar se marca listo y un pedido cancelado sale del tablero', async ({ page, request }) => {
    const retira = await createWebOrder(request, {
      customerName: unique('Retira'),
      items: [['Pizza Fugazzeta', 1]],
      deliveryMethod: 'retiro',
    });
    const cancelado = await createWebOrder(request, { customerName: unique('Cancelado'), items: [['Flan casero', 1]] });

    await loginAsAdmin(page);

    // Se cancela desde el detalle del pedido (la tarjeta no tiene el botón).
    const aCancelar = orderCard(column(page, 'Confirmados'), cancelado.id);
    await expect(aCancelar.getByRole('button', { name: /Cancelar/ })).toHaveCount(0);
    await aCancelar.getByRole('button', { name: `Ver detalle del pedido #${cancelado.id}` }).click();
    const detalle = page.getByRole('dialog', { name: `Pedido #${cancelado.id}` });
    await detalle.getByRole('button', { name: 'Cancelar pedido' }).click();
    await detalle.getByRole('button', { name: 'Sí, cancelar' }).click();
    await expect(detalle).toBeHidden();
    await expect(page.getByRole('button', { name: `Ver detalle del pedido #${cancelado.id}`, exact: true })).toBeHidden();

    await expect(orderCard(column(page, 'Confirmados'), retira.id)).toContainText(/Estimado: \d+ min/);
    await orderCard(column(page, 'Confirmados'), retira.id).getByRole('button', { name: 'Marcar Listo para Retirar' }).click();
    await expect(orderCard(column(page, 'Listo para Retirar'), retira.id)).toBeVisible();
  });

  test('un pedido nuevo aparece en el tablero sin recargar la página', async ({ page, request }) => {
    await loginAsAdmin(page);
    const nombre = unique('Llega Después');

    const order = await createWebOrder(request, { customerName: nombre, items: [['Pizza Especial', 1]] });

    // El tablero consulta los pedidos cada 10 segundos.
    await expect(orderCard(column(page, 'Confirmados'), order.id)).toContainText(nombre, { timeout: 15_000 });
  });
});
