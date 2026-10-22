import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from '@/pages/MenuPage';
import * as businessHoursService from '@/services/businessHoursService';
import * as menuService from '@/services/menuService';
import * as mercadopagoService from '@/services/mercadopagoService';
import * as orderService from '@/services/orderService';
import * as storeConfigService from '@/services/storeConfigService';
import type { BusinessHoursStatus } from '@/types/businessHours';
import type { WebOrderCreated } from '@/types/order';
import { savePendingPaymentOrder } from '@/utils/pendingPayment';
import { COCA, CUSTOMER, FUGAZZETA, MUZZA, fakeAuth, renderWithProviders } from '@/test/utils';

vi.mock('@/services/menuService');
vi.mock('@/services/orderService');
vi.mock('@/services/businessHoursService');
vi.mock('@/services/storeConfigService');
vi.mock('@/services/mercadopagoService');

const menu = vi.mocked(menuService);
const orders = vi.mocked(orderService);
const businessHours = vi.mocked(businessHoursService);
const mercadopago = vi.mocked(mercadopagoService);
const storeConfig = vi.mocked(storeConfigService);

const OPEN: BusinessHoursStatus = {
  configured: true,
  is_open: true,
  closes_at: null,
  next_opening: null,
  next_opening_label: null,
  ranges: [{ day_of_week: 1, opens_at: '20:00', closes_at: '00:00' }],
};
const CLOSED: BusinessHoursStatus = {
  ...OPEN,
  is_open: false,
  next_opening_label: 'mañana a las 20:00',
  ranges: [
    { day_of_week: 1, opens_at: '20:00', closes_at: '00:00' },
    { day_of_week: 1, opens_at: '12:00', closes_at: '15:00' },
  ],
};

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

function orderCreated(overrides: Partial<WebOrderCreated> = {}): WebOrderCreated {
  return {
    id: 321,
    status: 'Pendiente',
    customer_name: 'Ana Gómez',
    customer_phone: '11 5555-1234',
    delivery_method: 'retiro',
    shipping_address: 'Retiro en el local',
    notes: null,
    total_amount: 2 * 8500 + 2500,
    created_at: new Date().toISOString(),
    items: [
      { product_id: 1, product_name: 'Pizza Muzzarella', quantity: 2, unit_price: 8500, subtotal: 17000 },
      { product_id: 3, product_name: 'Coca-Cola 500ml', quantity: 1, unit_price: 2500, subtotal: 2500 },
    ],
    payment_method: 'efectivo',
    is_paid: false,
    payment_url: null,
    ...overrides,
  };
}

function renderMenu(auth = fakeAuth(), route = '/menu') {
  return renderWithProviders(<MenuPage />, { auth, route });
}

function productCard(name: string) {
  return screen.getByRole('heading', { name, level: 3 }).closest('div.bg-white') as HTMLElement;
}

function cart() {
  return screen.getByRole('heading', { name: 'Tu carrito' }).parentElement as HTMLElement;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  menu.fetchMenuProducts.mockResolvedValue([MUZZA, FUGAZZETA, COCA]);
  businessHours.fetchBusinessHours.mockResolvedValue(OPEN);
  storeConfig.fetchStoreConfig.mockResolvedValue({
    id: 1,
    store_name: 'RestoIT',
    address: 'Av. Corrientes 1234, CABA',
    contact_phone: '11 4444-1234',
    logo_url: null,
    theme_color: 'black',
    login_bg: 'bistro',
  });
});

describe('MenuPage', () => {
  it('muestra los productos agrupados por categoría con precio y restricciones', async () => {
    renderMenu();

    expect(await screen.findByRole('heading', { name: 'Pizzas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bebidas' })).toBeInTheDocument();
    expect(plain(within(productCard('Fugazzeta')).getByText(/\$/).textContent)).toBe('$ 9.500,00');
    expect(within(productCard('Fugazzeta')).getByText('vegetariano')).toBeInTheDocument();
    expect(screen.getByText('Tu carrito está vacío')).toBeInTheDocument();
    expect(screen.getByText('Agregá productos al carrito para continuar.')).toBeInTheDocument();
  });

  it('si el menú no carga permite reintentar', async () => {
    menu.fetchMenuProducts.mockRejectedValueOnce({ message: 'No se pudo conectar con el servidor.' });
    renderMenu();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo conectar con el servidor.');

    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: 'Pizza Muzzarella' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa si no hay productos disponibles', async () => {
    menu.fetchMenuProducts.mockResolvedValue([]);
    renderMenu();

    expect(await screen.findByText('No hay productos disponibles en este momento.')).toBeInTheDocument();
  });

  it('el carrito suma, resta y quita productos y recalcula el total', async () => {
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });

    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar una unidad de Pizza Muzzarella' }));
    await user.click(within(productCard('Coca-Cola 500ml')).getByRole('button', { name: 'Agregar' }));

    expect(plain(within(cart()).getByText(/^\$.*/, { selector: 'span.font-bold' }).textContent)).toBe('$ 19.500,00');

    await user.click(within(cart()).getByRole('button', { name: 'Quitar una unidad de Pizza Muzzarella' }));
    await user.click(within(cart()).getByRole('button', { name: 'Quitar Coca-Cola 500ml del carrito' }));

    expect(within(cart()).queryByText('Coca-Cola 500ml')).not.toBeInTheDocument();
    expect(plain(within(cart()).getByText(/^\$.*/, { selector: 'span.font-bold' }).textContent)).toBe('$ 8.500,00');
  });

  it('valida los datos antes de enviar el pedido', async () => {
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText('Teléfono'), 'llamame');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(screen.getByText('Ingresá tu nombre.')).toBeInTheDocument();
    expect(screen.getByText(/Ingresá un teléfono válido/)).toBeInTheDocument();
    expect(screen.getByText('Ingresá la dirección de entrega.')).toBeInTheDocument();
    expect(orders.createWebOrder).not.toHaveBeenCalled();
  });

  it('un invitado hace un pedido para retirar y ve la confirmación', async () => {
    orders.createWebOrder.mockResolvedValue(orderCreated());
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });

    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar una unidad de Pizza Muzzarella' }));
    await user.click(within(productCard('Coca-Cola 500ml')).getByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText('Nombre'), '  Ana Gómez ');
    await user.type(screen.getByLabelText('Teléfono'), '11 5555-1234');
    await user.click(screen.getByRole('button', { name: 'Retiro en el local' }));
    expect(screen.queryByLabelText('Dirección')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Observaciones (opcional)'), 'Sin aceitunas');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(orders.createWebOrder).toHaveBeenCalledWith({
      customer_name: 'Ana Gómez',
      customer_phone: '11 5555-1234',
      delivery_method: 'retiro',
      shipping_address: null,
      notes: 'Sin aceitunas',
      items: [
        { product_id: MUZZA.id, quantity: 2 },
        { product_id: COCA.id, quantity: 1 },
      ],
      payment_method: 'efectivo',
    });
    expect(await screen.findByRole('heading', { name: 'Pedido #321' })).toBeInTheDocument();
    expect(mercadopago.redirectToCheckout).not.toHaveBeenCalled();
    expect(screen.getByText(/Recibimos tu pedido/)).toBeInTheDocument();
    expect(screen.getByText('Pizza Muzzarella x2')).toBeInTheDocument();
    expect(screen.getByText('Sin aceitunas')).toBeInTheDocument();

    // "Realizar otro pedido" vuelve al menú con el carrito vacío.
    await user.click(screen.getByRole('button', { name: 'Realizar otro pedido' }));
    expect(await screen.findByText('Tu carrito está vacío')).toBeInTheDocument();
  });

  it('en pantallas chicas una barra fija resume el pedido y lleva a los datos', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    expect(screen.queryByRole('region', { name: 'Resumen de tu pedido' })).not.toBeInTheDocument();

    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar una unidad de Pizza Muzzarella' }));
    await user.click(within(productCard('Coca-Cola 500ml')).getByRole('button', { name: 'Agregar' }));

    const bar = screen.getByRole('region', { name: 'Resumen de tu pedido' });
    expect(within(bar).getByText('3 productos')).toBeInTheDocument();
    expect(plain(bar.textContent)).toContain('19.500');

    await user.click(within(bar).getByRole('button', { name: 'Ver pedido y datos' }));
    const section = document.getElementById('pedido') as HTMLElement;
    expect(scrollIntoView).toHaveBeenCalled();
    expect(section).toHaveFocus();
    // Los datos del pedido están dentro de esa sección.
    expect(within(section).getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('ofrece efectivo y MercadoPago, y con MercadoPago lleva al checkout por el total', async () => {
    const paymentUrl = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-321';
    orders.createWebOrder.mockResolvedValue(orderCreated({ payment_method: 'mercadopago', payment_url: paymentUrl }));
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });

    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Teléfono'), '1155551234');
    await user.click(screen.getByRole('button', { name: 'Retiro en el local' }));

    const payment = screen.getByRole('radiogroup', { name: 'Medio de pago' });
    expect(within(payment).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Efectivo', 'MercadoPago']);
    expect(within(payment).getByRole('radio', { name: 'Efectivo' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(payment).getByRole('radio', { name: 'MercadoPago' }));
    expect(plain(screen.getByText(/te llevamos a MercadoPago/).textContent)).toContain('$ 8.500');
    await user.click(screen.getByRole('button', { name: 'Confirmar e ir a pagar' }));

    expect(orders.createWebOrder).toHaveBeenCalledWith(expect.objectContaining({ payment_method: 'mercadopago' }));
    await waitFor(() => expect(mercadopago.redirectToCheckout).toHaveBeenCalledWith(paymentUrl));
    expect(screen.getByRole('link', { name: 'tocá acá para pagar' })).toHaveAttribute('href', paymentUrl);
  });

  it('al volver de MercadoPago muestra la página de confirmación con el pago recibido, no el menú', async () => {
    mercadopago.confirmMercadoPagoPayment.mockResolvedValue('approved');
    renderMenu(fakeAuth(), '/menu?pedido=321&payment_id=987&status=approved&external_reference=321');

    expect(await screen.findByText('¡Recibimos tu pago!')).toBeInTheDocument();
    expect(screen.getByText(/Tu pedido #321 quedó abonado/)).toBeInTheDocument();
    expect(mercadopago.confirmMercadoPagoPayment).toHaveBeenCalledWith('987');
    // Es una página de confirmación: ya no se ve el menú ni el formulario del pedido.
    expect(screen.getByRole('heading', { name: 'Pedido #321' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nuestro menú' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument();
  });

  it('al volver de MercadoPago muestra el detalle del pedido que se guardó antes de ir a pagar', async () => {
    mercadopago.confirmMercadoPagoPayment.mockResolvedValue('approved');
    savePendingPaymentOrder({
      order: orderCreated({ payment_method: 'mercadopago', payment_url: 'https://www.mercadopago.com.ar/pagar' }),
      form: { name: 'Ana Gómez', phone: '11 5555-1234', deliveryMethod: 'retiro', address: '', notes: '', paymentMethod: 'mercadopago' },
    });
    renderMenu(fakeAuth(), '/menu?pedido=321&payment_id=987&status=approved');

    expect(await screen.findByText('¡Recibimos tu pago!')).toBeInTheDocument();
    expect(screen.getByText('Pizza Muzzarella x2')).toBeInTheDocument();
    expect(screen.getByText('MercadoPago')).toBeInTheDocument();
    expect(plain(screen.getByText('Total').parentElement?.textContent ?? '')).toContain('19.500');
  });

  it('si MercadoPago no aprobó el pago lo avisa aunque la URL diga lo contrario', async () => {
    mercadopago.confirmMercadoPagoPayment.mockResolvedValue('rejected');
    renderMenu(fakeAuth(), '/menu?pedido=321&payment_id=987&status=approved');

    expect(await screen.findByText('No se completó el pago')).toBeInTheDocument();
    expect(screen.queryByText('¡Recibimos tu pago!')).not.toBeInTheDocument();
  });

  it('si el pago queda pendiente de acreditación lo avisa', async () => {
    mercadopago.confirmMercadoPagoPayment.mockResolvedValue('in_process');
    renderMenu(fakeAuth(), '/menu?pedido=321&payment_id=987&status=pending');

    expect(await screen.findByText('Tu pago está pendiente de acreditación')).toBeInTheDocument();
  });

  it('si el cliente vuelve sin pagar ofrece pagar de nuevo y permite hacer otro pedido', async () => {
    savePendingPaymentOrder({
      order: orderCreated({ payment_method: 'mercadopago', payment_url: 'https://www.mercadopago.com.ar/pagar' }),
      form: { name: 'Ana Gómez', phone: '11 5555-1234', deliveryMethod: 'retiro', address: '', notes: '', paymentMethod: 'mercadopago' },
    });
    const user = userEvent.setup();
    renderMenu(fakeAuth(), '/menu?pedido=321&payment_id=null&status=null');

    expect(await screen.findByText('No se completó el pago')).toBeInTheDocument();
    expect(screen.getByText(/quedó registrado como pendiente de pago/)).toBeInTheDocument();
    expect(mercadopago.confirmMercadoPagoPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Pagar de nuevo con MercadoPago' })).toHaveAttribute(
      'href',
      'https://www.mercadopago.com.ar/pagar'
    );

    await user.click(screen.getByRole('button', { name: 'Realizar otro pedido' }));
    expect(await screen.findByRole('heading', { name: 'Nuestro menú' })).toBeInTheDocument();
  });

  it('sin los datos guardados confirma igual el estado del pago', async () => {
    mercadopago.confirmMercadoPagoPayment.mockResolvedValue('approved');
    renderMenu(fakeAuth(), '/menu?pedido=999&payment_id=5&status=approved');

    expect(await screen.findByText('¡Recibimos tu pago!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pedido #999' })).toBeInTheDocument();
  });

  it('si el local rechaza el pedido muestra el motivo y conserva el carrito', async () => {
    orders.createWebOrder.mockRejectedValue({
      statusCode: 400,
      message: 'Estos productos no están disponibles en este momento: Fugazzeta.',
    });
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Fugazzeta' });

    await user.click(within(productCard('Fugazzeta')).getByRole('button', { name: 'Agregar' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Teléfono'), '1155551234');
    await user.type(screen.getByLabelText('Dirección'), 'Calle Falsa 123');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Fugazzeta');
    expect(within(cart()).getByText('Fugazzeta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeEnabled();
  });

  it('con la sesión iniciada autocompleta los datos de la cuenta', async () => {
    orders.createWebOrder.mockResolvedValue(orderCreated({ delivery_method: 'domicilio' }));
    renderMenu(fakeAuth(CUSTOMER));
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });

    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));

    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana Gómez');
    expect(screen.getByLabelText('Teléfono')).toHaveValue('11 5555-1234');
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle Falsa 123');
    expect(screen.getByRole('link', { name: 'perfil' })).toHaveAttribute('href', '/perfil');

    // Los datos se pueden cambiar solo para este pedido.
    await user.clear(screen.getByLabelText('Dirección'));
    await user.type(screen.getByLabelText('Dirección'), 'Oficina: Corrientes 1000');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    await waitFor(() =>
      expect(orders.createWebOrder).toHaveBeenCalledWith(
        expect.objectContaining({ shipping_address: 'Oficina: Corrientes 1000', delivery_method: 'domicilio' })
      )
    );
  });

  it('un invitado puede abrir el ingreso o el registro desde el formulario', async () => {
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));

    await user.click(screen.getByRole('button', { name: 'creá una cuenta' }));

    expect(screen.getByRole('dialog', { name: 'Crear cuenta' })).toBeInTheDocument();
  });

  it('con el local cerrado avisa cuándo vuelve a abrir, sin repetir los horarios, y no permite hacer pedidos', async () => {
    businessHours.fetchBusinessHours.mockResolvedValue(CLOSED);
    renderMenu();
    const user = userEvent.setup();

    const notice = await screen.findByRole('region', { name: 'El local se encuentra cerrado' });
    expect(notice).toHaveTextContent('Volvemos a abrir mañana a las 20:00.');
    // Solo el aviso: los horarios ya están en el recuadro de datos del local.
    expect(within(notice).queryByText('Nuestros horarios')).not.toBeInTheDocument();
    expect(notice).not.toHaveTextContent(/12:00 a 15:00/);
    expect(within(notice).queryByRole('term')).not.toBeInTheDocument();

    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));

    expect(screen.getByText(/Vas a poder hacer tu pedido cuando volvamos a abrir/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar pedido' })).not.toBeInTheDocument();
  });

  it('muestra los horarios agrupados por día en el recuadro de datos del local', async () => {
    businessHours.fetchBusinessHours.mockResolvedValue({
      ...OPEN,
      ranges: [0, 1, 2, 3, 4, 5].flatMap((day) => [
        { day_of_week: day, opens_at: '11:00', closes_at: '15:00' },
        { day_of_week: day, opens_at: '19:00', closes_at: '23:59' },
      ]).concat([{ day_of_week: 6, opens_at: '19:00', closes_at: '23:59' }]),
    });
    renderMenu();

    const info = await screen.findByRole('region', { name: 'Información de contacto del local' });
    const rows = within(info)
      .getAllByRole('term')
      .map((term) => [term.textContent, [...(term.nextElementSibling?.querySelectorAll('span') ?? [])].map((span) => span.textContent)]);
    expect(rows).toEqual([
      ['Lunes a Sábado', ['11:00 a 15:00', '19:00 a 23:59']],
      ['Domingo', ['19:00 a 23:59']],
    ]);
    expect(within(info).getByText('Horarios')).toBeInTheDocument();
  });

  it('sin horarios configurados no muestra el aviso de cerrado', async () => {
    businessHours.fetchBusinessHours.mockResolvedValue({ ...CLOSED, configured: false, ranges: [] });
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));

    expect(screen.queryByRole('region', { name: 'El local se encuentra cerrado' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeInTheDocument();
  });

  it('si el local cerró mientras armaba el pedido muestra el aviso del servidor', async () => {
    orders.createWebOrder.mockRejectedValue({
      statusCode: 409,
      message: 'El local está cerrado en este momento, así que no podemos tomar pedidos.',
    });
    renderMenu();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Pizza Muzzarella' });
    await user.click(within(productCard('Pizza Muzzarella')).getByRole('button', { name: 'Agregar' }));
    await user.click(screen.getByRole('button', { name: 'Retiro en el local' }));
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Teléfono'), '11 5555-1234');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El local está cerrado en este momento');
  });
});
