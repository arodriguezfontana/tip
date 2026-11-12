import type { RefObject } from 'react';
import { CheckIcon } from '@/components/Icons';
import type { ClientLookup } from '@/hooks/useClientLookup';
import { INPUT_FULL_CLASS as INPUT_CLASS } from '@/styles/forms';
import type { DeliveryMethod } from '@/types/order';
import type { CounterOrderErrors } from '@/utils/counterOrder';

const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string }[] = [
  { value: 'retiro', label: 'Retira en el local' },
  { value: 'domicilio', label: 'Envío a domicilio' },
];

function LookupStatus({ lookup }: { lookup: ClientLookup }) {
  return (
    <p id="tp-phone-status" aria-live="polite" className="text-xs mt-1 min-h-4">
      {lookup.status === 'searching' && <span className="text-gray-500">Buscando cliente…</span>}
      {lookup.status === 'found' && (
        <span className="text-green-700 inline-flex items-center gap-1">
          <CheckIcon className="w-3.5 h-3.5 shrink-0" />
          Cliente registrado: datos completados.
        </span>
      )}
      {lookup.status === 'new' && <span className="text-gray-500">Cliente nuevo: se registrará al confirmar.</span>}
      {lookup.status === 'error' && (
        <span className="text-amber-700">No se pudo buscar el cliente. Completá los datos a mano.</span>
      )}
    </p>
  );
}

interface CustomerFieldsetProps {
  phone: string;
  onPhoneChange: (phone: string) => void;
  phoneInputRef: RefObject<HTMLInputElement | null>;
  lookup: ClientLookup;
  name: string;
  onNameChange: (name: string) => void;
  /** El cliente ya registrado quedó con datos distintos a los guardados: se actualizan al confirmar. */
  clientDataChanged: boolean;
  deliveryMethod: DeliveryMethod;
  onDeliveryMethodChange: (method: DeliveryMethod) => void;
  address: string;
  onAddressChange: (address: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  errors: CounterOrderErrors;
}

/** Datos del cliente del pedido: teléfono (con búsqueda), nombre, tipo de entrega, dirección y observaciones. */
export function CustomerFieldset({ phoneInputRef, ...props }: CustomerFieldsetProps) {
  const { errors, deliveryMethod } = props;
  const isDelivery = deliveryMethod === 'domicilio';
  return (
    <fieldset className="bg-white rounded-2xl shadow-md p-5 shrink-0">
      <legend className="sr-only">Datos del cliente</legend>
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3">Datos del cliente</h2>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <label htmlFor="tp-phone" className="block text-xs font-medium text-gray-600 mb-1">
            Teléfono *
          </label>
          <input
            id="tp-phone"
            ref={phoneInputRef}
            type="tel"
            value={props.phone}
            onChange={(e) => props.onPhoneChange(e.target.value)}
            aria-describedby="tp-phone-status"
            className={INPUT_CLASS}
          />
          {errors.phone ? <p className="text-xs text-red-600 mt-1">{errors.phone}</p> : <LookupStatus lookup={props.lookup} />}
        </div>

        <div className="md:col-span-4">
          <label htmlFor="tp-name" className="block text-xs font-medium text-gray-600 mb-1">
            Nombre *
          </label>
          <input
            id="tp-name"
            type="text"
            value={props.name}
            onChange={(e) => props.onNameChange(e.target.value)}
            className={INPUT_CLASS}
          />
          {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          {props.clientDataChanged && (
            <p className="text-xs text-blue-700 mt-1">
              Modificaste los datos del cliente: se actualizarán al confirmar el pedido.
            </p>
          )}
        </div>

        <div className="md:col-span-5">
          <span className="block text-xs font-medium text-gray-600 mb-1">Tipo de entrega *</span>
          <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm" role="radiogroup">
            {DELIVERY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={deliveryMethod === value}
                onClick={() => props.onDeliveryMethodChange(value)}
                style={deliveryMethod === value ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
                className={`flex-1 py-2 font-medium transition ${
                  deliveryMethod === value ? 'text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-6">
          <label htmlFor="tp-address" className="block text-xs font-medium text-gray-600 mb-1">
            Dirección {isDelivery ? '*' : '(solo para envíos)'}
          </label>
          <input
            id="tp-address"
            type="text"
            value={props.address}
            disabled={!isDelivery}
            onChange={(e) => props.onAddressChange(e.target.value)}
            className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
          />
          {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
        </div>

        <div className="md:col-span-6">
          <label htmlFor="tp-notes" className="block text-xs font-medium text-gray-600 mb-1">
            Observaciones
          </label>
          <input
            id="tp-notes"
            type="text"
            value={props.notes}
            onChange={(e) => props.onNotesChange(e.target.value)}
            placeholder="Ej: sin cebolla, timbre 2B…"
            className={INPUT_CLASS}
          />
        </div>
      </div>
    </fieldset>
  );
}
