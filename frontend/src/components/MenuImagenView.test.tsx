import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuImagenView } from '@/components/MenuImagenView';
import * as menuImageService from '@/services/menuImageService';
import type { MenuImageItem, MenuImages } from '@/types/menuImage';

vi.mock('@/services/menuImageService');

const service = vi.mocked(menuImageService);

const item = (id: number, version = 100 + id): MenuImageItem => ({
  id,
  image_url: `/menu-image/${id}/file?v=${version}`,
  content_type: 'image/png',
  size_bytes: 2 * 1024 * 1024,
  updated_at: '2026-10-29T15:30:00Z',
});
const menu = (...ids: number[]): MenuImages => ({ images: ids.map((id) => item(id)), max_images: 3 });

const archivo = (nombre = 'menu.png', tipo = 'image/png', bytes = 1000) =>
  new File([new Uint8Array(bytes)], nombre, { type: tipo });

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchMenuImages.mockResolvedValue(menu(1, 2));
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  URL.revokeObjectURL = vi.fn();
});

/** Elige un archivo salteando el filtro `accept` del navegador, que es justo lo que hay que validar. */
function elegir(file: File, etiqueta = 'Archivo de imagen del menú') {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { files: [file] } });
}

describe('MenuImagenView', () => {
  it('sin imágenes cargadas invita a cargar una', async () => {
    service.fetchMenuImages.mockResolvedValue(menu());
    render(<MenuImagenView />);

    expect(await screen.findByText('Todavía no cargaste ninguna imagen del menú.')).toBeInTheDocument();
    expect(screen.getByText('Imágenes del menú (0 de 3)')).toBeInTheDocument();
  });

  it('muestra todas las imágenes del menú en orden, con su peso y fecha', async () => {
    render(<MenuImagenView />);

    const primera = await screen.findByRole('img', { name: 'Imagen 1 del menú' });
    const segunda = screen.getByRole('img', { name: 'Imagen 2 del menú' });
    expect(primera).toHaveAttribute('src', expect.stringContaining('/menu-image/1/file?v=101'));
    expect(segunda).toHaveAttribute('src', expect.stringContaining('/menu-image/2/file?v=102'));
    expect(screen.getByText('Imágenes del menú (2 de 3)')).toBeInTheDocument();
    expect(screen.getAllByText(/2\.0 MB · actualizada el/)).toHaveLength(2);
  });

  it('previsualiza la imagen nueva antes de agregarla y recién entonces se suma al menú', async () => {
    service.addMenuImage.mockResolvedValue(menu(1, 2, 3));
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 2 del menú' });
    const nueva = archivo('seccion-postres.png');

    elegir(nueva);

    expect(screen.getByRole('img', { name: 'Vista previa de la imagen nueva' })).toHaveAttribute('src', 'blob:vista-previa');
    expect(screen.getByText(/seccion-postres\.png/)).toBeInTheDocument();
    expect(service.addMenuImage).not.toHaveBeenCalled(); // todavía no se guardó nada
    expect(screen.queryByRole('img', { name: 'Imagen 3 del menú' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agregar al menú' }));

    expect(service.addMenuImage).toHaveBeenCalledWith(nueva);
    expect(await screen.findByRole('img', { name: 'Imagen 3 del menú' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Se sumó la imagen al menú');
    expect(screen.queryByRole('img', { name: 'Vista previa de la imagen nueva' })).not.toBeInTheDocument();
  });

  it('descartar la imagen elegida no guarda nada', async () => {
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });
    elegir(archivo());

    await user.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByRole('img', { name: 'Vista previa de la imagen nueva' })).not.toBeInTheDocument();
    expect(service.addMenuImage).not.toHaveBeenCalled();
  });

  it('rechaza un archivo que no es JPG ni PNG', async () => {
    render(<MenuImagenView />);
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });

    elegir(archivo('menu.gif', 'image/gif'));

    expect(screen.getByRole('alert')).toHaveTextContent('JPG o PNG');
    expect(screen.queryByRole('button', { name: 'Agregar al menú' })).not.toBeInTheDocument();
  });

  it('rechaza una imagen que supera los 5 MB sin llegar a enviarla', async () => {
    render(<MenuImagenView />);
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });

    elegir(archivo('enorme.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1));

    expect(screen.getByRole('alert')).toHaveTextContent('5 MB');
    expect(service.addMenuImage).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza la imagen muestra el motivo y conserva la vista previa', async () => {
    service.addMenuImage.mockRejectedValue({ message: 'La imagen tiene que ser un archivo JPG o PNG.' });
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });
    elegir(archivo());

    await user.click(screen.getByRole('button', { name: 'Agregar al menú' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('JPG o PNG');
    expect(screen.getByRole('img', { name: 'Vista previa de la imagen nueva' })).toBeInTheDocument();
  });

  it('con el máximo de imágenes no deja agregar más', async () => {
    service.fetchMenuImages.mockResolvedValue(menu(1, 2, 3));
    render(<MenuImagenView />);

    expect(await screen.findByText(/ya tiene el máximo de 3 imágenes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Elegir imagen (JPG o PNG)' })).not.toBeInTheDocument();
  });

  it('cambia el orden de las imágenes', async () => {
    service.reorderMenuImages.mockResolvedValue({ images: [item(2), item(1)], max_images: 3 });
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });
    expect(screen.getByRole('button', { name: 'Subir la imagen 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Bajar la imagen 2' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Bajar la imagen 1' }));

    expect(service.reorderMenuImages).toHaveBeenCalledWith([2, 1]);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Imagen 1 del menú' })).toHaveAttribute('src', expect.stringContaining('/menu-image/2/'))
    );
  });

  it('reemplaza una imagen puntual', async () => {
    service.replaceMenuImage.mockResolvedValue({ images: [item(1), item(2, 999)], max_images: 3 });
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 2 del menú' });
    const nueva = archivo('carta-nueva.png');

    await user.click(screen.getByRole('button', { name: 'Reemplazar la imagen 2' }));
    elegir(nueva, 'Archivo para reemplazar una imagen del menú');

    await waitFor(() => expect(service.replaceMenuImage).toHaveBeenCalledWith(2, nueva));
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Imagen 2 del menú' })).toHaveAttribute('src', expect.stringContaining('v=999'))
    );
  });

  it('quitar una imagen pide confirmación y deja las demás', async () => {
    service.deleteMenuImage.mockResolvedValue(undefined);
    service.fetchMenuImages.mockResolvedValueOnce(menu(1, 2)).mockResolvedValueOnce(menu(2));
    render(<MenuImagenView />);
    const user = userEvent.setup();
    await screen.findByRole('img', { name: 'Imagen 1 del menú' });

    await user.click(screen.getByRole('button', { name: 'Quitar la imagen 1' }));
    expect(service.deleteMenuImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sí, quitar' }));

    expect(service.deleteMenuImage).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Imagen 2 del menú' })).not.toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Imagen 1 del menú' })).toHaveAttribute('src', expect.stringContaining('/menu-image/2/'));
  });

  it('si no se puede cargar la información avisa', async () => {
    service.fetchMenuImages.mockRejectedValue(new Error('caído'));
    render(<MenuImagenView />);

    expect(await screen.findByText('No se pudo cargar el menú en imagen.')).toBeInTheDocument();
  });
});
