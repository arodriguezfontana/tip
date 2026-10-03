import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TomarPedidoView } from '@/components/TomarPedidoView';
import * as clientService from '@/services/clientService';
import * as menuService from '@/services/menuService';
import * as orderService from '@/services/orderService';
import { COCA, FUGAZZETA, MUZZA } from '@/test/utils';

vi.mock('@/services/menuService');
vi.mock('@/services/orderService');
vi.mock('@/services/clientService');

const menu = vi.mocked(menuService);
const orders = vi.mocked(orderService);
const clients = vi.mocked(clientService);

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

/** Botón del producto en el catálogo (el resumen tiene otros botones con su nombre). */
function product(name: RegExp) {
  const catalog = screen.getByRole('heading', { name: 'Productos' }).closest('section') as HTMLElement;
  return within(catalog).getByRole('button', { name });
}

function summary() {
  return screen.getByRole('heading', { name: 'Resumen del pedido' }).closest('section') as HTMLElement;
}

function total() {
  return plain(within(summary()).getByText('TOTAL').nextElementSibling!.textContent);
}

async function renderView() {
  render(<TomarPedidoView />);
  await screen.findByRole('button', { name: /Pizza Muzzarella/ });
  return userEvent.setup();
}

beforeEach(() => {
  vi.resetAllMocks();
  menu.fetchMenuProducts.mockResolvedValue([MUZZA, FUGAZZETA, COCA]);
  clients.lookupClientByPhone.mockResolvedValue(null);
  orders.createCounterOrder.mockResolvedValue({
    id: 777,
    status: 'Confirmado',
    customer_name: 'Paula',
    customer_phone: '1144445555',
    delivery_method: 'retiro',
    shipping_address: 'Retiro en el local',
    notes: null,
    total_amount: 0,
    created_at: new Date().toISOString(),
    items: [],
  });
});

describe('TomarPedidoView', () => {
  it('arma el pedido tocando productos y calcula el total', async () => {
    const user = await renderView();

    await user.click(product(/Pizza Muzzarella/));
    await user.click(product(/Pizza Muzzarella/));
    await user.click(product(/Coca-Cola/));

    expect(within(summary()).getByText('Unidades: 3 · Productos: 2')).toBeInTheDocument();
    expect(total()).toBe('$ 19.500,00');

    await user.click(screen.getByRole('button', { name: 'Restar una unidad de Pizza Muzzarella' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar Coca-Cola 500ml del pedido' }));
    expect(total()).toBe('$ 8.500,00');
  });

  it('filtra el catálogo por categoría y por búsqueda', async () => {
    const user = await renderView();

    await user.click(screen.getByRole('button', { name: 'Bebidas' }));
    expect(within(screen.getByRole('heading', { name: 'Productos' }).closest('section') as HTMLElement).queryByRole('button', { name: /Fugazzeta/ })).not.toBeInTheDocument();
    expect(product(/Coca-Cola/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Todas' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar producto' }), 'fuga{Enter}');
    expect(product(/Fugazzeta/)).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Productos' }).closest('section') as HTMLElement).queryByRole('button', { name: /Pizza Muzzarella/ })).not.toBeInTheDocument();
    // Enter en el buscador no envía el pedido.
    expect(orders.createCounterOrder).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('searchbox', { name: 'Buscar producto' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar producto' }), 'sushi');
    expect(screen.getByText('No hay productos que coincidan.')).toBeInTheDocument();
  });

  it('valida cliente y productos antes de registrar', async () => {
    const user = await renderView();

    await user.click(screen.getByRole('radio', { name: 'Envío a domicilio' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(screen.getByText('Ingresá el nombre del cliente.')).toBeInTheDocument();
    expect(screen.getByText('Ingresá el teléfono.')).toBeInTheDocument();
    expect(screen.getByText('La dirección es obligatoria para envíos a domicilio.')).toBeInTheDocument();
    expect(screen.getByText('Agregá al menos un producto al pedido.')).toBeInTheDocument();
    expect(orders.createCounterOrder).not.toHaveBeenCalled();
  });

  it('la dirección solo se habilita para envíos', async () => {
    const user = await renderView();

    expect(screen.getByLabelText(/Dirección/)).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Envío a domicilio' }));
    expect(screen.getByLabelText(/Dirección/)).toBeEnabled();
  });

  it('registra un pedido presencial con el pago y deja el formulario listo para el siguiente', async () => {
    const user = await renderView();

    await user.type(screen.getByLabelText('Teléfono *'), '11 4444-5555');
    await user.type(screen.getByLabelText('Nombre *'), 'Paula');
    await user.click(product(/Pizza Muzzarella/));
    await user.click(product(/Coca-Cola/));
    await user.type(screen.getByLabelText('Observaciones'), 'Sin cebolla');
    await user.click(screen.getByRole('radio', { name: 'Efectivo' }));
    await user.click(screen.getByRole('checkbox', { name: 'Ya abonado' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(orders.createCounterOrder).toHaveBeenCalledWith({
      customer_name: 'Paula',
      customer_phone: '11 4444-5555',
      delivery_method: 'retiro',
      shipping_address: null,
      notes: 'Sin cebolla',
      payment_method: 'efectivo',
      is_paid: true,
      items: [
        { product_id: MUZZA.id, quantity: 1 },
        { product_id: COCA.id, quantity: 1 },
      ],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Pedido #777 registrado correctamente.');
    expect(screen.getByLabelText('Teléfono *')).toHaveValue('');
    expect(screen.getByLabelText('Teléfono *')).toHaveFocus();
    expect(screen.getByText('Hacé click en un producto para agregarlo.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Efectivo' })).toHaveAttribute('aria-checked', 'false');
  });

  it('un segundo clic en el método de pago lo deja sin especificar', async () => {
    const user = await renderView();

    await user.click(screen.getByRole('radio', { name: 'Tarjeta' }));
    expect(screen.getByRole('radio', { name: 'Tarjeta' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Tarjeta' }));
    expect(screen.getByRole('radio', { name: 'Tarjeta' })).toHaveAttribute('aria-checked', 'false');
  });

  it('autocompleta los datos de un cliente registrado y avisa si se modifican', async () => {
    clients.lookupClientByPhone.mockResolvedValue({ id: 1, phone: '1144445555', full_name: 'Paula Gómez', address: 'Belgrano 95' });
    const user = await renderView();

    await user.click(screen.getByRole('radio', { name: 'Envío a domicilio' }));
    await user.type(screen.getByLabelText('Teléfono *'), '1144445555');

    expect(await screen.findByText(/Cliente registrado: datos completados/)).toBeInTheDocument();
    expect(clients.lookupClientByPhone).toHaveBeenCalledTimes(1);
    expect(clients.lookupClientByPhone).toHaveBeenCalledWith('1144445555', expect.any(AbortSignal));
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Paula Gómez');
    expect(screen.getByLabelText(/Dirección/)).toHaveValue('Belgrano 95');

    await user.clear(screen.getByLabelText(/Dirección/));
    await user.type(screen.getByLabelText(/Dirección/), 'Rivadavia 1200');
    expect(screen.getByText(/se actualizarán al confirmar el pedido/)).toBeInTheDocument();
  });

  it('no pisa un nombre que el empleado ya escribió', async () => {
    clients.lookupClientByPhone.mockResolvedValue({ id: 1, phone: '1144445555', full_name: 'Paula Gómez', address: null });
    const user = await renderView();

    await user.type(screen.getByLabelText('Nombre *'), 'Pau');
    await user.type(screen.getByLabelText('Teléfono *'), '1144445555');

    await screen.findByText(/Cliente registrado/);
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Pau');
  });

  it('un teléfono nuevo se informa como cliente nuevo', async () => {
    const user = await renderView();

    await user.type(screen.getByLabelText('Teléfono *'), '1199990000');

    expect(await screen.findByText('Cliente nuevo: se registrará al confirmar.')).toBeInTheDocument();
  });

  it('si la búsqueda falla se puede seguir cargando a mano', async () => {
    clients.lookupClientByPhone.mockRejectedValue({ message: 'timeout' });
    const user = await renderView();

    await user.type(screen.getByLabelText('Teléfono *'), '1144445555');

    expect(await screen.findByText(/No se pudo buscar el cliente/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre *')).toBeEnabled();
  });

  it('muestra el error del servidor y conserva el pedido', async () => {
    orders.createCounterOrder.mockRejectedValue({ message: 'Estos productos no están disponibles en este momento: Fugazzeta.' });
    const user = await renderView();

    await user.type(screen.getByLabelText('Teléfono *'), '1144445555');
    await user.type(screen.getByLabelText('Nombre *'), 'Paula');
    await user.click(product(/Fugazzeta/));
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Fugazzeta');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeEnabled());
    expect(within(summary()).getByText('Fugazzeta')).toBeInTheDocument();
  });

  it('si el menú no carga permite reintentar', async () => {
    menu.fetchMenuProducts.mockRejectedValueOnce({ message: 'No se pudo conectar con el servidor.' });
    render(<TomarPedidoView />);
    const user = userEvent.setup();

    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('button', { name: /Pizza Muzzarella/ })).toBeInTheDocument();
  });
});
