import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL } from '../env';

/** Nombre único por corrida, para encontrar los datos de cada test aunque la base tenga otros. */
export function unique(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Teléfono único y válido (solo dígitos). */
export function uniquePhone(): string {
  return `11${String(Date.now()).slice(-8)}`;
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText('Panel de Comandas')).toBeVisible();
}

export async function adminToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_URL}/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token;
}

interface Product {
  id: number;
  name: string;
  price: number;
}

export async function menuProducts(request: APIRequestContext): Promise<Product[]> {
  const response = await request.get(`${API_URL}/menu/products`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** Crea un pedido web como lo haría un cliente, directo contra la API. */
export async function createWebOrder(
  request: APIRequestContext,
  {
    customerName,
    items,
    deliveryMethod = 'domicilio',
  }: { customerName: string; items: [string, number][]; deliveryMethod?: 'domicilio' | 'retiro' }
): Promise<{ id: number; total_amount: number }> {
  const products = await menuProducts(request);
  const byName = new Map(products.map((p) => [p.name, p]));
  const response = await request.post(`${API_URL}/orders/web`, {
    data: {
      customer_name: customerName,
      customer_phone: '11 4444-5555',
      delivery_method: deliveryMethod,
      shipping_address: deliveryMethod === 'domicilio' ? 'Belgrano 95, Ramos Mejía' : null,
      notes: 'Tocar timbre 2B',
      items: items.map(([name, quantity]) => ({ product_id: byName.get(name)!.id, quantity })),
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function setOrderStatus(request: APIRequestContext, token: string, orderId: number, status: string) {
  const response = await request.patch(`${API_URL}/orders/${orderId}/status`, {
    data: { status },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBeTruthy();
}

/** Camino de cada estado activo hasta cerrarse, para dejar el tablero vacío. */
const CLOSE_PATH: Record<string, string[]> = {
  Pendiente: ['Rechazado'],
  Confirmado: ['En Camino', 'Finalizado'],
  'En Camino': ['Finalizado'],
  'Listo para Retirar': ['Finalizado'],
};

/**
 * Cierra los pedidos activos que dejaron otros tests. El tablero pagina cada columna y muestra
 * primero los más antiguos: sin esto, un pedido nuevo podría quedar en la segunda página.
 */
export async function clearBoard(request: APIRequestContext) {
  const token = await adminToken(request);
  const query = Object.keys(CLOSE_PATH).map((s) => `status=${encodeURIComponent(s)}`).join('&');
  const response = await request.get(`${API_URL}/orders?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(response.ok()).toBeTruthy();
  for (const order of (await response.json()) as { id: number; status: string; delivery_method: string }[]) {
    const path = order.status === 'Confirmado' && order.delivery_method === 'retiro'
      ? ['Listo para Retirar', 'Finalizado']
      : CLOSE_PATH[order.status];
    for (const status of path) await setOrderStatus(request, token, order.id, status);
  }
}

/** Columna del tablero de comandas. */
export function column(page: Page, title: 'Pendientes' | 'Confirmados' | 'En Camino' | 'Listo para Retirar'): Locator {
  return page
    .getByRole('heading', { name: title, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]');
}

/** Tarjeta de un pedido en el tablero (dentro de la columna indicada, o en cualquiera). */
export function orderCard(scope: Page | Locator, orderId: number): Locator {
  return scope
    .getByRole('button', { name: `Ver detalle del pedido #${orderId}`, exact: true })
    .locator('xpath=ancestor::div[contains(@class, "p-4")][1]');
}

export async function goToSection(page: Page, section: string) {
  const openMenu = page.getByRole('button', { name: 'Abrir menú' });
  if (await openMenu.isVisible()) await openMenu.click();
  await page.getByRole('navigation').getByRole('button', { name: section }).click();
  // Al elegir una sección el menú lateral se cierra solo.
  await expect(page.locator('aside')).toHaveAttribute('aria-hidden', 'true');
}

/** Texto con los espacios no separables de Intl normalizados. */
export function money(amount: number): RegExp {
  const formatted = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  return new RegExp(formatted.replace(/\s/g, '\\s').replace(/\$/g, '\\$').replace(/\./g, '\\.'));
}
