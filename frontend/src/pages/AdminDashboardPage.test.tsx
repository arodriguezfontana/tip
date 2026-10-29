import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import * as businessHoursService from '@/services/businessHoursService';
import * as catalogService from '@/services/catalogService';
import * as clientService from '@/services/clientService';
import * as deliveryDriverService from '@/services/deliveryDriverService';
import * as handoffService from '@/services/handoffService';
import * as ingredientService from '@/services/ingredientService';
import * as menuService from '@/services/menuService';
import * as orderService from '@/services/orderService';
import * as statsService from '@/services/statsService';
import * as storeConfigService from '@/services/storeConfigService';
import { ADMIN, MUZZA, fakeAuth, renderWithProviders } from '@/test/utils';

vi.mock('@/services/orderService');
vi.mock('@/services/handoffService');
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
  vi.mocked(handoffService.fetchHandoffs).mockResolvedValue([]);
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
  it('sin fondo elegido el panel se ve liso', async () => {
    renderDashboard();
    await screen.findByRole('button', { name: 'Abrir menú' });

    expect(screen.queryByTestId('admin-panel-bg')).not.toBeInTheDocument();
  });

  it('con un fondo elegido el panel lo muestra', async () => {
    vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({
      id: 1,
      store_name: 'RestoIT',
      address: null,
      contact_phone: null,
      logo_url: null,
      theme_color: 'black',
      panel_bg: 'custom',
      panel_bg_image: 'data:image/jpeg;base64,fondo-del-panel',
    });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('admin-panel-bg').style.backgroundImage).toContain('data:image/jpeg;base64,fondo-del-panel')
    );
    expect(screen.getByTestId('admin-panel-bg')).toHaveClass('blur-md'); // las fotos van desenfocadas
  });

  it('el color liso elegido se aplica al fondo del panel sin desenfocarlo', async () => {
    vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({
      id: 1,
      store_name: 'RestoIT',
      address: null,
      contact_phone: null,
      logo_url: null,
      theme_color: 'black',
      panel_bg: 'color',
      panel_bg_color: '#334155',
    });
    renderDashboard();

    const capa = await screen.findByTestId('admin-panel-bg');
    expect(capa.style.backgroundImage).toContain('rgb(51, 65, 85)'); // #334155
    expect(capa).not.toHaveClass('blur-md');
  });

  describe('menú lateral', () => {
    const anchaPantalla = (ancha: boolean) =>
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: ancha, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('en pantalla ancha queda abierto al elegir secciones, hasta que se toca la X', async () => {
      anchaPantalla(true);
      const { user } = renderDashboard();
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

      await user.click(screen.getByRole('button', { name: 'Historial' }));
      await user.click(screen.getByRole('button', { name: 'Clientes' }));

      expect(await screen.findByText('Aún no hay clientes registrados en el sistema.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Historial' })).toBeInTheDocument(); // el menú sigue abierto

      await user.click(within(screen.getByRole('complementary', { hidden: true })).getByRole('button', { name: 'Cerrar menú' }));

      expect(screen.queryByRole('button', { name: 'Historial' })).not.toBeInTheDocument(); // cerrado
    });

    it('no tapa ni mueve la página: sin fondo oscuro ni corrimiento al abrirlo', async () => {
      anchaPantalla(true);
      const { user } = renderDashboard();

      await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

      const raiz = screen.getByRole('banner').parentElement;
      expect(raiz?.className).not.toMatch(/\bl?g?:?pl-/);
      const fondoOscuro = document.querySelector('div.bg-black\\/40');
      expect(fondoOscuro).toHaveClass('lg:hidden'); // en pantalla ancha no bloquea la página
    });

    it('en una pantalla angosta el menú se cierra al elegir una sección', async () => {
      anchaPantalla(false);
      const { user } = renderDashboard();
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }));

      await user.click(screen.getByRole('button', { name: 'Historial' }));

      expect(screen.queryByRole('button', { name: 'Historial' })).not.toBeInTheDocument();
    });
  });

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
    expect(labels('Configuración')).toEqual(['Horarios', 'Menú en imagen', 'Configuración']);
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

  // Una prueba por sección: recorrerlas todas en una sola se acercaba al tope de tiempo cuando corre toda la suite.
  it.each<[string, () => Promise<unknown>]>([
    [
      'Estadísticas',
      async () => {
        expect(await screen.findByText('Panel de Rendimiento y Ventas')).toBeInTheDocument();
        expect(screen.getByText('Panel de Comandas')).not.toBeVisible();
      },
    ],
    ['Historial', async () => expect(await screen.findByText('No hay pedidos en el rango seleccionado.')).toBeInTheDocument()],
    ['Tomar pedido', async () => expect(screen.getByRole('heading', { name: 'Datos del cliente' })).toBeVisible()],
    ['Clientes', async () => expect(await screen.findByText('Aún no hay clientes registrados en el sistema.')).toBeInTheDocument()],
    ['Repartidores', async () => expect(await screen.findByText('Aún no hay repartidores registrados en el sistema.')).toBeInTheDocument()],
    ['Ingredientes', async () => expect(await screen.findByText('Todavía no cargaste ingredientes.')).toBeInTheDocument()],
    [
      'Productos y categorías',
      async () => {
        expect(screen.getByRole('heading', { name: 'Productos y categorías' })).toBeInTheDocument();
        expect(await screen.findByText('Todavía no hay productos en el catálogo.')).toBeInTheDocument();
      },
    ],
    [
      'Reporte de ingredientes',
      async () => expect(await screen.findByText('No hay consumo de ingredientes en el rango seleccionado.')).toBeInTheDocument(),
    ],
    ['Horarios', async () => expect(await screen.findByText(/se aceptan pedidos a cualquier hora/)).toBeInTheDocument()],
    ['Configuración', async () => expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument()],
  ])('navega a %s desde el menú lateral', async (section, verify) => {
    const { user } = renderDashboard();

    await goTo(user, section);

    await verify();
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
