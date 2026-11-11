import { useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import { CheckIcon } from '@/components/Icons';
import { CustomerFieldset } from '@/components/mostrador/CustomerFieldset';
import { OrderSummary } from '@/components/mostrador/OrderSummary';
import { ProductCatalog } from '@/components/mostrador/ProductCatalog';
import { useAvailablePromotions } from '@/hooks/useAvailablePromotions';
import { useClientLookup } from '@/hooks/useClientLookup';
import { useMenuProducts } from '@/hooks/useMenuProducts';
import { useOrderLines } from '@/hooks/useOrderLines';
import { fetchCurrentCashShift } from '@/services/cashShiftService';
import { createCounterOrder } from '@/services/orderService';
import type { DeliveryMethod, PaymentMethod } from '@/types/order';
import { buildCounterOrderPayload, validateCounterOrder } from '@/utils/counterOrder';
import type { CounterOrderErrors } from '@/utils/counterOrder';
import { getErrorMessage } from '@/utils/errors';

const CLOSED_CASH_MESSAGE =
  'No se pueden tomar ni facturar pedidos porque la caja no está abierta. Abrí la caja antes de continuar.';

export function TomarPedidoView() {
  // Catálogo y pedido
  const { products, loading: loadingProducts, error: productsError, reload: reloadProducts } = useMenuProducts();
  const { promotions, loading: loadingPromotions, reload: reloadPromotions } = useAvailablePromotions();
  const order = useOrderLines();

  // Datos del cliente
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('retiro');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [isPaid, setIsPaid] = useState(false);
  const [errors, setErrors] = useState<CounterOrderErrors>({});
  const [isShiftOpen, setIsShiftOpen] = useState<boolean | null>(null);
  const clientLookup = useClientLookup(phone, { setName, setAddress });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchCurrentCashShift()
      .then((status) => {
        if (active) setIsShiftOpen(status.is_open);
      })
      .catch(() => {
        if (active) setIsShiftOpen(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const foundClient = clientLookup.lookup.status === 'found' ? clientLookup.lookup.client : null;
  const nameChanged = name.trim() !== '' && name.trim() !== foundClient?.full_name;
  const addressChanged =
    deliveryMethod === 'domicilio' && address.trim() !== '' && address.trim() !== (foundClient?.address ?? '');
  const clientDataChanged = foundClient !== null && (nameChanged || addressChanged);

  const itemAdded = () => {
    setLastOrderId(null);
    setErrors((prev) => ({ ...prev, items: undefined }));
  };

  const resetOrder = () => {
    order.clear();
    setName('');
    setPhone('');
    setDeliveryMethod('retiro');
    setAddress('');
    setNotes('');
    setPaymentMethod(null);
    setIsPaid(false);
    setErrors({});
    setSubmitError(null);
    clientLookup.reset();
  };

  const form = { name, phone, deliveryMethod, address, notes, paymentMethod, isPaid };

  const handleConfirm = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validateCounterOrder(form, order.lines);
    setErrors(nextErrors);
    setSubmitError(null);
    setLastOrderId(null);
    if (Object.keys(nextErrors).length > 0) return;

    if (isShiftOpen === false) {
      setSubmitError(CLOSED_CASH_MESSAGE);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createCounterOrder(buildCounterOrderPayload(form, order.lines));
      resetOrder();
      setLastOrderId(created.id);
      phoneInputRef.current?.focus();
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'No se pudo registrar el pedido. Intentá nuevamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleConfirm} className="flex flex-col gap-4 lg:h-full" noValidate>
      {lastOrderId !== null && (
        <div role="status" className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center gap-2">
          <CheckIcon className="w-5 h-5 text-green-700 shrink-0" />
          <span>
            Pedido <strong>#{lastOrderId}</strong> registrado correctamente. Ya podés tomar el siguiente.
          </span>
        </div>
      )}

      {isShiftOpen === false && (
        <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">Caja cerrada:</span>
            <span>Debés realizar la apertura de la caja antes de poder registrar o facturar pedidos presenciales.</span>
          </div>
        </div>
      )}

      <CustomerFieldset
        phone={phone}
        onPhoneChange={(value) => {
          setPhone(value);
          clientLookup.invalidate();
        }}
        phoneInputRef={phoneInputRef}
        lookup={clientLookup.lookup}
        name={name}
        onNameChange={setName}
        clientDataChanged={clientDataChanged}
        deliveryMethod={deliveryMethod}
        onDeliveryMethodChange={setDeliveryMethod}
        address={address}
        onAddressChange={setAddress}
        notes={notes}
        onNotesChange={setNotes}
        errors={errors}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 gap-4 items-start lg:items-stretch lg:flex-1 lg:min-h-0">
        <ProductCatalog
          products={products}
          promotions={promotions}
          loadingProducts={loadingProducts}
          loadingPromotions={loadingPromotions}
          lines={order.lines}
          error={productsError}
          onRetry={() => {
            reloadProducts();
            reloadPromotions();
          }}
          onAddProduct={(product) => {
            itemAdded();
            order.addProduct(product);
          }}
          onAddPromotion={(promotion) => {
            itemAdded();
            order.addPromotion(promotion);
          }}
        />
        <OrderSummary
          lines={order.lines}
          total={order.total}
          units={order.units}
          itemsError={errors.items}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          isPaid={isPaid}
          onPaidChange={setIsPaid}
          submitError={submitError}
          submitting={submitting}
          shiftClosed={isShiftOpen === false}
          onQuantityChange={order.changeQuantity}
          onRemove={order.removeLine}
          onClear={() => {
            resetOrder();
            setLastOrderId(null);
          }}
        />
      </div>
    </form>
  );
}
