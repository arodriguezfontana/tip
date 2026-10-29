import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComandaCard } from '@/components/ComandaCard';
import type { DeliveryDriver } from '@/types/deliveryDriver';
import type { AdminOrder, SectorFilter } from '@/types/order';
import { makeOrder } from '@/test/utils';

function renderCard(
  overrides: Partial<AdminOrder> = {},
  extraProps: {
    activeDrivers?: DeliveryDriver[];
    onAssignDriver?: (orderId: number, driverId: number | null) => Promise<void>;
    onMarkPaid?: (orderId: number, isPaid: boolean) => Promise<void>;
    onAcknowledgeUpdate?: (orderId: number) => Promise<void>;
    selectedSector?: SectorFilter;
    onItemPreparedChange?: (orderId: number, itemId: number, isPrepared: boolean) => Promise<void>;
    onSectorPrepared?: (orderId: number, sector: string, isPrepared: boolean) => Promise<void>;
  } = {}
) {
  const onStatusChange = vi.fn().mockResolvedValue(undefined);
  const onAssignDriver = extraProps.onAssignDriver ?? vi.fn().mockResolvedValue(undefined);
  const onItemPreparedChange = extraProps.onItemPreparedChange ?? vi.fn().mockResolvedValue(undefined);
  const onSectorPrepared = extraProps.onSectorPrepared ?? vi.fn().mockResolvedValue(undefined);
  const onOpenDetail = vi.fn();
  const order = makeOrder(overrides);
  render(
    <ComandaCard
      order={order}
      onStatusChange={onStatusChange}
      onAssignDriver={onAssignDriver}
      onMarkPaid={extraProps.onMarkPaid}
      onAcknowledgeUpdate={extraProps.onAcknowledgeUpdate}
      activeDrivers={extraProps.activeDrivers}
      onOpenDetail={onOpenDetail}
      selectedSector={extraProps.selectedSector}
      onItemPreparedChange={onItemPreparedChange}
      onSectorPrepared={onSectorPrepared}
    />
  );
  return {
    order,
    onStatusChange,
    onAssignDriver,
    onItemPreparedChange,
    onSectorPrepared,
    onOpenDetail,
    user: userEvent.setup(),
  };
}

const minutes = (n: number) => new Date(Date.now() - n * 60000).toISOString();

describe('ComandaCard', () => {
  it('muestra los datos del pedido', () => {
    renderCard({ notes: 'Sin cebolla', source: 'bot', delivery_method: 'retiro', total_amount: 19500 });

    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Bot')).toBeInTheDocument();
    expect(screen.getByText('Paula Gómez')).toBeInTheDocument();
    expect(screen.getByText('Retiro en local')).toBeInTheDocument();
    expect(screen.getByText('Tel: 11 4444-5555')).toBeInTheDocument();
    expect(screen.getByText('“Sin cebolla”')).toBeInTheDocument();
    expect(screen.getByText(/19\.500,00/)).toBeInTheDocument();
  });

  it('en un pedido a domicilio muestra la dirección en lugar de "A domicilio"', () => {
    renderCard({ delivery_method: 'domicilio', shipping_address: 'Belgrano 95, piso 2' });

    expect(screen.getByText('Belgrano 95, piso 2')).toBeInTheDocument();
    expect(screen.queryByText('A domicilio')).not.toBeInTheDocument();
  });

  it('si el pedido a domicilio no tiene dirección cargada vuelve a decir "A domicilio"', () => {
    renderCard({ delivery_method: 'domicilio', shipping_address: '  ' });

    expect(screen.getByText('A domicilio')).toBeInTheDocument();
  });

  it('muestra la insignia de Abonado cuando el pedido ya está pagado', () => {
    renderCard({ is_paid: true });
    expect(screen.getByText('Abonado')).toBeInTheDocument();
  });

  it('sin teléfono ni observaciones muestra marcadores', () => {
    renderCard({ customer_phone: null, notes: null, source: 'mostrador' });

    expect(screen.getByText('Tel: —')).toBeInTheDocument();
    expect(screen.getByText('Sin observaciones')).toBeInTheDocument();
    expect(screen.getByText('Mostrador')).toBeInTheDocument();
  });

  it('confirmar sin demora manual deja que el backend la calcule', async () => {
    const { onStatusChange, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', undefined);
  });

  it('confirmar con demora manual la envía', async () => {
    const { onStatusChange, user } = renderCard();

    await user.type(screen.getByPlaceholderText(/Automática/), '35');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', 35);
  });

  it.each(['0', '2.5'])('no deja confirmar con una demora inválida (%s)', async (value) => {
    const { user } = renderCard();

    await user.type(screen.getByPlaceholderText(/Automática/), value);

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
  });

  it('rechazar un pendiente', async () => {
    const { onStatusChange, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Rechazado', undefined);
  });

  it('no ofrece cancelar en la tarjeta: eso se hace desde el detalle', () => {
    renderCard({ status: 'Confirmado' });

    expect(screen.queryByRole('button', { name: /Cancelar/ })).not.toBeInTheDocument();
  });

  it('un programado muestra su horario y se confirma sin demora', async () => {
    const { onStatusChange, user } = renderCard({ scheduled_for: '2026-10-04T00:30:00Z' }); // 21:30 en Argentina

    expect(screen.getByText('21:30')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Automática/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onStatusChange).toHaveBeenCalledWith(101, 'Confirmado', undefined);
  });

  it.each([
    ['domicilio', 'Marcar En Camino', 'En Camino'],
    ['retiro', 'Marcar Listo para Retirar', 'Listo para Retirar'],
  ] as const)('un confirmado para %s avanza a "%s"', async (delivery_method, label, next) => {
    const { onStatusChange, user } = renderCard({ status: 'Confirmado', delivery_method, estimated_minutes: 30 });

    expect(screen.getByText('Estimado: 30 min')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: label }));

    expect(onStatusChange).toHaveBeenCalledWith(101, next, undefined);
  });

  it.each(['En Camino', 'Listo para Retirar'] as const)('un pedido %s se finaliza', async (status) => {
    const { onStatusChange, user } = renderCard({ status });

    await user.click(screen.getByRole('button', { name: 'Finalizar' }));

    expect(onStatusChange).toHaveBeenCalledWith(101, 'Finalizado', undefined);
  });

  it('deshabilita las acciones mientras se actualiza el estado', async () => {
    let resolve!: () => void;
    const { onStatusChange, user } = renderCard();
    onStatusChange.mockReturnValue(new Promise<void>((r) => (resolve = r)));

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
    resolve();
    expect(await screen.findByRole('button', { name: 'Rechazar' })).toBeEnabled();
  });

  it('abre el detalle al tocar la tarjeta pero no al usar sus botones', async () => {
    const { order, onOpenDetail, user } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    expect(onOpenDetail).not.toHaveBeenCalled();

    await user.click(screen.getByText('Paula Gómez'));
    expect(onOpenDetail).toHaveBeenCalledWith(order);

    await user.click(screen.getByRole('button', { name: 'Ver detalle del pedido #101' }));
    expect(onOpenDetail).toHaveBeenCalledTimes(2);
  });

  it('marca en rojo los pendientes sin atender hace más de 2 minutos', () => {
    renderCard({ created_at: minutes(5) });

    expect(screen.getByText('5min')).toHaveClass('bg-red-100', 'animate-pulse');
  });

  it('marca como atrasado un confirmado que superó su demora', () => {
    renderCard({ status: 'Confirmado', estimated_minutes: 20, created_at: minutes(25) });

    expect(screen.getByText('25min')).toHaveClass('bg-red-100');
    expect(screen.getByText('25min')).not.toHaveClass('animate-pulse');
  });

  it('muestra de forma visible el nombre del repartidor responsable si está asignado', () => {
    renderCard({ delivery_driver_name: 'Gonzalo Repartos' });

    expect(screen.getByText('Gonzalo Repartos')).toBeInTheDocument();
    expect(screen.getByText(/Repartidor:/)).toBeInTheDocument();
  });

  it('el cartel del repartidor va debajo de las observaciones y arriba de la demora estimada', () => {
    renderCard({ delivery_driver_name: 'Gonzalo Repartos', notes: 'Sin cebolla', estimated_minutes: 25, status: 'En Camino' });

    const notes = screen.getByText('“Sin cebolla”');
    const driver = screen.getByText(/Repartidor:/);
    const estimated = screen.getByText('Estimado: 25 min');
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(notes, driver)).toBe(true);
    expect(before(driver, estimated)).toBe(true);
  });

  it('cuando pasa a En Camino para domicilio muestra opción para asignar repartidor activo', async () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
      { id: 2, name: 'Juan Moto', phone: '11 3333-4444', is_active: true, created_at: '', updated_at: '' },
    ];
    const { onAssignDriver, user } = renderCard(
      { status: 'En Camino', delivery_method: 'domicilio' },
      { activeDrivers: drivers }
    );

    const select = screen.getByRole('combobox', { name: 'Asignar repartidor' });
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Marcos Envíos (11 1111-2222)')).toBeInTheDocument();

    await user.selectOptions(select, '1');

    expect(onAssignDriver).toHaveBeenCalledWith(101, 1);
  });

  it('sin repartidor muestra el cartel "Asignar repartidor" y ya no hay una sección aparte debajo', () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
    ];
    renderCard(
      { status: 'En Camino', delivery_method: 'domicilio', delivery_driver_id: null, delivery_driver_name: null, notes: 'Sin cebolla', estimated_minutes: 25 },
      { activeDrivers: drivers }
    );

    const label = screen.getByText('Asignar repartidor');
    expect(label.parentElement).toHaveTextContent('🛵');
    // Va en el mismo lugar que el cartel del repartidor: debajo de las observaciones y arriba de la demora.
    const before = (x: Element, y: Element) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(screen.getByText('“Sin cebolla”'), label)).toBe(true);
    expect(before(label, screen.getByText('Estimado: 25 min'))).toBe(true);
    // La sección vieja de abajo ya no existe.
    expect(screen.queryByText(/Reasignar repartidor/)).not.toBeInTheDocument();
    expect(screen.queryByText('Asignar repartidor:')).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('con repartidor asignado el mismo cartel muestra su nombre y permite cambiarlo o quitarlo', async () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
      { id: 2, name: 'Juan Moto', phone: '11 3333-4444', is_active: true, created_at: '', updated_at: '' },
    ];
    const { onAssignDriver, user } = renderCard(
      { status: 'En Camino', delivery_method: 'domicilio', delivery_driver_id: 1, delivery_driver_name: 'Marcos Envíos' },
      { activeDrivers: drivers }
    );

    expect(screen.getByText('Repartidor:')).toBeInTheDocument();
    expect(screen.getByText('Marcos Envíos', { selector: 'span' })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Cambiar repartidor' });
    expect(select).toHaveValue('1');

    await user.selectOptions(select, '2');
    expect(onAssignDriver).toHaveBeenCalledWith(101, 2);

    await user.selectOptions(select, 'Quitar asignación');
    expect(onAssignDriver).toHaveBeenLastCalledWith(101, null);
  });

  it('abrir el selector del repartidor no abre el detalle del pedido', async () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
    ];
    const { onOpenDetail, user } = renderCard({ status: 'En Camino', delivery_method: 'domicilio' }, { activeDrivers: drivers });

    await user.click(screen.getByText('Asignar repartidor'));
    await user.click(screen.getByRole('combobox', { name: 'Asignar repartidor' }));

    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('un pedido en En Camino con retiro en local no muestra opción para asignar repartidor', () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
    ];
    renderCard(
      { status: 'En Camino', delivery_method: 'retiro' },
      { activeDrivers: drivers }
    );

    expect(screen.queryByRole('combobox', { name: 'Asignar repartidor' })).not.toBeInTheDocument();
  });

  it('un pedido en Confirmado o Pendiente no muestra opción para asignar repartidor', () => {
    const drivers: DeliveryDriver[] = [
      { id: 1, name: 'Marcos Envíos', phone: '11 1111-2222', is_active: true, created_at: '', updated_at: '' },
    ];
    renderCard(
      { status: 'Confirmado', delivery_method: 'domicilio' },
      { activeDrivers: drivers }
    );

    expect(screen.queryByRole('combobox', { name: 'Asignar repartidor' })).not.toBeInTheDocument();
  });

  it.each([
    ['efectivo', 'Efectivo'],
    ['mercadopago', 'MercadoPago'],
  ] as const)('muestra el medio de pago %s en la comanda', (payment_method, label) => {
    renderCard({ payment_method });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('si no hay medio de pago definido lo indica', () => {
    renderCard({ payment_method: null });

    expect(screen.getByText('Medio de pago sin definir')).toBeInTheDocument();
  });

  it.each(['Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar'] as const)(
    'una comanda %s muestra si está abonada o pendiente de pago',
    (status) => {
      const { unmount } = render(
        <ComandaCard order={makeOrder({ status, payment_method: 'efectivo', is_paid: true })} onStatusChange={vi.fn()} />
      );
      expect(screen.getByText('Abonado')).toBeInTheDocument();
      expect(screen.queryByText('Pago Pendiente')).not.toBeInTheDocument();
      unmount();

      render(<ComandaCard order={makeOrder({ status, payment_method: 'efectivo', is_paid: false })} onStatusChange={vi.fn()} />);
      expect(screen.getByText('Pago Pendiente')).toBeInTheDocument();
      expect(screen.queryByText('Abonado')).not.toBeInTheDocument();
    }
  );

  it.each(['efectivo', 'mercadopago'] as const)(
    'al tocar "Pago Pendiente" de un pedido en %s se marca como abonado',
    async (payment_method) => {
      const onMarkPaid = vi.fn().mockResolvedValue(undefined);
      const { onOpenDetail, user } = renderCard({ id: 42, payment_method, is_paid: false }, { onMarkPaid });

      await user.click(screen.getByRole('button', { name: 'Pago pendiente: marcar como abonado' }));

      expect(onMarkPaid).toHaveBeenCalledWith(42, true);
      expect(onOpenDetail).not.toHaveBeenCalled();
    }
  );

  it('un pedido ya abonado no ofrece marcarlo de nuevo', () => {
    renderCard({ payment_method: 'mercadopago', is_paid: true }, { onMarkPaid: vi.fn() });

    expect(screen.queryByRole('button', { name: /marcar como abonado/i })).not.toBeInTheDocument();
  });

  it('sin acción para marcar el pago, el estado pendiente se muestra pero no se puede tocar', () => {
    renderCard({ payment_method: 'efectivo', is_paid: false });

    expect(screen.getByText('Pago Pendiente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como abonado/i })).not.toBeInTheDocument();
  });
  describe('Separación de comandas por sector', () => {
    const mockItems = [
      { id: 1, product_id: 10, product_name: 'Pizza Napolitana', quantity: 2, unit_price: 9000, subtotal: 18000, sector: 'pizzeria' },
      { id: 2, product_id: 20, product_name: 'Milanesa con Papas', quantity: 1, unit_price: 11000, subtotal: 11000, sector: 'cocina' },
      { id: 3, product_id: 30, product_name: 'Cerveza IPA', quantity: 2, unit_price: 3500, subtotal: 7000, sector: 'barra' },
    ];

    it('las tarjetas chicas no muestran elementos del pedido ni sectores para mantener legibilidad', () => {
      renderCard({ items: mockItems });

      // No se muestran nombres de productos
      expect(screen.queryByText('Pizza Napolitana')).not.toBeInTheDocument();
      expect(screen.queryByText('Milanesa con Papas')).not.toBeInTheDocument();
      expect(screen.queryByText('Cerveza IPA')).not.toBeInTheDocument();

      // No se muestran sectores dentro de la tarjeta
      expect(screen.queryByText('Pizzería')).not.toBeInTheDocument();
      expect(screen.queryByText('Cocina')).not.toBeInTheDocument();
      expect(screen.queryByText('Barra')).not.toBeInTheDocument();
      expect(screen.queryByText('Otros sectores:')).not.toBeInTheDocument();

      // Muestra datos esenciales de la comanda
      expect(screen.getByText('#101')).toBeInTheDocument();
      expect(screen.getByText('Paula Gómez')).toBeInTheDocument();
    });
  });

  describe('pedido modificado por el cliente', () => {
    it('muestra el pago mixto: lo pagado por MercadoPago y lo que falta cobrar en efectivo', () => {
      renderCard({
        total_amount: 15000,
        payment_method: 'mercadopago',
        is_paid: false,
        paid_amount: 12000,
        pending_amount: 3000,
        balance_payment_method: 'efectivo',
      });

      expect(screen.getByText(/Pagado MercadoPago/)).toHaveTextContent(/12.000,00/);
      expect(screen.getByText(/Cobrar Efectivo/)).toHaveTextContent(/3.000,00/);
      expect(screen.queryByText('Pago Pendiente')).not.toBeInTheDocument();
    });

    it('sin pago parcial sigue mostrando el estado de siempre', () => {
      renderCard({ payment_method: 'efectivo', is_paid: false });

      expect(screen.getByText('Pago Pendiente')).toBeInTheDocument();
      expect(screen.queryByText(/Cobrar/)).not.toBeInTheDocument();
    });

    it('alerta a cocina cuando se agregaron productos y se apaga al marcarla como vista', async () => {
      const onAcknowledgeUpdate = vi.fn().mockResolvedValue(undefined);
      const { user, order, onOpenDetail } = renderCard({ kitchen_update_pending: true }, { onAcknowledgeUpdate });

      expect(screen.getByRole('alert')).toHaveTextContent('Pedido actualizado');
      await user.click(screen.getByRole('button', { name: 'Visto' }));

      expect(onAcknowledgeUpdate).toHaveBeenCalledWith(order.id);
      // El clic en "Visto" no abre el detalle del pedido.
      expect(onOpenDetail).not.toHaveBeenCalled();
    });

    it('sin cambios no hay alerta', () => {
      renderCard({ kitchen_update_pending: false });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
