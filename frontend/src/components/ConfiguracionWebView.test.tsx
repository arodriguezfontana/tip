import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracionWebView } from '@/components/ConfiguracionWebView';
import * as storeConfigService from '@/services/storeConfigService';
import type { StoreConfig } from '@/types/storeConfig';
import { resizeImageToDataUrl } from '@/utils/images';

vi.mock('@/services/storeConfigService');
vi.mock('@/utils/images');

const initialConfig: StoreConfig = {
  id: 1,
  store_name: 'Pizzería Los Troncos',
  address: 'Av. San Martín 450',
  contact_phone: '11 4444-1234',
  logo_url: null,
  theme_color: 'black',
  login_bg: 'bistro',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue(initialConfig);
  vi.mocked(resizeImageToDataUrl).mockResolvedValue('data:image/jpeg;base64,fondo-propio');
  vi.mocked(storeConfigService.updateStoreConfig).mockImplementation(async (payload) => ({
    id: 1,
    ...payload,
    address: payload.address ?? null,
    contact_phone: payload.contact_phone ?? null,
    logo_url: payload.logo_url ?? null,
    login_bg: payload.login_bg ?? 'bistro',
  }));
});

describe('ConfiguracionWebView', () => {
  it('carga y muestra los datos actuales del local en los campos', async () => {
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Av. San Martín 450')).toBeInTheDocument();
    // Los horarios se configuran solo desde la sección Horarios.
    expect(screen.queryByLabelText('Horarios de atención')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('11 4444-1234')).toBeInTheDocument();
    expect(screen.getByText('Sin logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Negro' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('permite cambiar el color principal seleccionando entre los 5 estilos predefinidos', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const redButton = screen.getByRole('button', { name: 'Rojo' });
    await user.click(redButton);

    expect(redButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Negro' })).toHaveAttribute('aria-pressed', 'false');

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

  it('permite registrar y modificar el alias de MercadoPago', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    const aliasInput = await screen.findByLabelText(/Alias de MercadoPago/i);
    await user.clear(aliasInput);
    await user.type(aliasInput, 'donmario.mp');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mp_alias: 'donmario.mp',
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

  it('permite elegir la imagen de fondo para el inicio de sesión', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const bistroBtn = screen.getByRole('button', { name: 'Salón' });
    expect(bistroBtn).toHaveAttribute('aria-pressed', 'true');

    const kitchenBtn = screen.getByRole('button', { name: 'Cocina' });
    await user.click(kitchenBtn);

    expect(kitchenBtn).toHaveAttribute('aria-pressed', 'true');
    expect(bistroBtn).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          login_bg: 'kitchen',
        })
      );
    });
  });

  it('permite subir una imagen propia desde el dispositivo como fondo de inicio de sesión', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);
    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const file = new File(['fake-image-bytes'], 'fondo.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Subir imagen de fondo'), { target: { files: [file] } });

    expect(await screen.findByAltText('Imagen propia')).toHaveAttribute('src', 'data:image/jpeg;base64,fondo-propio');
    expect(screen.getByRole('button', { name: 'Imagen propia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Salón' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({ login_bg: 'custom', login_bg_image: 'data:image/jpeg;base64,fondo-propio' })
      )
    );
  });

  it('al quitar la imagen propia vuelve al fondo por defecto', async () => {
    vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({
      ...initialConfig,
      login_bg: 'custom',
      login_bg_image: 'data:image/jpeg;base64,guardada',
    });
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByAltText('Imagen propia')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(screen.queryByAltText('Imagen propia')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salón' })).toHaveAttribute('aria-pressed', 'true');
  });
});
