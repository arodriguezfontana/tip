import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCart } from '@/hooks/useCart';
import type { CheckoutFormData, CheckoutFormErrors, DeliveryMethod } from '@/types/order';

export function CheckoutForm({
  onSubmitSuccess,
}: {
  onSubmitSuccess: (form: CheckoutFormData) => void;
}) {
  const { items } = useCart();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('domicilio');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<CheckoutFormErrors>({});

  const validate = (): CheckoutFormErrors => {
    const nextErrors: CheckoutFormErrors = {};
    if (!name.trim()) {
      nextErrors.name = 'Ingresá tu nombre.';
    }
    if (!phone.trim()) {
      nextErrors.phone = 'Ingresá tu número de teléfono.';
    }
    if (deliveryMethod === 'domicilio' && !address.trim()) {
      nextErrors.address = 'Ingresá la dirección de entrega.';
    }
    return nextErrors;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onSubmitSuccess({ name, phone, deliveryMethod, address, notes });
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

          <button
            type="submit"
            className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition"
          >
            Confirmar pedido
          </button>
        </form>
      )}
    </div>
  );
}
