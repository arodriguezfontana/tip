import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogoView } from '@/components/CatalogoView';
import { CategoriasView } from '@/components/CategoriasView';
import { ProductThumbnail } from '@/components/ProductThumbnail';
import { ProductosView } from '@/components/ProductosView';
import * as catalogService from '@/services/catalogService';
import * as ingredientService from '@/services/ingredientService';
import type { AdminCategory, AdminProduct } from '@/types/catalog';
import { MAX_IMAGE_BYTES } from '@/utils/catalog';

vi.mock('@/services/catalogService');
vi.mock('@/services/ingredientService');

const catalog = vi.mocked(catalogService);

const PIZZAS = { id: 1, name: 'Pizzas' };
const BEBIDAS = { id: 2, name: 'Bebidas' };

function makeAdminProduct(overrides: Partial<AdminProduct> = {}): AdminProduct {
  return {
    id: 10,
    name: 'Pizza Muzzarella',
    description: 'Salsa de tomate y muzzarella.',
    price: 8500,
    is_active: true,
    dietary_restrictions: [],
    category: PIZZAS,
    image_url: null,
    recipe: [],
    ...overrides,
  };
}

const MUZZA = makeAdminProduct({ image_url: '/menu/products/10/image?v=1' });
const COCA = makeAdminProduct({ id: 11, name: 'Coca-Cola 500ml', description: 'Botella.', price: 2500, category: BEBIDAS });
const FAINA = makeAdminProduct({ id: 12, name: 'Fainá', description: 'Porción.', price: 1500, category: null });

const CATEGORIES: AdminCategory[] = [
  { id: 2, name: 'Bebidas', products: [{ id: 11, name: 'Coca-Cola 500ml', is_active: true }] },
  { id: 1, name: 'Pizzas', products: [{ id: 10, name: 'Pizza Muzzarella', is_active: true }] },
];

function imageFile(name = 'foto.png', type = 'image/png', size = 1024) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeAll(() => {
  // jsdom no implementa las URLs de objetos que se usan para la vista previa de la imagen.
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.resetAllMocks();
  catalog.fetchAdminProducts.mockResolvedValue([MUZZA, COCA, FAINA]);
  catalog.fetchCategories.mockResolvedValue(CATEGORIES);
  vi.mocked(ingredientService.fetchIngredients).mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function row(name: string) {
  return screen.getByText(name, { selector: 'p' }).closest('tr') as HTMLElement;
}

describe('CatalogoView', () => {
  it('alterna entre las pestañas Productos y Categorías', async () => {
    render(<CatalogoView />);
    const user = userEvent.setup();

    expect(screen.getByRole('tab', { name: 'Productos' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: '+ Crear producto' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Categorías' }));

    expect(screen.getByRole('tab', { name: 'Categorías' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: '+ Nueva categoría' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Crear producto' })).not.toBeInTheDocument();
  });
});

describe('ProductosView', () => {
  it('lista el catálogo con imagen, precio y categoría, y avisa los productos sin categoría', async () => {
    render(<ProductosView />);

    expect(await screen.findByText('Pizza Muzzarella', { selector: 'p' })).toBeInTheDocument();
    expect(within(row('Pizza Muzzarella')).getByRole('img', { name: 'Pizza Muzzarella' })).toHaveAttribute(
      'src',
      'http://localhost:8000/api/v1/menu/products/10/image?v=1'
    );
    expect(within(row('Coca-Cola 500ml')).getByText('Bebidas')).toBeInTheDocument();
    expect(within(row('Coca-Cola 500ml')).getByText(/2\.500/)).toBeInTheDocument();
    expect(within(row('Fainá')).getByText('Sin categoría')).toBeInTheDocument();
    expect(screen.getByText(/no tiene categoría y no se muestran en el menú/)).toHaveTextContent('Fainá');
  });

  it('busca y filtra por categoría', async () => {
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });

    await user.type(screen.getByLabelText('Buscar producto'), 'botella');
    expect(screen.queryByText('Pizza Muzzarella', { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.getByText('Coca-Cola 500ml', { selector: 'p' })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar producto'));
    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'Sin categoría');
    expect(screen.getByText('Fainá', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Coca-Cola 500ml', { selector: 'p' })).not.toBeInTheDocument();
  });

  it('crea un producto con imagen', async () => {
    const created = makeAdminProduct({ id: 20, name: 'Fugazzeta', description: 'Cebolla.', price: 9500 });
    catalog.createProduct.mockResolvedValue(created);
    catalog.uploadProductImage.mockResolvedValue({ ...created, image_url: '/menu/products/20/image?v=2' });
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });

    await user.click(screen.getByRole('button', { name: '+ Crear producto' }));
    const dialog = screen.getByRole('dialog', { name: 'Crear producto' });
    await user.type(within(dialog).getByLabelText('Nombre *'), ' Fugazzeta ');
    await user.type(within(dialog).getByLabelText('Descripción *'), 'Cebolla.');
    await user.type(within(dialog).getByLabelText('Precio *'), '9500');
    await user.selectOptions(within(dialog).getByLabelText('Categoría *'), 'Pizzas');
    await user.type(within(dialog).getByLabelText('Restricciones alimentarias'), 'vegetariano, , sin TACC');
    const file = imageFile();
    await user.upload(within(dialog).getByLabelText('Archivo de imagen'), file);
    expect(within(dialog).getByRole('img', { name: 'Vista previa de la imagen' })).toHaveAttribute('src', 'blob:vista-previa');
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));

    expect(catalog.createProduct).toHaveBeenCalledWith({
      name: 'Fugazzeta',
      description: 'Cebolla.',
      price: 9500,
      category_id: 1,
      is_active: true,
      dietary_restrictions: ['vegetariano', 'sin TACC'],
    });
    expect(catalog.uploadProductImage).toHaveBeenCalledWith(20, file);
    expect(await screen.findByText('Se creó el producto Fugazzeta.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(row('Fugazzeta')).getByRole('img', { name: 'Fugazzeta' })).toBeInTheDocument();
  });

  it('valida los datos obligatorios', async () => {
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });

    await user.click(screen.getByRole('button', { name: '+ Crear producto' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ingresá el nombre del producto.');

    await user.type(within(dialog).getByLabelText('Nombre *'), 'Fugazzeta');
    await user.type(within(dialog).getByLabelText('Descripción *'), 'Cebolla.');
    await user.type(within(dialog).getByLabelText('Precio *'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ingresá un precio mayor a cero.');

    await user.clear(within(dialog).getByLabelText('Precio *'));
    await user.type(within(dialog).getByLabelText('Precio *'), '9500');
    await user.click(within(dialog).getByRole('button', { name: 'Crear producto' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Elegí la categoría del producto.');

    expect(catalog.createProduct).not.toHaveBeenCalled();
  });

  it('rechaza imágenes que no son JPG/PNG o que pesan más de 5 MB', async () => {
    render(<ProductosView />);
    // Sin filtrar por "accept", como cuando el usuario elige "Todos los archivos".
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });
    await user.click(screen.getByRole('button', { name: '+ Crear producto' }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Archivo de imagen');

    await user.upload(input, imageFile('animacion.gif', 'image/gif'));
    expect(within(dialog).getByText('La imagen tiene que ser un archivo JPG o PNG.')).toBeInTheDocument();

    await user.upload(input, imageFile('enorme.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1));
    expect(within(dialog).getByText('La imagen no puede pesar más de 5 MB.')).toBeInTheDocument();

    expect(within(dialog).getByText('Sin imagen')).toBeInTheDocument();
  });

  it('edita un producto: cambia precio y categoría y elimina su imagen', async () => {
    catalog.updateProduct.mockImplementation(async (id, payload) => ({
      ...MUZZA,
      ...payload,
      id,
      category: BEBIDAS,
    }));
    catalog.deleteProductImage.mockResolvedValue({ ...MUZZA, price: 9000, category: BEBIDAS, image_url: null });
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });

    await user.click(screen.getByRole('button', { name: 'Editar Pizza Muzzarella' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar Pizza Muzzarella' });
    expect(within(dialog).getByLabelText('Nombre *')).toHaveValue('Pizza Muzzarella');
    expect(within(dialog).getByLabelText('Categoría *')).toHaveValue('1');
    await user.clear(within(dialog).getByLabelText('Precio *'));
    await user.type(within(dialog).getByLabelText('Precio *'), '9000');
    await user.selectOptions(within(dialog).getByLabelText('Categoría *'), 'Bebidas');
    await user.click(within(dialog).getByLabelText('Disponible para pedir'));
    await user.click(within(dialog).getByRole('button', { name: 'Quitar imagen' }));
    expect(within(dialog).getByText('Sin imagen')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(catalog.updateProduct).toHaveBeenCalledWith(10, {
      name: 'Pizza Muzzarella',
      description: 'Salsa de tomate y muzzarella.',
      price: 9000,
      category_id: 2,
      is_active: false,
      dietary_restrictions: [],
    });
    expect(catalog.deleteProductImage).toHaveBeenCalledWith(10);
    expect(catalog.uploadProductImage).not.toHaveBeenCalled();
    expect(await screen.findByText('Se guardaron los cambios de Pizza Muzzarella.')).toBeInTheDocument();
    expect(within(row('Pizza Muzzarella')).queryByRole('img')).not.toBeInTheDocument();
  });

  it('muestra el error del servidor y deja el formulario abierto', async () => {
    catalog.updateProduct.mockRejectedValue({ statusCode: 409, message: "Ya existe un producto llamado 'Coca-Cola 500ml'." });
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella', { selector: 'p' });

    await user.click(screen.getByRole('button', { name: 'Editar Pizza Muzzarella' }));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Ya existe un producto llamado 'Coca-Cola 500ml'.");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si falla la imagen avisa que el producto igual se guardó', async () => {
    catalog.updateProduct.mockResolvedValue(COCA);
    catalog.uploadProductImage.mockRejectedValue({ statusCode: 415, message: 'La imagen tiene que ser un archivo JPG o PNG.' });
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Coca-Cola 500ml', { selector: 'p' });

    await user.click(screen.getByRole('button', { name: 'Editar Coca-Cola 500ml' }));
    await user.upload(screen.getByLabelText('Archivo de imagen'), imageFile());
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Se guardó Coca-Cola 500ml, pero no se pudo actualizar la imagen: La imagen tiene que ser un archivo JPG o PNG.'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('CategoriasView', () => {
  function categoryRow(name: string) {
    return screen.getByText(name, { selector: 'td > p' }).closest('tr') as HTMLElement;
  }

  it('lista las categorías con sus productos y avisa los que no tienen categoría', async () => {
    render(<CategoriasView />);

    expect(await screen.findByText('Bebidas', { selector: 'td > p' })).toBeInTheDocument();
    expect(within(categoryRow('Pizzas')).getByText('Pizza Muzzarella')).toBeInTheDocument();
    expect(within(categoryRow('Pizzas')).getByText('1 producto')).toBeInTheDocument();
    expect(screen.getByText(/Sin categoría \(no se muestran en el menú\)/)).toHaveTextContent('Fainá');
  });

  it('crea una categoría eligiendo productos con el buscador', async () => {
    catalog.createCategory.mockResolvedValue({ id: 3, name: 'Otros', products: [] });
    render(<CategoriasView />);
    const user = userEvent.setup();
    await screen.findByText('Bebidas', { selector: 'td > p' });

    await user.click(screen.getByRole('button', { name: '+ Nueva categoría' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva categoría' });
    await user.type(within(dialog).getByLabelText('Nombre *'), ' Otros ');
    await user.type(within(dialog).getByLabelText('Buscar producto para la categoría'), 'fai');
    expect(within(dialog).queryByLabelText(/Coca-Cola/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/Fainá/));
    await user.clear(within(dialog).getByLabelText('Buscar producto para la categoría'));
    await user.click(within(dialog).getByLabelText(/Coca-Cola 500ml/));
    expect(within(dialog).getByText('Se moverá desde Bebidas')).toBeInTheDocument();
    expect(within(dialog).getByText('2 seleccionados')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear categoría' }));

    expect(catalog.createCategory).toHaveBeenCalledWith({ name: 'Otros', product_ids: [11, 12], sector: 'cocina' });
    expect(await screen.findByText('Se creó la categoría Otros.')).toBeInTheDocument();
    await waitFor(() => expect(catalog.fetchCategories).toHaveBeenCalledTimes(2));
  });

  it('se puede crear una categoría sin productos pero no sin nombre', async () => {
    catalog.createCategory.mockResolvedValue({ id: 3, name: 'Empanadas', products: [] });
    render(<CategoriasView />);
    const user = userEvent.setup();
    await screen.findByText('Bebidas', { selector: 'td > p' });

    await user.click(screen.getByRole('button', { name: '+ Nueva categoría' }));
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá el nombre de la categoría.');

    await user.type(screen.getByLabelText('Nombre *'), 'Empanadas');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    expect(catalog.createCategory).toHaveBeenCalledWith({ name: 'Empanadas', product_ids: [], sector: 'cocina' });
  });

  it('edita el nombre y quita productos de una categoría', async () => {
    catalog.updateCategory.mockResolvedValue({ id: 1, name: 'Pizzas a la piedra', products: [] });
    render(<CategoriasView />);
    const user = userEvent.setup();
    await screen.findByText('Pizzas', { selector: 'td > p' });

    await user.click(screen.getByRole('button', { name: 'Editar Pizzas' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar Pizzas' });
    expect(within(dialog).getByLabelText(/Pizza Muzzarella/)).toBeChecked();
    await user.clear(within(dialog).getByLabelText('Nombre *'));
    await user.type(within(dialog).getByLabelText('Nombre *'), 'Pizzas a la piedra');
    await user.click(within(dialog).getByLabelText(/Pizza Muzzarella/));
    expect(within(dialog).getByText('Quedará sin categoría')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 producto quedará sin categoría/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(catalog.updateCategory).toHaveBeenCalledWith(1, { name: 'Pizzas a la piedra', product_ids: [], sector: 'cocina' });
    expect(await screen.findByText('Se guardaron los cambios de Pizzas a la piedra.')).toBeInTheDocument();
  });

  it('muestra el error del servidor (ej. nombre repetido)', async () => {
    catalog.createCategory.mockRejectedValue({ statusCode: 409, message: "Ya existe una categoría llamada 'pizzas'." });
    render(<CategoriasView />);
    const user = userEvent.setup();
    await screen.findByText('Pizzas', { selector: 'td > p' });

    await user.click(screen.getByRole('button', { name: '+ Nueva categoría' }));
    await user.type(screen.getByLabelText('Nombre *'), 'pizzas');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Ya existe una categoría llamada 'pizzas'.");
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('elimina una categoría después de confirmar', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    catalog.deleteCategory.mockResolvedValue();
    render(<CategoriasView />);
    const user = userEvent.setup();
    await screen.findByText('Pizzas', { selector: 'td > p' });

    await user.click(screen.getByRole('button', { name: 'Eliminar Pizzas' }));
    expect(catalog.deleteCategory).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      '¿Eliminar la categoría "Pizzas"? Su producto quedará sin categoría y no se mostrará en el menú.'
    );

    await user.click(screen.getByRole('button', { name: 'Eliminar Pizzas' }));
    expect(catalog.deleteCategory).toHaveBeenCalledWith(1);
    expect(await screen.findByText('Se eliminó la categoría Pizzas.')).toBeInTheDocument();
  });

  it('permite elegir el sector de preparación y muestra la insignia en el listado', async () => {
    catalog.fetchCategories.mockResolvedValue([
      { id: 1, name: 'Pizzas', sector: 'pizzeria', products: [] },
      { id: 2, name: 'Bebidas', sector: 'barra', products: [] },
    ]);
    catalog.createCategory.mockResolvedValue({ id: 3, name: 'Tragos', sector: 'barra', products: [] });
    render(<CategoriasView />);
    const user = userEvent.setup();

    expect(await screen.findByText('Pizzería')).toBeInTheDocument();
    expect(screen.getByText('Barra')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Nueva categoría' }));
    const dialog = screen.getByRole('dialog', { name: 'Nueva categoría' });
    await user.type(within(dialog).getByLabelText('Nombre *'), 'Tragos');
    await user.selectOptions(within(dialog).getByLabelText('Sector de preparación *'), 'barra');
    await user.click(within(dialog).getByRole('button', { name: 'Crear categoría' }));

    expect(catalog.createCategory).toHaveBeenCalledWith({ name: 'Tragos', product_ids: [], sector: 'barra' });
  });
});

describe('ProductThumbnail', () => {
  it('muestra la imagen del producto o, si no tiene, el ícono de su categoría', () => {
    const { rerender } = render(<ProductThumbnail product={{ name: 'Muzza', image_url: '/x.png', category: PIZZAS }} />);
    expect(screen.getByRole('img', { name: 'Muzza' })).toHaveAttribute('src', 'http://localhost:8000/api/v1/x.png');

    rerender(<ProductThumbnail product={{ name: 'Muzza', image_url: null, category: PIZZAS }} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('category-icon')).toBeInTheDocument();
  });
});
