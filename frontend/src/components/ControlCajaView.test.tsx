import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlCajaView } from '@/components/ControlCajaView';
import * as cashShiftService from '@/services/cashShiftService';
import type { CashShift, CashShiftDetail } from '@/types/cashShift';

vi.mock('@/services/cashShiftService');
const service = vi.mocked(cashShiftService);

const MOCK_OPEN_SHIFT: CashShiftDetail = {
  id: 1,
  opened_at: '2026-10-30T10:00:00Z',
  closed_at: null,
  status: 'abierta',
  initial_amount: 10000,
  final_amount: null,
  expected_amount: 13500,
  difference: null,
  difference_type: null,
  notes: 'Fondo inicial',
  opened_by_name: 'empleado@local.com',
  summary: {
    initial_amount: 10000,
    cash_sales: 5000,
    mercadopago_sales: 3000,
    transferencia_sales: 2000,
    tarjeta_sales: 0,
    other_digital_sales: 0,
    total_digital_sales: 5000,
    total_sales: 10000,
    manual_income: 500,
    manual_expense: 2000,
    expected_cash: 13500,
    final_amount: null,
    difference: null,
    difference_type: null,
    orders_count: 3,
    movements_count: 2,
  },
  movements: [
    {
      id: 101,
      cash_shift_id: 1,
      type: 'ingreso',
      amount: 500,
      category: 'Aporte de cambio',
      description: 'Billetes chicos',
      created_at: '2026-10-30T10:15:00Z',
    },
    {
      id: 102,
      cash_shift_id: 1,
      type: 'egreso',
      amount: 2000,
      category: 'Pago a proveedor',
      description: 'Hielo',
      created_at: '2026-10-30T10:30:00Z',
    },
  ],
};

const MOCK_CLOSED_SHIFT: CashShift = {
  id: 1,
  opened_at: '2026-10-29T10:00:00Z',
  closed_at: '2026-10-29T23:00:00Z',
  status: 'cerrada',
  initial_amount: 5000,
  final_amount: 15200,
  expected_amount: 15000,
  difference: 200,
  difference_type: 'sobrante',
  notes: 'Cierre con sobrante',
};

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchCashShiftsHistory.mockResolvedValue({ items: [MOCK_CLOSED_SHIFT], total: 1 });
});

describe('ControlCajaView', () => {
  it('muestra estado de caja cerrada y permite abrir turno', async () => {
    service.fetchCurrentCashShift.mockResolvedValue({ is_open: false, shift: null });
    service.openCashShift.mockResolvedValue({
      id: 2,
      opened_at: '2026-10-30T12:00:00Z',
      status: 'abierta',
      initial_amount: 8000,
    });

    const user = userEvent.setup();
    render(<ControlCajaView />);

    expect(await screen.findByText('La caja no está abierta actualmente')).toBeInTheDocument();
    expect(screen.getByText('Apertura de turno de caja')).toBeInTheDocument();

    const input = screen.getByLabelText(/Fondo de caja inicial/i);
    await user.clear(input);
    await user.type(input, '8000');

    const submitBtn = screen.getByRole('button', { name: /Abrir caja e iniciar turno/i });
    await user.click(submitBtn);

    expect(service.openCashShift).toHaveBeenCalledWith({
      initial_amount: 8000,
      notes: undefined,
    });
  });

  it('muestra métricas y totales cuando la caja está abierta', async () => {
    service.fetchCurrentCashShift.mockResolvedValue({ is_open: true, shift: MOCK_OPEN_SHIFT });

    render(<ControlCajaView />);

    expect(await screen.findByText('Caja abierta')).toBeInTheDocument();
    // Caja teórica esperada 13500
    expect(screen.getByText('Caja teórica esperada')).toBeInTheDocument();
    expect(screen.getByText('Fondo inicial')).toBeInTheDocument();
    expect(screen.getByText('Ventas en efectivo')).toBeInTheDocument();
    // Total digital y total facturado
    expect(screen.getByText('Total digital')).toBeInTheDocument();
    expect(screen.getByText('Total facturado')).toBeInTheDocument();
    // Movimientos listados
    expect(screen.getAllByText('Aporte de cambio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pago a proveedor').length).toBeGreaterThan(0);
  });

  it('permite registrar un movimiento manual de ingreso', async () => {
    service.fetchCurrentCashShift.mockResolvedValue({ is_open: true, shift: MOCK_OPEN_SHIFT });
    service.addCashMovement.mockResolvedValue({
      id: 103,
      cash_shift_id: 1,
      type: 'ingreso',
      amount: 1500,
      category: 'Aporte de cambio',
      description: 'Más cambio',
      created_at: '2026-10-30T11:00:00Z',
    });

    const user = userEvent.setup();
    render(<ControlCajaView />);

    await screen.findByText('Registrar movimiento manual');

    const ingresoBtn = screen.getByRole('radio', { name: /\+ Ingreso/i });
    await user.click(ingresoBtn);

    const amountInput = screen.getByLabelText(/Monto \(\$\) \*/i);
    await user.type(amountInput, '1500');

    const descInput = screen.getByLabelText(/Observaciones \/ Detalle/i);
    await user.type(descInput, 'Más cambio');

    const submitBtn = screen.getByRole('button', { name: /Asentar movimiento/i });
    await user.click(submitBtn);

    expect(service.addCashMovement).toHaveBeenCalledWith({
      type: 'ingreso',
      amount: 1500,
      category: 'Pago a proveedor', // valor por defecto del select
      description: 'Más cambio',
    });
  });

  it('calcula la diferencia en tiempo real en la pantalla de cierre y permite cerrar el turno', async () => {
    service.fetchCurrentCashShift.mockResolvedValue({ is_open: true, shift: MOCK_OPEN_SHIFT });
    service.closeCashShift.mockResolvedValue({
      id: 1,
      opened_at: '2026-10-30T10:00:00Z',
      closed_at: '2026-10-30T18:00:00Z',
      status: 'cerrada',
      initial_amount: 10000,
      final_amount: 14000,
      expected_amount: 13500,
      difference: 500,
      difference_type: 'sobrante',
    });

    const user = userEvent.setup();
    render(<ControlCajaView />);

    await screen.findByText('Caja abierta');

    // Cambiar a pestaña de cierre
    const cierreTab = screen.getByRole('button', { name: /Cierre de caja/i });
    await user.click(cierreTab);

    expect(screen.getByText('Arqueo y cierre de caja')).toBeInTheDocument();

    const realInput = screen.getByLabelText(/Monto real contado en efectivo/i);
    // Caja teórica es 13500. Si ponemos 14000, hay sobrante de 500
    await user.type(realInput, '14000');

    expect(await screen.findByText(/Sobrante detectado:/i)).toBeInTheDocument();

    // Confirmar cierre
    const cerrarBtn = screen.getByRole('button', { name: /^Cerrar turno de caja$/i });
    await user.click(cerrarBtn);

    // Modal de confirmación
    expect(screen.getByText('¿Confirmás el cierre de la caja?')).toBeInTheDocument();
    const modalConfirmBtn = screen.getByRole('button', { name: /Sí, cerrar turno/i });
    await user.click(modalConfirmBtn);

    expect(service.closeCashShift).toHaveBeenCalledWith({
      final_amount: 14000,
      notes: undefined,
    });
  });

  it('permite ver el detalle de un turno en el historial', async () => {
    service.fetchCurrentCashShift.mockResolvedValue({ is_open: false, shift: null });
    service.fetchCashShiftDetail.mockResolvedValue({
      ...MOCK_CLOSED_SHIFT,
      movements: [],
    });

    const user = userEvent.setup();
    render(<ControlCajaView />);

    expect(await screen.findByText('Historial de turnos anteriores')).toBeInTheDocument();

    const verDetalleBtn = screen.getByRole('button', { name: /Ver detalle/i });
    await user.click(verDetalleBtn);

    expect(service.fetchCashShiftDetail).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Detalle del turno #1')).toBeInTheDocument();

    // Cerrar modal
    const closeBtn = screen.getByRole('button', { name: 'Cerrar' });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Detalle del turno #1')).not.toBeInTheDocument();
    });
  });
});
