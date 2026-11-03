import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PizzaMitadYMitadModal } from '@/components/PizzaMitadYMitadModal';
import { CartProvider } from '@/context/CartContext';
import { useCart } from '@/hooks/useCart';
import { FUGAZZETA, MUZZA, makeProduct } from '@/test/utils';

const NAPOLITANA = makeProduct({
  id: 4,
  name: 'Pizza Napolitana',
  price: 11000,
});

function CartInspector() {
  const { items, total } = useCart();
  return (
    <div data-testid="cart-inspector">
      <span data-testid="cart-total">{total}</span>
      <span data-testid="cart-count">{items.length}</span>
      {items.map((item, idx) => (
        <div key={idx} data-testid={`cart-item-${idx}`}>
          <span data-testid={`item-name-${idx}`}>{item.custom_name}</span>
          <span data-testid={`item-price-${idx}`}>{item.unit_price}</span>
          <span data-testid={`item-qty-${idx}`}>{item.quantity}</span>
        </div>
      ))}
    </div>
  );
}

function renderModal(props?: Partial<Parameters<typeof PizzaMitadYMitadModal>[0]>) {
  const onClose = vi.fn();
  const pizzas = props?.pizzas ?? [MUZZA, FUGAZZETA, NAPOLITANA];

  const result = render(
    <CartProvider>
      <PizzaMitadYMitadModal pizzas={pizzas} onClose={onClose} {...props} />
      <CartInspector />
    </CartProvider>
  );

  return { ...result, onClose, pizzas };
}

describe('PizzaMitadYMitadModal', () => {
  it('muestra el título, opciones de sabores y calcula el precio por el gusto más caro', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Armar pizza mitad y mitad')).toBeInTheDocument();

    // Muzzarella ($8.500) y Fugazzeta ($9.500) -> mayor es $9.500
    expect(screen.getByText('Pizza Grande [1/2 Muzzarella | 1/2 Fugazzeta]')).toBeInTheDocument();
    expect(screen.getAllByText(/9\.500/).length).toBeGreaterThanOrEqual(1);
  });

  it('no muestra explicaciones explícitas de la regla de cobro (restricción de UI)', () => {
    renderModal();

    const dialogText = screen.getByRole('dialog').textContent?.toLowerCase() ?? '';
    expect(dialogText).not.toContain('más cara');
    expect(dialogText).not.toContain('mas cara');
    expect(dialogText).not.toContain('regla');
    expect(dialogText).not.toContain('mayor valor');
    expect(dialogText).not.toContain('criterio de cobro');
  });

  it('cambiar de sabores recalcula el precio con el gusto más caro y actualiza el nombre unificado', async () => {
    const user = userEvent.setup();
    renderModal();

    const sabor1Select = screen.getByLabelText(/primera mitad/i);
    const sabor2Select = screen.getByLabelText(/segunda mitad/i);

    // Cambiar segunda mitad a Napolitana ($11.000)
    await user.selectOptions(sabor2Select, String(NAPOLITANA.id));

    expect(screen.getByText('Pizza Grande [1/2 Muzzarella | 1/2 Napolitana]')).toBeInTheDocument();
    // Precio unitario y total deben ser $11.000
    expect(screen.getAllByText(/11\.000/).length).toBeGreaterThanOrEqual(1);

    // Cambiar primera mitad a Napolitana y segunda a Fugazzeta ($9.500) -> sigue siendo $11.000
    await user.selectOptions(sabor1Select, String(NAPOLITANA.id));
    await user.selectOptions(sabor2Select, String(FUGAZZETA.id));

    expect(screen.getByText('Pizza Grande [1/2 Napolitana | 1/2 Fugazzeta]')).toBeInTheDocument();
    expect(screen.getAllByText(/11\.000/).length).toBeGreaterThanOrEqual(1);
  });

  it('permite cambiar la cantidad y calcula el total multiplicando por el precio unitario', async () => {
    const user = userEvent.setup();
    renderModal();

    // Cantidad inicial 1, total $9.500
    const btnMas = screen.getByRole('button', { name: /aumentar cantidad/i });
    await user.click(btnMas);

    // Ahora cantidad 2, total 2 * $9.500 = $19.000
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/19\.000/)).toBeInTheDocument();
  });

  it('agrega la pizza mitad y mitad al carrito y cierra la ventana', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    const btnAgregar = screen.getByRole('button', { name: /agregar al carrito/i });
    await user.click(btnAgregar);

    expect(onClose).toHaveBeenCalledTimes(1);

    // Verificar en el carrito
    expect(screen.getByTestId('cart-count')).toHaveTextContent('1');
    expect(screen.getByTestId('cart-total')).toHaveTextContent('9500');
    expect(screen.getByTestId('item-name-0')).toHaveTextContent(
      'Pizza Grande [1/2 Muzzarella | 1/2 Fugazzeta]'
    );
    expect(screen.getByTestId('item-price-0')).toHaveTextContent('9500');
    expect(screen.getByTestId('item-qty-0')).toHaveTextContent('1');
  });

  it('se cierra con el botón de cerrar y con la tecla Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);

    const btnCerrar = screen.getByRole('button', { name: /cerrar ventana/i });
    await user.click(btnCerrar);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
