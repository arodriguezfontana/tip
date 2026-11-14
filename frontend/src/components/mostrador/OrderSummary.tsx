import { COUNTER_PAYMENT_METHODS, MAX_QUANTITY_PER_ITEM, PAYMENT_METHOD_LABEL } from '@/types/order';
import type { CartItem, PaymentMethod } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { orderLineKey } from '@/hooks/useOrderLines';

interface SummaryLineProps {
  line: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

function SummaryLine({ line, onQuantityChange, onRemove }: SummaryLineProps) {
  const isPromo = Boolean(line.promotion);
  const name = line.promotion ? line.promotion.name : line.product.name;
  const price = line.promotion ? line.promotion.price : line.product.price;
  return (
    <tr
      style={
        isPromo
          ? {
              backgroundColor: 'var(--primary-light, #f4f4f5)',
            }
          : undefined
      }
    >
      <td className="py-2 px-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onQuantityChange(line.quantity - 1)}
            aria-label={`Restar una unidad de ${name}`}
            className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition flex items-center justify-center font-bold"
          >
            −
          </button>
          <span className="w-6 text-center font-semibold">{line.quantity}</span>
          <button
            type="button"
            onClick={() => onQuantityChange(line.quantity + 1)}
            disabled={line.quantity >= MAX_QUANTITY_PER_ITEM}
            aria-label={`Sumar una unidad de ${name}`}
            className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold"
          >
            +
          </button>
        </div>
      </td>
      <td className="py-2 px-1 text-gray-900">
        <div className="flex items-center gap-1.5 flex-wrap">
          {isPromo && (
            <span
              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border"
              style={{
                backgroundColor: 'var(--primary-light, #f4f4f5)',
                borderColor: 'var(--primary-border, #e4e4e7)',
                color: 'var(--primary-text, #18181b)',
              }}
            >
              Promo
            </span>
          )}
          <span>{name}</span>
        </div>
      </td>
      <td className="py-2 px-1 text-right text-gray-600 whitespace-nowrap">{formatCurrency(price)}</td>
      <td className="py-2 px-1 text-right font-semibold text-gray-900 whitespace-nowrap">
        {formatCurrency(price * line.quantity)}
      </td>
      <td className="py-2 px-1 text-right">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Eliminar ${name} del pedido`}
          className="w-6 h-6 rounded-lg text-gray-400 hover:text-red-600 transition"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function PaymentSelector({
  method,
  isPaid,
  onMethodChange,
  onPaidChange,
}: {
  method: PaymentMethod | null;
  isPaid: boolean;
  onMethodChange: (method: PaymentMethod | null) => void;
  onPaidChange: (isPaid: boolean) => void;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
      <div className="flex flex-1 min-w-48 rounded-xl border border-gray-300 overflow-hidden text-xs" role="radiogroup" aria-label="Método de pago">
        {COUNTER_PAYMENT_METHODS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={method === option}
            // Un segundo clic lo deja sin especificar.
            onClick={() => onMethodChange(method === option ? null : option)}
            style={method === option ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
            className={`flex-1 py-1.5 font-medium transition ${
              method === option ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {PAYMENT_METHOD_LABEL[option]}
          </button>
        ))}
      </div>
      <label className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isPaid}
          onChange={(e) => onPaidChange(e.target.checked)}
          className="w-4 h-4 accent-black"
        />
        Ya abonado
      </label>
    </div>
  );
}

interface OrderSummaryProps {
  lines: CartItem[];
  total: number;
  units: number;
  itemsError?: string;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod | null) => void;
  isPaid: boolean;
  onPaidChange: (isPaid: boolean) => void;
  submitError: string | null;
  submitting: boolean;
  shiftClosed: boolean;
  onQuantityChange: (lineKey: string, quantity: number) => void;
  onRemove: (lineKey: string) => void;
  onClear: () => void;
}

/** Resumen del pedido que se está cargando: sus líneas, el medio de pago, el total y los botones de confirmar. */
export function OrderSummary(props: OrderSummaryProps) {
  const { lines, submitting, shiftClosed } = props;
  return (
    <section className="lg:col-span-5 bg-white rounded-2xl shadow-md p-4 flex flex-col lg:min-h-0 lg:overflow-y-auto">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3">Resumen del pedido</h2>

      {lines.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">
          Hacé click en un producto para agregarlo.
        </p>
      ) : (
        <div className="overflow-auto -mx-1 lg:flex-1 lg:min-h-28">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="text-left font-semibold py-2 px-1">Cant.</th>
                <th className="text-left font-semibold py-2 px-1">Producto</th>
                <th className="text-right font-semibold py-2 px-1">P. unit.</th>
                <th className="text-right font-semibold py-2 px-1">Total</th>
                <th className="py-2 px-1">
                  <span className="sr-only">Quitar</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line) => {
                const lineKey = orderLineKey(line);
                return (
                  <SummaryLine
                    key={lineKey}
                    line={line}
                    onQuantityChange={(quantity) => props.onQuantityChange(lineKey, quantity)}
                    onRemove={() => props.onRemove(lineKey)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {props.itemsError && <p className="text-xs text-red-600 mt-2">{props.itemsError}</p>}

      <PaymentSelector
        method={props.paymentMethod}
        isPaid={props.isPaid}
        onMethodChange={props.onPaymentMethodChange}
        onPaidChange={props.onPaidChange}
      />

      <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>
            Unidades: {props.units} · Productos: {lines.length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">TOTAL</span>
          <span className="text-2xl font-bold text-gray-900">{formatCurrency(props.total)}</span>
        </div>
      </div>

      {props.submitError && (
        <div role="alert" className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {props.submitError}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={props.onClear}
          disabled={submitting}
          className="px-4 py-3 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
        >
          Limpiar
        </button>
        <button
          type="submit"
          disabled={submitting || shiftClosed}
          title={shiftClosed ? 'Debés abrir la caja para confirmar pedidos' : undefined}
          className="flex-1 min-w-40 bg-green-600 hover:bg-green-700 active:scale-[0.99] text-white rounded-xl py-3 font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />
              <span>Registrando...</span>
            </>
          ) : (
            'Confirmar pedido'
          )}
        </button>
      </div>
    </section>
  );
}
