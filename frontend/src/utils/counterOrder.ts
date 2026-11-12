import type { CartItem, CounterOrderPayload, DeliveryMethod, PaymentMethod } from '@/types/order';
import { PHONE_PATTERN } from '@/utils/customerValidation';

export interface CounterOrderErrors {
  name?: string;
  phone?: string;
  address?: string;
  items?: string;
}

export interface CounterOrderForm {
  name: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  notes: string;
  paymentMethod: PaymentMethod | null;
  isPaid: boolean;
}

function phoneError(phone: string): string | undefined {
  if (!phone.trim()) return 'Ingresá el teléfono.';
  return PHONE_PATTERN.test(phone.trim()) ? undefined : 'Teléfono inválido (solo números, espacios, guiones o +).';
}

/** Los errores de los datos del pedido del mostrador (vacío si está todo bien). */
export function validateCounterOrder(form: CounterOrderForm, lines: CartItem[]): CounterOrderErrors {
  const needsAddress = form.deliveryMethod === 'domicilio' && !form.address.trim();
  const errors: CounterOrderErrors = {
    name: form.name.trim() ? undefined : 'Ingresá el nombre del cliente.',
    phone: phoneError(form.phone),
    address: needsAddress ? 'La dirección es obligatoria para envíos a domicilio.' : undefined,
    items: lines.length === 0 ? 'Agregá al menos un producto al pedido.' : undefined,
  };
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as CounterOrderErrors;
}

/** Lo que se le manda al servidor para registrar el pedido del mostrador. */
export function buildCounterOrderPayload(form: CounterOrderForm, lines: CartItem[]): CounterOrderPayload {
  return {
    customer_name: form.name.trim(),
    customer_phone: form.phone.trim(),
    delivery_method: form.deliveryMethod,
    shipping_address: form.deliveryMethod === 'domicilio' ? form.address.trim() : null,
    notes: form.notes.trim() || null,
    payment_method: form.paymentMethod,
    is_paid: form.isPaid,
    items: lines.map((line) =>
      line.promotion
        ? { promotion_id: line.promotion.id, quantity: line.quantity }
        : { product_id: line.product.id, quantity: line.quantity }
    ),
  };
}
