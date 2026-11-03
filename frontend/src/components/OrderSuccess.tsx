import type { ReactNode } from 'react';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import type { CheckoutFormData, WebOrderCreated } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { CheckIcon } from '@/components/Icons';

export function OrderSuccess({
  order,
  form,
  onNewOrder,
  banner,
}: {
  order: WebOrderCreated;
  form: CheckoutFormData;
  onNewOrder: () => void;
  /** Aviso que reemplaza al de "pedido recibido" (por ejemplo, el estado del pago al volver de MercadoPago). */
  banner?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg mx-auto">
      {banner ? (
        banner
      ) : order.payment_url ? (
        <div role="status" className="rounded-xl bg-sky-50 text-sky-800 px-4 py-3 text-sm mb-6">
          <p>Recibimos tu pedido y ya lo estamos preparando. Te estamos llevando a MercadoPago para que lo pagues...</p>
          <p className="mt-1">
            Si no se abre solo,{' '}
            <a href={order.payment_url} className="font-semibold underline hover:no-underline">
              tocá acá para pagar
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm mb-6 flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-green-700 shrink-0" />
          <span>¡Recibimos tu pedido y ya lo estamos preparando!</span>
        </div>
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">Pedido #{order.id}</h2>

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
        <p>
          <span className="font-medium text-gray-900">Pago:</span> {PAYMENT_METHOD_LABEL[form.paymentMethod]}
        </p>
        {form.notes.trim() && (
          <p>
            <span className="font-medium text-gray-900">Observaciones:</span> {form.notes}
          </p>
        )}
      </div>

      <ul className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
        {order.items.map((item) => (
          <li key={item.product_id} className="py-2 flex items-center justify-between text-sm">
            <span className="text-gray-700">
              {item.product_name} x{item.quantity}
            </span>
            <span className="text-gray-900 font-medium">{formatCurrency(item.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
        <span className="font-semibold text-gray-900">Total</span>
        <span className="font-bold text-gray-900">{formatCurrency(order.total_amount)}</span>
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
