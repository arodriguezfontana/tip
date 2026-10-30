import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromocionesView } from '@/components/PromocionesView';
import * as catalogService from '@/services/catalogService';
import * as promotionService from '@/services/promotionService';
import type { AdminProduct } from '@/types/catalog';
import type { Promotion } from '@/types/promotion';

vi.mock('@/services/promotionService');
vi.mock('@/services/catalogService');

const promoService = vi.mocked(promotionService);
const catService = vi.mocked(catalogService);

const PRODUCT_MUZZA: AdminProduct = {
  id: 1,
  name: 'Pizza Muzzarella',
  description: 'Salsa y queso',
  price: 10000,
  category: { id: 1, name: 'Pizzas' },
  dietary_restrictions: [],
  image_url: null,
  is_active: true,
  recipe: [],
};

const PRODUCT_COCA: AdminProduct = {
  id: 2,
  name: 'Coca-Cola 1.5L',
  description: 'Bebida',
  price: 3000,
  category: { id: 2, name: 'Bebidas' },
  dietary_restrictions: [],
  image_url: null,
  is_active: true,
  recipe: [],
};

const PROMO_COMBO: Promotion = {
  id: 10,
  name: 'Combo Pizzeros',
  description: '1 Muzza + 1 Coca',
  price: 11500,
  is_active: true,
  is_available: true,
  image_url: null,
  items: [
    { product_id: 1, product_name: 'Pizza Muzzarella', quantity: 1 },
    { product_id: 2, product_name: 'Coca-Cola 1.5L', quantity: 1 },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  catService.fetchAdminProducts.mockResolvedValue([PRODUCT_MUZZA, PRODUCT_COCA]);
  promoService.fetchPromotions.mockResolvedValue([PROMO_COMBO]);
});

describe('PromocionesView', () => {
  it('lista las promociones con su nombre, productos incluidos y precio', async () => {
    render(<PromocionesView />);

    expect(await screen.findByText('Combo Pizzeros')).toBeInTheDocument();
    expect(screen.getByText('1 Muzza + 1 Coca')).toBeInTheDocument();
    expect(screen.getAllByText('1x')).toHaveLength(2);
    expect(screen.getByText('Pizza Muzzarella')).toBeInTheDocument();
    expect(screen.getByText('Coca-Cola 1.5L')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('permite buscar y filtrar promociones', async () => {
    const user = userEvent.setup();
    render(<PromocionesView />);

    await screen.findByText('Combo Pizzeros');
    const searchInput = screen.getByPlaceholderText('Buscar promoción...');

    await user.type(searchInput, 'Inexistente');
    expect(screen.getByText(/No se encontraron promociones que coincidan/)).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, 'Combo');
    expect(screen.getByText('Combo Pizzeros')).toBeInTheDocument();
  });

  it('permite pausar y reactivar una promoción', async () => {
    const user = userEvent.setup();
    promoService.updatePromotion.mockResolvedValue({
      ...PROMO_COMBO,
      is_active: false,
    });

    render(<PromocionesView />);
    await screen.findByText('Combo Pizzeros');

    const toggleBtn = screen.getByText('Activa');
    await user.click(toggleBtn);

    expect(promoService.updatePromotion).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        is_active: false,
      })
    );
  });

  it('permite eliminar una promoción con confirmación', async () => {
    const user = userEvent.setup();
    promoService.deletePromotion.mockResolvedValue();

    render(<PromocionesView />);
    await screen.findByText('Combo Pizzeros');

    const deleteBtn = screen.getByText('Eliminar');
    await user.click(deleteBtn);

    expect(screen.getByText('¿Eliminar?')).toBeInTheDocument();
    const confirmBtn = screen.getByText('Sí');
    await user.click(confirmBtn);

    expect(promoService.deletePromotion).toHaveBeenCalledWith(10);
    await waitFor(() => {
      expect(screen.queryByText('Combo Pizzeros')).not.toBeInTheDocument();
    });
  });
});
