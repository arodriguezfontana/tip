import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistorialView } from '@/components/HistorialView';
import { ImpresorasView } from '@/components/ImpresorasView';
import { OrderDetailModal } from '@/components/OrderDetailModal';
import * as orderService from '@/services/orderService';
import * as printerService from '@/services/printerService';
import { makeOrder, makeOrderDetail } from '@/test/utils';
import { printErrorMessage } from '@/utils/printing';

vi.mock('@/services/orderService');
vi.mock('@/services/printerService');

const orders = vi.mocked(orderService);
const printers = vi.mocked(printerService);

beforeEach(() => {
  vi.resetAllMocks();
  orders.fetchOrders.mockResolvedValue([makeOrder({ id: 7, status: 'Confirmado' })]);
  orders.fetchOrderDetail.mockResolvedValue(makeOrderDetail({ id: 7, items: [] }));
});

describe('mensaje de error de impresión', () => {
  it('indica que el pedido se guardó pero la comanda no salió', () => {
    expect(printErrorMessage(12)).toBe('El pedido #12 se guardó, pero hubo un error al imprimir la comanda');
  });
});

describe('reimpresión desde el historial', () => {
  it('imprime la comanda del pedido sin abrir el detalle', async () => {
    orders.reprintOrder.mockResolvedValue({ success: true, errors: [] });
    const user = userEvent.setup();
    render(<HistorialView />);

    await user.click(await screen.findByRole('button', { name: 'Imprimir comanda del pedido #7' }));

    expect(orders.reprintOrder).toHaveBeenCalledWith(7);
    expect(await screen.findByText(/Comanda del pedido #7 enviada a imprimir/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('avisa si la impresora falló', async () => {
    orders.reprintOrder.mockResolvedValue({ success: false, message: 'Sin papel', errors: ['Sin papel'] });
    const user = userEvent.setup();
    render(<HistorialView />);

    await user.click(await screen.findByRole('button', { name: 'Imprimir comanda del pedido #7' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo imprimir la comanda del pedido #7');
  });
});

describe('reimpresión desde el detalle', () => {
  it('ofrece reimprimir la comanda', async () => {
    orders.reprintOrder.mockResolvedValue({ success: true, errors: [] });
    const user = userEvent.setup();
    render(<OrderDetailModal order={makeOrder({ id: 7 })} onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Reimprimir comanda' }));

    expect(orders.reprintOrder).toHaveBeenCalledWith(7);
  });
});

describe('configuración de impresoras', () => {
  it('guarda la impresora de un sector', async () => {
    printers.fetchPrinters.mockResolvedValue([]);
    printers.savePrinters.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ImpresorasView />);

    await user.click(await screen.findByLabelText('Imprimir comandas de Cocina'));
    await user.type(screen.getByLabelText('Dirección (IP)', { selector: '#printer-host-cocina' }), '192.168.1.50');
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(printers.savePrinters).toHaveBeenCalledWith([
      { sector: 'cocina', name: 'Impresora Cocina', host: '192.168.1.50', port: 9100 },
    ]);
  });
});
