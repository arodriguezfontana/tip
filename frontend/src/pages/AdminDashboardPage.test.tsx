import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import * as menuService from '@/services/menuService';
import * as orderService from '@/services/orderService';
import * as statsService from '@/services/statsService';
import { ADMIN, MUZZA, fakeAuth, renderWithProviders } from '@/test/utils';

vi.mock('@/services/orderService');
vi.mock('@/services/menuService');
vi.mock('@/services/statsService');
vi.mock('@/services/clientService');
vi.mock('@/hooks/useNewOrderAlert', () => ({
  useNewOrderAlert: () => ({ enabled: true, toggleEnabled: vi.fn(), unlockAudio: vi.fn(), audioSupported: true, audioBlocked: false }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(orderService.fetchOrders).mockResolvedValue([]);
  vi.mocked(menuService.fetchMenuProducts).mockResolvedValue([MUZZA]);
  vi.mocked(statsService.fetchStatusDistribution).mockResolvedValue({});
  vi.mocked(statsService.fetchTopProducts).mockResolvedValue([]);
  vi.mocked(statsService.fetchBestSellingDay).mockResolvedValue({ best_selling_day: null, total_revenue: null });
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
  // El menú lateral queda abierto después de elegir una sección.
  const openMenu = screen.queryByRole('button', { name: 'Abrir menú' });
  if (openMenu) await user.click(openMenu);
  await user.click(screen.getByRole('button', { name: section }));
}

describe('AdminDashboardPage', () => {
  it('arranca en el panel de comandas', async () => {
    renderDashboard();

    expect(screen.getByText('Panel de Comandas')).toBeVisible();
    expect(await screen.findAllByText('Sin pedidos')).toHaveLength(4);
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
