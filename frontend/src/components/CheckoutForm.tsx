import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCart } from '@/hooks/useCart';
import { createWebOrder } from '@/services/orderService';
import type { CheckoutFormData, CheckoutFormErrors, DeliveryMethod, WebOrderCreated } from '@/types/order';

const PHONE_PATTERN = /^\+?[0-9\s()-]{6,30}$/;

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return 'No pudimos registrar tu pedido. Por favor, intentá nuevamente.';
}

export function CheckoutForm({
  onSubmitSuccess,
}: {
  onSubmitSuccess: (order: WebOrderCreated, form: CheckoutFormData) => void;
}) {
  const { items } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('domicilio');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
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
        items: items.map((item) => ({ product_id: item.product.id, quantity: item.quantity })),
      });
      onSubmitSuccess(order, { name, phone, deliveryMethod, address, notes });
    } catch (err) {
      setSubmitError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md p-6 mt-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Tus datos</h2>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Agregá productos al carrito para continuar.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 mb-1">Entrega</span>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setDeliveryMethod('domicilio')}
                className={`flex-1 py-2 font-medium transition ${
                  deliveryMethod === 'domicilio' ? 'bg-black text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                Envío a domicilio
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod('retiro')}
                className={`flex-1 py-2 font-medium transition ${
                  deliveryMethod === 'retiro' ? 'bg-black text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
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
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
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
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
            />
          </div>

          {submitError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando pedido...' : 'Confirmar pedido'}
          </button>
        </form>
      )}
    </div>
  );
}
