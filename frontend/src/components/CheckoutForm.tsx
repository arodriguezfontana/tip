import { useState } from 'react';
import type { SubmitEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { redirectToCheckout } from '@/services/mercadopagoService';
import { createWebOrder } from '@/services/orderService';
import { paymentHint, toWebOrderItem, validateCheckout } from '@/utils/checkout';
import { getErrorMessage } from '@/utils/errors';
import type { CustomerAuthMode } from '@/components/CustomerAuthModal';
import { PAYMENT_METHOD_LABEL, WEB_PAYMENT_METHODS } from '@/types/order';
import type { CheckoutFormData, CheckoutFormErrors, DeliveryMethod, WebOrderCreated, WebPaymentMethod } from '@/types/order';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-black';
const PRIMARY_BACKGROUND = { backgroundColor: 'var(--primary-color, #18181b)' };

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: 'domicilio', label: 'Envío a domicilio' },
  { value: 'retiro', label: 'Retiro en el local' },
];

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: 'text' | 'tel';
  autoComplete?: string;
}

/** Campo de texto con su etiqueta y el mensaje de error. */
function TextField({ id, label, value, onChange, error, type = 'text', autoComplete }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

function optionClass(selected: boolean): string {
  return `flex-1 py-2.5 font-medium transition ${selected ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`;
}

function AccountNotice({ isLoggedIn, onRequestAuth }: { isLoggedIn: boolean; onRequestAuth: (mode: CustomerAuthMode) => void }) {
  if (isLoggedIn) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
        Completamos tus datos desde tu cuenta. Podés modificarlos para este pedido sin cambiar tu{' '}
        <Link to="/perfil" className="font-semibold underline hover:no-underline">
          perfil
        </Link>
        .
      </div>
    );
  }
  const authButton = (mode: CustomerAuthMode, label: ReactNode) => (
    <button
      type="button"
      onClick={() => onRequestAuth(mode)}
      style={{ color: 'var(--primary-color, #18181b)' }}
      className="font-semibold underline hover:no-underline"
    >
      {label}
    </button>
  );
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
      <p>
        {authButton('login', 'Iniciá sesión')} o {authButton('register', 'creá una cuenta')} para completar tus datos
        automáticamente.
      </p>
      <p className="text-xs text-gray-500 mt-1">También podés completar el formulario y pedir como invitado.</p>
    </div>
  );
}

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

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) return;

    const form: CheckoutFormData = { name, phone, deliveryMethod, address, notes, paymentMethod };
    const nextErrors = validateCheckout(form);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const order = await createWebOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        delivery_method: deliveryMethod,
        shipping_address: deliveryMethod === 'domicilio' ? address.trim() : null,
        notes: notes.trim() || null,
        items: items.map(toWebOrderItem),
        payment_method: paymentMethod,
      });
      onSubmitSuccess(order, form);
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
          <AccountNotice isLoggedIn={Boolean(profile)} onRequestAuth={onRequestAuth} />

          <TextField id="name" label="Nombre" value={name} onChange={setName} error={errors.name} autoComplete="name" />
          <TextField
            id="phone"
            label="Teléfono"
            type="tel"
            value={phone}
            onChange={setPhone}
            error={errors.phone}
            autoComplete="tel"
          />

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Entrega</span>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm">
              {DELIVERY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={deliveryMethod === value}
                  onClick={() => setDeliveryMethod(value)}
                  style={deliveryMethod === value ? PRIMARY_BACKGROUND : undefined}
                  className={optionClass(deliveryMethod === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {deliveryMethod === 'domicilio' && (
            <TextField
              id="address"
              label="Dirección"
              value={address}
              onChange={setAddress}
              error={errors.address}
              autoComplete="street-address"
            />
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
              placeholder="Ej: Sin cebolla, con extra queso, timbre 2B…"
              className={`${INPUT_CLASS} resize-none`}
            />
            <p className="text-xs text-gray-500 mt-1">
              Podés indicar exclusiones y extras en lenguaje natural (ej. &ldquo;Sin cebolla&rdquo;, &ldquo;Con extra queso&rdquo;).
            </p>
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
                  style={paymentMethod === method ? PRIMARY_BACKGROUND : undefined}
                  className={optionClass(paymentMethod === method)}
                >
                  {PAYMENT_METHOD_LABEL[method]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">{paymentHint(paymentMethod, deliveryMethod, total)}</p>
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
              style={PRIMARY_BACKGROUND}
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
