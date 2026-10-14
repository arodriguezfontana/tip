import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HorariosView } from '@/components/HorariosView';
import * as businessHoursService from '@/services/businessHoursService';
import type { BusinessHoursStatus } from '@/types/businessHours';

vi.mock('@/services/businessHoursService');

const service = vi.mocked(businessHoursService);

const CONFIGURED: BusinessHoursStatus = {
  configured: true,
  is_open: false,
  closes_at: null,
  next_opening: '2026-09-29T12:00:00-03:00',
  next_opening_label: 'mañana a las 12:00',
  ranges: [
    { day_of_week: 1, opens_at: '20:00', closes_at: '00:00' },
    { day_of_week: 1, opens_at: '12:00', closes_at: '15:00' },
  ],
};

const NOT_CONFIGURED: BusinessHoursStatus = {
  configured: false,
  is_open: true,
  closes_at: null,
  next_opening: null,
  next_opening_label: null,
  ranges: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchBusinessHours.mockResolvedValue(CONFIGURED);
  service.updateBusinessHours.mockImplementation(async (ranges) => ({ ...CONFIGURED, ranges }));
});

function day(name: string) {
  return screen.getByRole('region', { name });
}

describe('HorariosView', () => {
  it('muestra los horarios cargados por día y el estado del local', async () => {
    render(<HorariosView />);

    await screen.findByRole('region', { name: 'Martes' });
    expect(screen.getByText('El local está cerrado: abre mañana a las 12:00.')).toBeInTheDocument();
    expect(within(day('Lunes')).getByText('Cerrado')).toBeInTheDocument();
    expect(screen.getByLabelText('Martes: apertura de la franja 1')).toHaveValue('12:00');
    expect(screen.getByLabelText('Martes: cierre de la franja 2')).toHaveValue('00:00');
  });

  it('sin horarios avisa que se aceptan pedidos a toda hora', async () => {
    service.fetchBusinessHours.mockResolvedValue(NOT_CONFIGURED);
    render(<HorariosView />);

    expect(await screen.findByText(/se aceptan pedidos a cualquier hora/)).toBeInTheDocument();
  });

  it('agrega, edita y quita franjas y guarda la semana completa', async () => {
    render(<HorariosView />);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Martes' });

    await user.click(screen.getByRole('button', { name: 'Agregar franja al viernes' }));
    fireEvent.change(screen.getByLabelText('Viernes: apertura de la franja 1'), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText('Viernes: cierre de la franja 1'), { target: { value: '02:00' } });
    await user.click(screen.getByRole('button', { name: 'Quitar la franja 2 del martes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar horarios' }));

    await waitFor(() =>
      expect(service.updateBusinessHours).toHaveBeenCalledWith([
        { day_of_week: 1, opens_at: '12:00', closes_at: '15:00' },
        { day_of_week: 4, opens_at: '20:00', closes_at: '02:00' },
      ])
    );
    expect(await screen.findByText('Los horarios de atención se guardaron correctamente.')).toBeInTheDocument();
  });

  it('copia los horarios de un día a toda la semana', async () => {
    render(<HorariosView />);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Martes' });

    await user.click(screen.getByRole('button', { name: 'Copiar los horarios del martes a todos los días' }));
    await user.click(screen.getByRole('button', { name: 'Guardar horarios' }));

    await waitFor(() => expect(service.updateBusinessHours).toHaveBeenCalled());
    const saved = service.updateBusinessHours.mock.calls[0][0];
    expect(saved).toHaveLength(14);
    expect(saved.filter((range) => range.day_of_week === 0)).toEqual([
      { day_of_week: 0, opens_at: '12:00', closes_at: '15:00' },
      { day_of_week: 0, opens_at: '20:00', closes_at: '00:00' },
    ]);
  });

  it('valida antes de guardar', async () => {
    render(<HorariosView />);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Martes' });

    fireEvent.change(screen.getByLabelText('Martes: cierre de la franja 1'), { target: { value: '12:00' } });
    await user.click(screen.getByRole('button', { name: 'Guardar horarios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no pueden ser iguales');

    await user.click(screen.getByRole('button', { name: 'Quitar la franja 2 del martes' }));
    await user.click(screen.getByRole('button', { name: 'Quitar la franja 1 del martes' }));
    await user.click(screen.getByRole('button', { name: 'Guardar horarios' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Cargá al menos una franja horaria');

    expect(service.updateBusinessHours).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor al guardar', async () => {
    service.updateBusinessHours.mockRejectedValue({ statusCode: 400, message: 'La franja del martes se superpone.' });
    render(<HorariosView />);
    const user = userEvent.setup();
    await screen.findByRole('region', { name: 'Martes' });

    await user.click(screen.getByRole('button', { name: 'Guardar horarios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La franja del martes se superpone.');
  });
});
