import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartProvider } from '@/context/CartContext';
import { useCart } from '@/hooks/useCart';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import { COCA, FUGAZZETA, MUZZA } from '@/test/utils';

function renderCart() {
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

describe('CartContext', () => {
  it('arranca vacío', () => {
    const { result } = renderCart();
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it('agrega productos y suma cantidades del mismo producto en una sola línea', () => {
    const { result } = renderCart();

    act(() => {
      result.current.addItem(MUZZA);
      result.current.addItem(COCA, 2);
      result.current.addItem(MUZZA);
    });

    expect(result.current.items.map((i) => [i.product.name, i.quantity])).toEqual([
      ['Pizza Muzzarella', 2],
      ['Coca-Cola 500ml', 2],
    ]);
    expect(result.current.itemCount).toBe(4);
    expect(result.current.total).toBe(2 * 8500 + 2 * 2500);
  });

  it(`no supera ${MAX_QUANTITY_PER_ITEM} unidades por producto`, () => {
    const { result } = renderCart();

    act(() => result.current.addItem(MUZZA, 15));
    act(() => result.current.addItem(MUZZA, 10));
    expect(result.current.items[0].quantity).toBe(MAX_QUANTITY_PER_ITEM);

    act(() => result.current.updateQuantity(MUZZA.id, 99));
    expect(result.current.items[0].quantity).toBe(MAX_QUANTITY_PER_ITEM);
  });

  it('actualizar a 0 quita el producto', () => {
    const { result } = renderCart();
    act(() => result.current.addItem(MUZZA, 3));

    act(() => result.current.updateQuantity(MUZZA.id, 0));

    expect(result.current.items).toEqual([]);
  });

  it('quita un producto y vacía el carrito', () => {
    const { result } = renderCart();
    act(() => {
      result.current.addItem(MUZZA);
      result.current.addItem(COCA);
    });

    act(() => result.current.removeItem(MUZZA.id));
    expect(result.current.items.map((i) => i.product.id)).toEqual([COCA.id]);

    act(() => result.current.clearCart());
    expect(result.current.items).toEqual([]);
  });

  it('agrega pizza mitad y mitad calculando el precio del gusto más caro', () => {
    const { result } = renderCart();

    act(() => {
      // MUZZA ($8500), FUGAZZETA ($9500) -> unit_price debe ser 9500
      result.current.addItem(MUZZA, 1, FUGAZZETA);
    });

    expect(result.current.items).toHaveLength(1);
    const item = result.current.items[0];
    expect(item.product.id).toBe(MUZZA.id);
    expect(item.secondary_product?.id).toBe(FUGAZZETA.id);
    expect(item.custom_name).toBe('Pizza Grande [1/2 Muzzarella | 1/2 Fugazzeta]');
    expect(item.unit_price).toBe(9500);
    expect(result.current.total).toBe(9500);

    // Sumar otra unidad de la misma combinación
    act(() => {
      result.current.addItem(MUZZA, 2, FUGAZZETA);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(3);
    expect(result.current.total).toBe(3 * 9500);

    // Actualizar cantidad
    act(() => {
      result.current.updateQuantity(MUZZA.id, 1, FUGAZZETA.id);
    });
    expect(result.current.items[0].quantity).toBe(1);
    expect(result.current.total).toBe(9500);

    // Quitar del carrito
    act(() => {
      result.current.removeItem(MUZZA.id, FUGAZZETA.id);
    });
    expect(result.current.items).toEqual([]);
  });

  it('useCart fuera del provider avisa del error de uso', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart debe usarse dentro de un CartProvider');
  });
});
