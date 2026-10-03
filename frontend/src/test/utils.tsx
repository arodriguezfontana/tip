import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '@/context/auth-context';
import type { AuthContextValue } from '@/context/auth-context';
import { CartProvider } from '@/context/CartContext';
import type { Me } from '@/services/authService';
import type { AdminOrder, OrderDetail, Product } from '@/types/order';

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    name: 'Pizza Muzzarella',
    description: 'Salsa de tomate y muzzarella.',
    price: 8500,
    category: { id: 1, name: 'Pizzas' },
    dietary_restrictions: [],
    ...overrides,
  };
}

export const MUZZA = makeProduct();
export const FUGAZZETA = makeProduct({ id: 2, name: 'Fugazzeta', price: 9500, dietary_restrictions: ['vegetariano'] });
export const COCA = makeProduct({
  id: 3,
  name: 'Coca-Cola 500ml',
  description: 'Botella de 500ml.',
  price: 2500,
  category: { id: 2, name: 'Bebidas' },
});

export function makeOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 101,
    customer_name: 'Paula Gómez',
    shipping_address: 'Belgrano 95',
    total_amount: 17000,
    status: 'Pendiente',
    delivery_method: 'domicilio',
    source: 'web',
    customer_phone: '11 4444-5555',
    notes: null,
    estimated_minutes: null,
    scheduled_for: null,
    created_at: new Date().toISOString(),
    item_count: 1,
    ...overrides,
  };
}

export function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    ...makeOrder(),
    items: [{ product_id: 1, product_name: 'Pizza Muzzarella', quantity: 2, unit_price: 8500, subtotal: 17000 }],
    subtotal: 17000,
    shipping_cost: 0,
    payment_method: null,
    is_paid: false,
    ...overrides,
  };
}

export const ADMIN: Me = {
  id: 1,
  email: 'admin@restoit.com',
  role: 'ADMIN',
  is_active: true,
  full_name: null,
  phone: null,
  address: null,
};

export const CUSTOMER: Me = {
  id: 7,
  email: 'ana@mail.com',
  role: 'CUSTOMER',
  is_active: true,
  full_name: 'Ana Gómez',
  phone: '11 5555-1234',
  address: 'Calle Falsa 123',
};

/** Sesión falsa para renderizar componentes sin pasar por el AuthProvider real ni la API. */
export function fakeAuth(user: Me | null = null, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user,
    isLoading: false,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN',
    isCustomer: user?.role === 'CUSTOMER',
    login: vi.fn(),
    register: vi.fn(),
    updateProfile: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

/** Muestra la ruta actual para verificar redirecciones. */
export function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

interface RenderOptions {
  auth?: AuthContextValue;
  route?: string;
  /** Otras rutas a registrar (por ejemplo, el destino de una redirección). */
  routes?: { path: string; element: ReactNode }[];
  path?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { auth = fakeAuth(), route = '/', path = '*', routes = [] }: RenderOptions = {}
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider value={auth}>
        <CartProvider>
          <Routes>
            <Route path={path} element={ui} />
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Routes>
          <LocationDisplay />
        </CartProvider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
