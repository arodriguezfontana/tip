import type { CartItem, CheckoutFormData } from '@/types/order';
import { formatCurrency } from '@/utils/currency';

export function OrderSuccess({
  items,
  form,
  total,
  onNewOrder,
}: {
  items: CartItem[];
  form: CheckoutFormData;
  total: number;
  onNewOrder: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg mx-auto">
      <div className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm mb-6 flex items-center gap-2">
        <span className="text-lg">✓</span>
        <span>¡Pedido confirmado! En breve nos pondremos en contacto para coordinar la entrega.</span>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-1">Resumen del pedido</h2>

      <div className="mt-4 space-y-1 text-sm text-gray-700">
        <p>
          <span className="font-medium text-gray-900">Nombre:</span> {form.name}
        </p>
        <p>
          <span className="font-medium text-gray-900">Teléfono:</span> {form.phone}
        </p>
        <p>
          <span className="font-medium text-gray-900">Entrega:</span>{' '}
          {form.deliveryMethod === 'domicilio' ? 'Envío a domicilio' : 'Retiro en el local'}
        </p>
        {form.deliveryMethod === 'domicilio' && (
          <p>
            <span className="font-medium text-gray-900">Dirección:</span> {form.address}
          </p>
        )}
        {form.notes.trim() && (
          <p>
            <span className="font-medium text-gray-900">Observaciones:</span> {form.notes}
          </p>
        )}
      </div>

      <ul className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
        {items.map((item) => (
          <li key={item.product.id} className="py-2 flex items-center justify-between text-sm">
            <span className="text-gray-700">
              {item.product.name} x{item.quantity}
            </span>
            <span className="text-gray-900 font-medium">
              {formatCurrency(item.product.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
        <span className="font-semibold text-gray-900">Total</span>
        <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
      </div>

      <button
        type="button"
        onClick={onNewOrder}
        className="w-full bg-black text-white rounded-xl py-2.5 font-semibold hover:bg-gray-800 transition mt-6"
      >
        Realizar otro pedido
      </button>
    </div>
  );
}
