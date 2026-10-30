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

  it('permite cambiar el color principal seleccionando un estilo predefinido y no incluye rojo', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    // El color rojo ya no debe figurar como tema preseleccionado
    expect(screen.queryByRole('button', { name: 'Rojo' })).not.toBeInTheDocument();

    const blueButton = screen.getByRole('button', { name: 'Azul' });
    await user.click(blueButton);

    expect(blueButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Negro' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_color: 'blue',
        })
      );
    });

    expect(await screen.findByText(/¡Configuración guardada exitosamente!/i)).toBeInTheDocument();
  });

  it('permite elegir un color personalizado usando el botón arcoíris y la paleta de colores', async () => {
    const user = userEvent.setup();
    render(<ConfiguracionWebView />);

    expect(await screen.findByDisplayValue('Pizzería Los Troncos')).toBeInTheDocument();

    const rainbowButton = screen.getByRole('button', { name: 'Color personalizado' });
    expect(rainbowButton).toBeInTheDocument();
    expect(rainbowButton).toHaveAttribute('aria-pressed', 'false');

    const colorPicker = screen.getByLabelText(/Elegir color personalizado/i);
    fireEvent.change(colorPicker, { target: { value: '#a855f7' } });

    expect(rainbowButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Negro' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_color: '#a855f7',
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

  it('no muestra el campo para agregar el alias de MercadoPago', async () => {
    render(<ConfiguracionWebView />);

    await screen.findByDisplayValue('Pizzería Los Troncos');
    expect(screen.queryByLabelText(/Alias de MercadoPago/i)).not.toBeInTheDocument();
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

  describe('fondo del panel de administración', () => {
    it('arranca liso y se puede elegir una de las imágenes incluidas', async () => {
      const user = userEvent.setup();
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');
      expect(screen.getByRole('button', { name: 'Panel: fondo liso' })).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: 'Panel: Cocina' }));

      expect(screen.getByRole('button', { name: 'Panel: Cocina' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Panel: fondo liso' })).toHaveAttribute('aria-pressed', 'false');
      // El fondo del inicio de sesión no cambia.
      expect(screen.getByRole('button', { name: 'Salón' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() =>
        expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
          expect.objectContaining({ panel_bg: 'kitchen', login_bg: 'bistro' })
        )
      );
    });

    it('permite elegir un color liso personalizado para el panel', async () => {
      const user = userEvent.setup();
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');

      fireEvent.change(screen.getByLabelText('Elegir color de fondo del panel'), { target: { value: '#1e3a8a' } });

      expect(screen.getByRole('button', { name: 'Panel: color liso' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() =>
        expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
          expect.objectContaining({ panel_bg: 'color', panel_bg_color: '#1e3a8a' })
        )
      );
    });

    it('al abrir con un color guardado lo muestra elegido', async () => {
      vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({ ...initialConfig, panel_bg: 'color', panel_bg_color: '#334155' });
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');

      expect(screen.getByRole('button', { name: 'Panel: color liso' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Elegir color de fondo del panel')).toHaveValue('#334155');
    });

    it('permite subir una imagen propia para el panel', async () => {
      const user = userEvent.setup();
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');

      const file = new File(['fake-image-bytes'], 'fondo.jpg', { type: 'image/jpeg' });
      fireEvent.change(screen.getByLabelText('Subir imagen de fondo del panel'), { target: { files: [file] } });

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Panel: imagen propia' })).toHaveAttribute('aria-pressed', 'true')
      );
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() =>
        expect(storeConfigService.updateStoreConfig).toHaveBeenCalledWith(
          expect.objectContaining({ panel_bg: 'custom', panel_bg_image: 'data:image/jpeg;base64,fondo-propio' })
        )
      );
    });

    it('rechaza un archivo que no es una imagen', async () => {
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');

      const file = new File(['texto'], 'notas.txt', { type: 'text/plain' });
      fireEvent.change(screen.getByLabelText('Subir imagen de fondo del panel'), { target: { files: [file] } });

      expect(await screen.findByRole('alert')).toHaveTextContent('archivo de imagen válido');
      expect(screen.getByRole('button', { name: 'Panel: fondo liso' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('quitar la imagen propia vuelve al fondo liso', async () => {
      vi.mocked(storeConfigService.fetchStoreConfig).mockResolvedValue({
        ...initialConfig,
        panel_bg: 'custom',
        panel_bg_image: 'data:image/jpeg;base64,guardada',
      });
      const user = userEvent.setup();
      render(<ConfiguracionWebView />);
      await screen.findByDisplayValue('Pizzería Los Troncos');
      expect(screen.getByRole('button', { name: 'Panel: imagen propia' })).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: 'Quitar imagen propia del panel' }));

      expect(screen.getByRole('button', { name: 'Panel: fondo liso' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
