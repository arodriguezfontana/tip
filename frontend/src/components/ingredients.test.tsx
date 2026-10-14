import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngredientesView } from '@/components/IngredientesView';
import { ProductosView } from '@/components/ProductosView';
import { ReporteIngredientesView } from '@/components/ReporteIngredientesView';
import * as ingredientService from '@/services/ingredientService';
import type { Ingredient, IngredientConsumptionReport, ProductWithRecipe } from '@/types/ingredient';

vi.mock('@/services/ingredientService');

const service = vi.mocked(ingredientService);

const plain = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

const MUZZARELLA: Ingredient = { id: 1, name: 'Muzzarella', unit: 'gramos', products_count: 1 };
const SALSA: Ingredient = { id: 2, name: 'Salsa de tomate', unit: 'gramos', products_count: 1 };
const HUEVO: Ingredient = { id: 3, name: 'Huevo', unit: 'unidades', products_count: 0 };
const INGREDIENTS = [HUEVO, MUZZARELLA, SALSA];

const MUZZA: ProductWithRecipe = {
  id: 10,
  name: 'Pizza Muzzarella',
  is_active: true,
  category: { id: 1, name: 'Pizzas' },
  recipe: [
    { ingredient_id: 1, ingredient_name: 'Muzzarella', unit: 'gramos', quantity: 250 },
    { ingredient_id: 2, ingredient_name: 'Salsa de tomate', unit: 'gramos', quantity: 100 },
  ],
};
const COCA: ProductWithRecipe = {
  id: 11,
  name: 'Coca-Cola 500ml',
  is_active: false,
  category: { id: 2, name: 'Bebidas' },
  recipe: [],
};

const REPORT: IngredientConsumptionReport = {
  completed_orders: 3,
  items: [
    { ingredient_id: 1, ingredient_name: 'Muzzarella', unit: 'gramos', total_quantity: 1250.5 },
    { ingredient_id: 2, ingredient_name: 'Salsa de tomate', unit: 'gramos', total_quantity: 500 },
  ],
  products_without_recipe: ['Coca-Cola 500ml'],
};

beforeEach(() => {
  vi.resetAllMocks();
  service.fetchIngredients.mockResolvedValue(INGREDIENTS);
  service.fetchProductsWithRecipes.mockResolvedValue([MUZZA, COCA]);
  service.fetchIngredientConsumption.mockResolvedValue(REPORT);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function row(name: string) {
  return screen.getByRole('cell', { name }).closest('tr') as HTMLElement;
}

describe('IngredientesView', () => {
  it('lista los ingredientes con su unidad y en cuántos productos se usan', async () => {
    render(<IngredientesView />);

    expect(await screen.findByRole('cell', { name: 'Muzzarella' })).toBeInTheDocument();
    expect(within(row('Muzzarella')).getByText('gramos')).toBeInTheDocument();
    expect(within(row('Muzzarella')).getByText('1 producto')).toBeInTheDocument();
    expect(within(row('Huevo')).getByText('0 productos')).toBeInTheDocument();
  });

  it('agrega un ingrediente y vuelve a cargar la lista', async () => {
    service.createIngredient.mockResolvedValue({ id: 4, name: 'Harina', unit: 'kilogramos', products_count: 0 });
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Muzzarella' });

    await user.type(screen.getByLabelText('Nombre del nuevo ingrediente'), '  Harina ');
    await user.type(screen.getByLabelText('Unidad del nuevo ingrediente'), 'kilogramos');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(service.createIngredient).toHaveBeenCalledWith({ name: 'Harina', unit: 'kilogramos' });
    await waitFor(() => expect(service.fetchIngredients).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Nombre del nuevo ingrediente')).toHaveValue('');
  });

  it('valida nombre y unidad antes de agregar', async () => {
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Muzzarella' });

    await user.type(screen.getByLabelText('Nombre del nuevo ingrediente'), 'Harina');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá la unidad de medida');
    expect(service.createIngredient).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor (ej. nombre repetido)', async () => {
    service.createIngredient.mockRejectedValue({ statusCode: 409, message: "Ya existe un ingrediente llamado 'huevo'." });
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Muzzarella' });

    await user.type(screen.getByLabelText('Nombre del nuevo ingrediente'), 'huevo');
    await user.type(screen.getByLabelText('Unidad del nuevo ingrediente'), 'unidades');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Ya existe un ingrediente llamado 'huevo'.");
  });

  it('edita un ingrediente', async () => {
    service.updateIngredient.mockResolvedValue({ ...HUEVO, unit: 'docenas' });
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Huevo' });

    await user.click(screen.getByRole('button', { name: 'Editar Huevo' }));
    await user.clear(screen.getByLabelText('Unidad del ingrediente'));
    await user.type(screen.getByLabelText('Unidad del ingrediente'), 'docenas');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(service.updateIngredient).toHaveBeenCalledWith(3, { name: 'Huevo', unit: 'docenas' });
    await waitFor(() => expect(screen.queryByLabelText('Unidad del ingrediente')).not.toBeInTheDocument());
  });

  it('elimina un ingrediente después de confirmar y avisa si está en uso', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    service.deleteIngredient
      .mockResolvedValueOnce()
      .mockRejectedValueOnce({ statusCode: 409, message: 'Forma parte de la receta de: Pizza Muzzarella.' });
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Huevo' });

    await user.click(screen.getByRole('button', { name: 'Eliminar Huevo' }));
    expect(service.deleteIngredient).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Eliminar Muzzarella' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Forma parte de la receta de: Pizza Muzzarella.');
  });

  it('no elimina si se cancela la confirmación', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<IngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Huevo' });

    await user.click(screen.getByRole('button', { name: 'Eliminar Huevo' }));

    expect(service.deleteIngredient).not.toHaveBeenCalled();
  });
});

describe('ProductosView', () => {
  it('lista los productos con su receta', async () => {
    render(<ProductosView />);

    expect(await screen.findByText('Pizza Muzzarella')).toBeInTheDocument();
    expect(plain(screen.getByText(/Muzzarella: /).textContent)).toBe('Muzzarella: 250 gramos');
    expect(screen.getByText('Sin receta')).toBeInTheDocument();
    expect(screen.getByText('No disponible')).toBeInTheDocument();
    expect(screen.getByText(/Hay 1 producto sin receta/)).toBeInTheDocument();
  });

  it('edita la receta de un producto: cambia cantidades, quita y agrega ingredientes', async () => {
    service.updateProductRecipe.mockImplementation(async (id, items) => ({
      ...MUZZA,
      id,
      recipe: items.map((item) => {
        const ingredient = INGREDIENTS.find((i) => i.id === item.ingredient_id)!;
        return { ingredient_id: ingredient.id, ingredient_name: ingredient.name, unit: ingredient.unit, quantity: item.quantity };
      }),
    }));
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella');

    await user.click(screen.getByRole('button', { name: 'Editar receta de Pizza Muzzarella' }));
    const dialog = screen.getByRole('dialog', { name: 'Receta de Pizza Muzzarella' });
    expect(within(dialog).getByLabelText('Cantidad del ingrediente 1')).toHaveValue('250');

    await user.clear(within(dialog).getByLabelText('Cantidad del ingrediente 1'));
    await user.type(within(dialog).getByLabelText('Cantidad del ingrediente 1'), '300');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el ingrediente 2' }));
    await user.click(within(dialog).getByRole('button', { name: '+ Agregar ingrediente' }));
    // El ingrediente que ya está en otra fila no se ofrece de nuevo.
    expect(within(within(dialog).getByLabelText('Ingrediente 2')).queryByRole('option', { name: 'Muzzarella' })).toBeNull();
    await user.selectOptions(within(dialog).getByLabelText('Ingrediente 2'), 'Huevo');
    expect(within(dialog).getByText('unidades')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Cantidad del ingrediente 2'), '0,5');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar receta' }));

    expect(service.updateProductRecipe).toHaveBeenCalledWith(10, [
      { ingredient_id: 1, quantity: 300 },
      { ingredient_id: 3, quantity: 0.5 },
    ]);
    expect(await screen.findByText('Se guardó la receta de Pizza Muzzarella.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(plain(screen.getByText(/Huevo: /).textContent)).toBe('Huevo: 0,5 unidades');
  });

  it('valida la receta antes de guardar', async () => {
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Coca-Cola 500ml');

    await user.click(screen.getByRole('button', { name: 'Editar receta de Coca-Cola 500ml' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '+ Agregar ingrediente' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar receta' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Elegí el ingrediente de cada fila');

    await user.selectOptions(within(dialog).getByLabelText('Ingrediente 1'), 'Huevo');
    await user.type(within(dialog).getByLabelText('Cantidad del ingrediente 1'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar receta' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Ingresá una cantidad mayor a cero');

    expect(service.updateProductRecipe).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor y deja el modal abierto', async () => {
    service.updateProductRecipe.mockRejectedValue({ statusCode: 400, message: 'Algún ingrediente de la receta no existe.' });
    render(<ProductosView />);
    const user = userEvent.setup();
    await screen.findByText('Pizza Muzzarella');

    await user.click(screen.getByRole('button', { name: 'Editar receta de Pizza Muzzarella' }));
    await user.click(screen.getByRole('button', { name: 'Guardar receta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Algún ingrediente de la receta no existe.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ReporteIngredientesView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 15, 0));
  });

  it('muestra el consumo de la última semana y avisa los productos sin receta', async () => {
    render(<ReporteIngredientesView />);

    expect(await screen.findByRole('cell', { name: 'Muzzarella' })).toBeInTheDocument();
    expect(service.fetchIngredientConsumption).toHaveBeenCalledWith({
      dateFrom: new Date(2026, 8, 27),
      dateTo: new Date(2026, 9, 3, 23, 59, 59, 999),
      ingredientId: undefined,
    });
    expect(plain(within(row('Muzzarella')).getAllByRole('cell')[1].textContent)).toBe('1.250,5 gramos');
    expect(screen.getByText('Pedidos finalizados').nextElementSibling).toHaveTextContent('3');
    expect(screen.getByText(/no tienen receta/)).toHaveTextContent('Coca-Cola 500ml');
  });

  it('filtra por día y por mes', async () => {
    render(<ReporteIngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'Muzzarella' });

    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    await waitFor(() =>
      expect(service.fetchIngredientConsumption).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: new Date(2026, 9, 3), dateTo: new Date(2026, 9, 3, 23, 59, 59, 999) })
      )
    );

    await user.click(screen.getByRole('button', { name: 'Último mes' }));
    await waitFor(() =>
      expect(service.fetchIngredientConsumption).toHaveBeenLastCalledWith(
        expect.objectContaining({ dateFrom: new Date(2026, 8, 4) })
      )
    );
  });

  it('filtra por ingrediente', async () => {
    service.fetchIngredientConsumption.mockImplementation(async ({ ingredientId } = {}) =>
      ingredientId ? { ...REPORT, items: [REPORT.items[1]] } : REPORT
    );
    render(<ReporteIngredientesView />);
    const user = userEvent.setup();
    await screen.findByRole('option', { name: 'Salsa de tomate' });

    await user.selectOptions(screen.getByLabelText('Ingrediente'), 'Salsa de tomate');

    await waitFor(() =>
      expect(service.fetchIngredientConsumption).toHaveBeenLastCalledWith(expect.objectContaining({ ingredientId: 2 }))
    );
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Muzzarella' })).not.toBeInTheDocument());
    expect(screen.getByRole('cell', { name: 'Salsa de tomate' })).toBeInTheDocument();
  });

  it('avisa si no hubo consumo en el período', async () => {
    service.fetchIngredientConsumption.mockResolvedValue({ completed_orders: 0, items: [], products_without_recipe: [] });
    render(<ReporteIngredientesView />);

    expect(await screen.findByText('No hay consumo de ingredientes en el rango seleccionado.')).toBeInTheDocument();
  });

  it('muestra un error si el reporte no carga', async () => {
    service.fetchIngredientConsumption.mockRejectedValue({ statusCode: 500, message: 'Error' });
    render(<ReporteIngredientesView />);

    expect(await screen.findByText('No se pudo cargar el reporte de ingredientes.')).toBeInTheDocument();
  });
});
