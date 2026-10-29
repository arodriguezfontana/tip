import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { redirectToCheckout } from '@/services/mercadopagoService';
import { createWebOrder } from '@/services/orderService';
import { formatCurrency } from '@/utils/currency';
import { PHONE_PATTERN } from '@/utils/customerValidation';
import { getErrorMessage } from '@/utils/errors';
import type { CustomerAuthMode } from '@/components/CustomerAuthModal';
import { PAYMENT_METHOD_LABEL, WEB_PAYMENT_METHODS } from '@/types/order';
import type { CheckoutFormData, CheckoutFormErrors, DeliveryMethod, WebOrderCreated, WebPaymentMethod } from '@/types/order';

/**
 * Formulario de datos del pedido. Si el cliente tiene la sesión iniciada, arranca autocompletado
 * con los datos de su cuenta (quien lo usa lo remonta con `key` al cambiar la sesión). Los datos
 * se pueden modificar libremente para este pedido sin alterar los guardados en la cuenta.
 */
export function CheckoutForm({
  onSubmitSuccess,
  onRequestAuth,
}: {
  onSubmitSuccess: (order: WebOrderCreated, form: CheckoutFormData) => void;
  onRequestAuth: (mode: CustomerAuthMode) => void;
}) {
  const { items, total } = useCart();
  const { user, isCustomer } = useAuth();
  const profile = isCustomer ? user : null;

  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('domicilio');
  const [address, setAddress] = useState(profile?.address ?? '');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<WebPaymentMethod>('efectivo');
  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validate = (): CheckoutFormErrors => {
    const nextErrors: CheckoutFormErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Ingresá tu nombre.';
    }
    if (!phone.trim()) {
      nextErrors.phone = 'Ingresá tu número de teléfono.';
    } else if (!PHONE_PATTERN.test(phone.trim())) {
      nextErrors.phone = 'Ingresá un teléfono válido (solo números, espacios, guiones o +).';
    }
    if (deliveryMethod === 'domicilio' && !address.trim()) {
      nextErrors.address = 'Ingresá la dirección de entrega.';
    }
    return nextErrors;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const order = await createWebOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        delivery_method: deliveryMethod,
        shipping_address: deliveryMethod === 'domicilio' ? address.trim() : null,
        notes: notes.trim() || null,
        items: items.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          secondary_product_id: item.secondary_product?.id,
          custom_name: item.custom_name,
        })),
        payment_method: paymentMethod,
      });
      onSubmitSuccess(order, { name, phone, deliveryMethod, address, notes, paymentMethod });
      // Con MercadoPago el pedido ya quedó registrado (pendiente de pago): ahora se paga en su checkout.
      if (order.payment_url) redirectToCheckout(order.payment_url);
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'No pudimos registrar tu pedido. Por favor, intentá nuevamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-3">Tus datos</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Agregá productos al carrito para continuar.</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          {profile ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              Completamos tus datos desde tu cuenta. Podés modificarlos para este pedido sin cambiar tu{' '}
              <Link to="/perfil" className="font-semibold underline hover:no-underline">
                perfil
              </Link>
              .
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              <p>
                <button
                  type="button"
                  onClick={() => onRequestAuth('login')}
                  style={{ color: 'var(--primary-color, #18181b)' }}
                  className="font-semibold underline hover:no-underline"
                >
                  Iniciá sesión
                </button>{' '}
                o{' '}
                <button
                  type="button"
                  onClick={() => onRequestAuth('register')}
                  style={{ color: 'var(--primary-color, #18181b)' }}
                  className="font-semibold underline hover:no-underline"
                >
                  creá una cuenta
                </button>{' '}
                para completar tus datos automáticamente.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                También podés completar el formulario y pedir como invitado.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'name-error' : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {errors.name && (
              <p id="name-error" role="alert" className="text-xs text-red-600 mt-1">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {errors.phone && (
              <p id="phone-error" role="alert" className="text-xs text-red-600 mt-1">
                {errors.phone}
              </p>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Entrega</span>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm">
              <button
                type="button"
                aria-pressed={deliveryMethod === 'domicilio'}
                onClick={() => setDeliveryMethod('domicilio')}
                style={deliveryMethod === 'domicilio' ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
                className={`flex-1 py-2.5 font-medium transition ${
                  deliveryMethod === 'domicilio' ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Envío a domicilio
              </button>
              <button
                type="button"
                aria-pressed={deliveryMethod === 'retiro'}
                onClick={() => setDeliveryMethod('retiro')}
                style={deliveryMethod === 'retiro' ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
                className={`flex-1 py-2.5 font-medium transition ${
                  deliveryMethod === 'retiro' ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Retiro en el local
              </button>
            </div>
          </div>

          {deliveryMethod === 'domicilio' && (
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <input
                id="address"
                type="text"
                autoComplete="street-address"
                aria-invalid={Boolean(errors.address)}
                aria-describedby={errors.address ? 'address-error' : undefined}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              {errors.address && (
                <p id="address-error" role="alert" className="text-xs text-red-600 mt-1">
                  {errors.address}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones (opcional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Pago</span>
            <div role="radiogroup" aria-label="Medio de pago" className="flex rounded-xl border border-gray-300 overflow-hidden text-sm">
              {WEB_PAYMENT_METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  style={paymentMethod === method ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
                  className={`flex-1 py-2.5 font-medium transition ${
                    paymentMethod === method ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {PAYMENT_METHOD_LABEL[method]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {paymentMethod === 'mercadopago'
                ? `Al confirmar te llevamos a MercadoPago para pagar ${formatCurrency(total)} de forma segura.`
                : deliveryMethod === 'domicilio'
                  ? 'Pagás en efectivo al recibir el pedido.'
                  : 'Pagás en efectivo al retirar el pedido.'}
            </p>
          </div>

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          {/* Pegado al borde inferior: el botón se ve siempre, aunque el formulario no entre entero en la pantalla. */}
          <div className="sticky bottom-0 z-10 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 sm:px-5 pt-3 pb-4 sm:pb-5 bg-white border-t border-gray-100 rounded-b-2xl">
            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
              className="w-full text-white rounded-xl py-3 font-semibold hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
            >
              {submitting ? 'Enviando pedido...' : paymentMethod === 'mercadopago' ? 'Confirmar e ir a pagar' : 'Confirmar pedido'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
