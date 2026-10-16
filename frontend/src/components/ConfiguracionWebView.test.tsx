import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracionWebView } from '@/components/ConfiguracionWebView';
import * as storeConfigService from '@/services/storeConfigService';
import type { StoreConfig } from '@/types/storeConfig';

vi.mock('@/services/storeConfigService');

const initialConfig: StoreConfig = {
  id: 1,
  store_name: 'Pizzería Los Troncos',
  address: 'Av. San Martín 450',
  opening_hours: 'Mar a Dom 19:00 a 00:00',
  contact_phone: '11 4444-1234',
  logo_url: null,
  theme_color: 'black',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue(initialConfig);
  vi.mocked(storeConfigService.updateStoreConfig).mockImplementation(async (payload) => ({
    id: 1,
    ...payload,
    address: payload.address ?? null,
    opening_hours: payload.opening_hours ?? null,
    contact_phone: payload.contact_phone ?? null,
    logo_url: payload.logo_url ?? null,
  }));
});

describe('ConfiguracionWebView', () => {
  it('carga y muestra los datos actuales del local en los campos', async () => {
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Av. San Martín 450')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mar a Dom 19:00 a 00:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('11 4444-1234')).toBeInTheDocument();
    expect(screen.getByText('Sin logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Negro Clásico' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('permite cambiar el color principal seleccionando entre los 5 estilos predefinidos', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const redButton = screen.getByRole('button', { name: 'Rojo Gourmet' });
    await user.click(redButton);

    expect(redButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Negro Clásico' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_color: 'red',
        })
      );
    });

    expect(await screen.findByText(/¡Configuración guardada exitosamente!/i)).toBeInTheDocument();
  });

  it('permite editar los datos de contacto y guardarlos', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    const nameInput = await screen.findByLabelText(/Nombre del local \*/i);
    const phoneInput = screen.getByLabelText(/Teléfonos de contacto/i);

    await user.clear(nameInput);
    await user.type(nameInput, 'Pizzería Don Mario');
    await user.clear(phoneInput);
    await user.type(phoneInput, '11 9999-0000');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          store_name: 'Pizzería Don Mario',
          contact_phone: '11 9999-0000',
        })
      );
    });

    expect(await screen.findByText(/¡Configuración guardada exitosamente!/i)).toBeInTheDocument();
  });

  it('permite subir un archivo de imagen como logo y luego quitarlo', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const fileInput = screen.getByLabelText('Subir logo') as HTMLInputElement;
    const file = new File(['fake-image-bytes'], 'logo.png', { type: 'image/png' });

    // Mock FileReader
    const originalFileReader = window.FileReader;
    class MockFileReader {
      result = 'data:image/png;base64,mocked-logo-data';
      onload: (() => void) | null = null;
      readAsDataURL() {
        setTimeout(() => this.onload?.(), 10);
      }
    }
    // @ts-expect-error Mocking FileReader for test
    window.FileReader = MockFileReader;

    try {
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await screen.findByAltText('Logo del local')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Quitar logo' })).toBeInTheDocument();

      // Quitar logo
      await user.click(screen.getByRole('button', { name: 'Quitar logo' }));
      expect(screen.getByText('Sin logo')).toBeInTheDocument();
    } finally {
      window.FileReader = originalFileReader;
    }
  });

  it('no permite guardar si el nombre del local está vacío', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    const nameInput = await screen.findByLabelText(/Nombre del local \*/i);
    await user.clear(nameInput);
    await user.type(nameInput, '   ');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(storeConfigService.updateStoreConfig).not.toHaveBeenCalled();
    expect(await screen.findByText(/El nombre del local es obligatorio/i)).toBeInTheDocument();
  });
});
