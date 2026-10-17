import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import * as businessHoursService from '@/services/businessHoursService';
import * as catalogService from '@/services/catalogService';
import * as clientService from '@/services/clientService';
import * as deliveryDriverService from '@/services/deliveryDriverService';
import * as ingredientService from '@/services/ingredientService';
import * as menuService from '@/services/menuService';
import * as orderService from '@/services/orderService';
import * as statsService from '@/services/statsService';
import * as storeConfigService from '@/services/storeConfigService';
import { ADMIN, MUZZA, fakeAuth, renderWithProviders } from '@/test/utils';

vi.mock('@/services/orderService');
vi.mock('@/services/deliveryDriverService');
vi.mock('@/services/menuService');
vi.mock('@/services/statsService');
vi.mock('@/services/clientService');
vi.mock('@/services/ingredientService');
vi.mock('@/services/catalogService');
vi.mock('@/services/businessHoursService');
vi.mock('@/services/storeConfigService');
vi.mock('@/hooks/useNewOrderAlert', () => ({
  useNewOrderAlert: () => ({ enabled: true, toggleEnabled: vi.fn(), unlockAudio: vi.fn(), audioSupported: true, audioBlocked: false }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(orderService.fetchOrders).mockResolvedValue([]);
  vi.mocked(deliveryDriverService.fetchDeliveryDrivers).mockResolvedValue([]);
  vi.mocked(menuService.fetchMenuProducts).mockResolvedValue([MUZZA]);
  vi.mocked(statsService.fetchStatusDistribution).mockResolvedValue({});
  vi.mocked(statsService.fetchTopProducts).mockResolvedValue([]);
  vi.mocked(statsService.fetchBestSellingDay).mockResolvedValue({ best_selling_day: null, total_revenue: null });
  vi.mocked(clientService.fetchClients).mockResolvedValue({ items: [], total: 0, page: 1, per_page: 10, total_pages: 1 });
  vi.mocked(ingredientService.fetchIngredients).mockResolvedValue([]);
  vi.mocked(catalogService.fetchAdminProducts).mockResolvedValue([]);
  vi.mocked(catalogService.fetchCategories).mockResolvedValue([]);
  vi.mocked(ingredientService.fetchIngredientConsumption).mockResolvedValue({
    completed_orders: 0,
    items: [],
    products_without_recipe: [],
  });
  vi.mocked(businessHoursService.fetchBusinessHours).mockResolvedValue({
    configured: false,
    is_open: true,
    closes_at: null,
    next_opening: null,
    next_opening_label: null,
    ranges: [],
  });
  vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({
    id: 1,
    store_name: 'RestoIT',
    address: 'Av. Corrientes 1234, CABA',
    opening_hours: 'Mar a Dom 19:00 a 00:00',
    contact_phone: '11 4444-1234',
    logo_url: null,
    theme_color: 'black',
    login_bg: 'bistro',
  });
});

function renderDashboard(auth = fakeAuth(ADMIN)) {
  renderWithProviders(<AdminDashboardPage />, {
    auth,
    route: '/admin',
    path: '/admin',
    routes: [{ path: '/login', element: <div>Pantalla de login</div> }],
  });
  return { auth, user: userEvent.setup() };
}

async function goTo(user: ReturnType<typeof userEvent.setup>, section: string) {
  await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
  const buttons = screen.getAllByRole('button', { name: section });
  const target = buttons.find((btn) => !btn.hasAttribute('aria-controls')) ?? buttons[0];
  await user.click(target);
  // Al elegir una sección el menú lateral se cierra solo.
  expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false');
}

describe('AdminDashboardPage', () => {
  it('arranca en el panel de comandas', async () => {
    renderDashboard();

    expect(screen.getByText('Panel de Comandas')).toBeVisible();
    expect(await screen.findAllByText('Sin pedidos')).toHaveLength(4);
  });

  it('el menú lateral agrupa las secciones por tarea', async () => {
    const { user } = renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

    const labels = (group: string) =>
      within(screen.getByRole('group', { name: group }))
        .getAllByRole('button')
        .map((button) => button.textContent);
    expect(labels('Operación')).toEqual(['Comandas', 'Tomar pedido', 'Historial', 'Clientes', 'Repartidores']);
    expect(labels('Catálogo')).toEqual(['Productos y categorías', 'Ingredientes']);
    expect(labels('Reportes')).toEqual(['Estadísticas', 'Reporte de ingredientes']);
    expect(labels('Configuración')).toEqual(['Horarios', 'Configuración']);
    expect(screen.queryByRole('button', { name: 'Ingresos' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comandas' })).toHaveAttribute('aria-current', 'page');
  });

  it('los grupos del menú lateral se pliegan y despliegan, y se recuerda cuáles quedaron plegados', async () => {
    const { user } = renderDashboard();
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const catalogo = screen.getByRole('button', { name: 'Catálogo' });
    expect(catalogo).toHaveAttribute('aria-expanded', 'true');

    await user.click(catalogo);

    expect(catalogo).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Ingredientes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Catálogo' })).not.toBeInTheDocument();
    // Los demás grupos no se ven afectados.
    expect(screen.getByRole('button', { name: 'Estadísticas' })).toBeInTheDocument();

    // Al volver a entrar al panel, el grupo sigue plegado.
    cleanup();
    const { user: otraVisita } = renderDashboard();
    await otraVisita.click(screen.getByRole('button', { name: 'Abrir menú' }));
    expect(screen.getByRole('button', { name: 'Catálogo' })).toHaveAttribute('aria-expanded', 'false');

    await otraVisita.click(screen.getByRole('button', { name: 'Catálogo' }));
    expect(screen.getByRole('button', { name: 'Ingredientes' })).toBeInTheDocument();
  });

  it('navega por las secciones desde el menú lateral', async () => {
    const { user } = renderDashboard();

    await goTo(user, 'Estadísticas');
    expect(await screen.findByText('Panel de Rendimiento y Ventas')).toBeInTheDocument();
    expect(screen.getByText('Panel de Comandas')).not.toBeVisible();

    await goTo(user, 'Historial');
    expect(await screen.findByText('No hay pedidos en el rango seleccionado.')).toBeInTheDocument();

    await goTo(user, 'Tomar pedido');
    expect(screen.getByRole('heading', { name: 'Datos del cliente' })).toBeVisible();

    await goTo(user, 'Clientes');
    expect(await screen.findByText('Aún no hay clientes registrados en el sistema.')).toBeInTheDocument();

    await goTo(user, 'Repartidores');
    expect(await screen.findByText('Aún no hay repartidores registrados en el sistema.')).toBeInTheDocument();

    await goTo(user, 'Ingredientes');
    expect(await screen.findByText('Todavía no cargaste ingredientes.')).toBeInTheDocument();

    await goTo(user, 'Productos y categorías');
    expect(screen.getByRole('heading', { name: 'Productos y categorías' })).toBeInTheDocument();
    expect(await screen.findByText('Todavía no hay productos en el catálogo.')).toBeInTheDocument();

    await goTo(user, 'Reporte de ingredientes');
    expect(await screen.findByText('No hay consumo de ingredientes en el rango seleccionado.')).toBeInTheDocument();

    await goTo(user, 'Horarios');
    expect(await screen.findByText(/se aceptan pedidos a cualquier hora/)).toBeInTheDocument();

    await goTo(user, 'Configuración');
    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
  });

  it('el pedido a medio cargar se conserva al cambiar de sección', async () => {
    const { user } = renderDashboard();

    await goTo(user, 'Tomar pedido');
    await user.type(screen.getByLabelText('Nombre *'), 'Paula');
    await goTo(user, 'Comandas');
    await goTo(user, 'Tomar pedido');

    expect(screen.getByLabelText('Nombre *')).toHaveValue('Paula');
  });

  it('cerrar sesión vuelve al login', async () => {
    const { auth, user } = renderDashboard();

    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(auth.logout).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });
});
