import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { fetchMenuProducts } from '@/services/menuService';
import { createCounterOrder } from '@/services/orderService';
import { MAX_QUANTITY_PER_ITEM } from '@/types/order';
import type { CartItem, DeliveryMethod, Product } from '@/types/order';
import { formatCurrency } from '@/utils/currency';
import { groupByCategory } from '@/utils/productGrouping';
import { PHONE_PATTERN, getErrorMessage } from '@/utils/customerValidation';

const ALL_CATEGORIES = 'all';

const INPUT_CLASS =
  'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black';

interface CustomerFormErrors {
  name?: string;
  phone?: string;
  address?: string;
  items?: string;
}

export function TomarPedidoView() {
  // Catálogo
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<number | typeof ALL_CATEGORIES>(ALL_CATEGORIES);
  const [search, setSearch] = useState('');

  // Pedido
  const [lines, setLines] = useState<CartItem[]>([]);

  // Datos del cliente
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('retiro');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<CustomerFormErrors>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    fetchMenuProducts()
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((err) => {
        if (!cancelled) setProductsError(getErrorMessage(err, 'No se pudo cargar el menú.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reloadProducts = () => {
    setLoadingProducts(true);
    setProductsError(null);
    setReloadKey((key) => key + 1);
  };

  const categories = useMemo(() => groupByCategory(products).map((group) => group.category), [products]);

  const visibleGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = products.filter(
      (product) =>
        (activeCategory === ALL_CATEGORIES || product.category.id === activeCategory) &&
        (!term || product.name.toLowerCase().includes(term))
    );
    return groupByCategory(filtered);
  }, [products, activeCategory, search]);

  const quantityByProduct = useMemo(
    () => new Map(lines.map((line) => [line.product.id, line.quantity])),
    [lines]
  );

  const total = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);

  const addProduct = (product: Product) => {
    setLastOrderId(null);
    setErrors((prev) => ({ ...prev, items: undefined }));
    setLines((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        return prev.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, MAX_QUANTITY_PER_ITEM) }
            : line
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const changeQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeProduct(productId);
      return;
    }
    setLines((prev) =>
      prev.map((line) =>
        line.product.id === productId ? { ...line, quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM) } : line
      )
    );
  };

  const removeProduct = (productId: number) => {
    setLines((prev) => prev.filter((line) => line.product.id !== productId));
  };

  const resetOrder = () => {
    setLines([]);
    setName('');
    setPhone('');
    setDeliveryMethod('retiro');
    setAddress('');
    setNotes('');
    setErrors({});
    setSubmitError(null);
  };

  const validate = (): CustomerFormErrors => {
    const nextErrors: CustomerFormErrors = {};
    if (!name.trim()) nextErrors.name = 'Ingresá el nombre del cliente.';
    if (!phone.trim()) {
      nextErrors.phone = 'Ingresá el teléfono.';
    } else if (!PHONE_PATTERN.test(phone.trim())) {
      nextErrors.phone = 'Teléfono inválido (solo números, espacios, guiones o +).';
    }
    if (deliveryMethod === 'domicilio' && !address.trim()) {
      nextErrors.address = 'La dirección es obligatoria para envíos a domicilio.';
    }
    if (lines.length === 0) nextErrors.items = 'Agregá al menos un producto al pedido.';
    return nextErrors;
  };

  const handleConfirm = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    setSubmitError(null);
    setLastOrderId(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const order = await createCounterOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        delivery_method: deliveryMethod,
        shipping_address: deliveryMethod === 'domicilio' ? address.trim() : null,
        notes: notes.trim() || null,
        items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      });
      resetOrder();
      setLastOrderId(order.id);
      nameInputRef.current?.focus();
    } catch (err) {
      setSubmitError(getErrorMessage(err, 'No se pudo registrar el pedido. Intentá nuevamente.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleConfirm} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center justify-between bg-white px-5 py-3 rounded-2xl shadow-xs border border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
          <span className="text-sm font-semibold text-gray-800">Tomar pedido presencial</span>
        </div>
        <span className="text-xs text-gray-500">
          Los pedidos cargados acá entran confirmados al panel de comandas.
        </span>
      </div>

      {lastOrderId !== null && (
        <div role="status" className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center gap-2">
          <span className="text-lg">✓</span>
          <span>
            Pedido <strong>#{lastOrderId}</strong> registrado correctamente. Ya podés tomar el siguiente.
          </span>
        </div>
      )}

      {/* Datos del cliente */}
      <fieldset className="bg-white rounded-2xl shadow-md p-5">
        <legend className="sr-only">Datos del cliente</legend>
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3">Datos del cliente</h2>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label htmlFor="tp-name" className="block text-xs font-medium text-gray-600 mb-1">
              Nombre *
            </label>
            <input
              id="tp-name"
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div className="md:col-span-3">
            <label htmlFor="tp-phone" className="block text-xs font-medium text-gray-600 mb-1">
              Teléfono *
            </label>
            <input
              id="tp-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={INPUT_CLASS}
            />
            {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div className="md:col-span-5">
            <span className="block text-xs font-medium text-gray-600 mb-1">Tipo de entrega *</span>
            <div className="flex rounded-xl border border-gray-300 overflow-hidden text-sm" role="radiogroup">
              {(
                [
                  ['retiro', 'Retira en el local'],
                  ['domicilio', 'Envío a domicilio'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={deliveryMethod === value}
                  onClick={() => setDeliveryMethod(value)}
                  className={`flex-1 py-2 font-medium transition ${
                    deliveryMethod === value ? 'bg-black text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-6">
            <label htmlFor="tp-address" className="block text-xs font-medium text-gray-600 mb-1">
              Dirección {deliveryMethod === 'domicilio' ? '*' : '(solo para envíos)'}
            </label>
            <input
              id="tp-address"
              type="text"
              value={address}
              disabled={deliveryMethod !== 'domicilio'}
              onChange={(e) => setAddress(e.target.value)}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: sin cebolla, timbre 2B…"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Catálogo */}
        <section className="lg:col-span-7 bg-white rounded-2xl shadow-md p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">Productos</h2>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Enter en el buscador no debe confirmar el pedido.
                if (e.key === 'Enter') e.preventDefault();
              }}
              placeholder="Buscar producto…"
              aria-label="Buscar producto"
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[{ id: ALL_CATEGORIES, name: 'Todas' } as const, ...categories].map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  activeCategory === category.id
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>

          {loadingProducts && products.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12">Cargando menú...</p>
          )}

          {productsError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
              <span>{productsError}</span>
              <button type="button" onClick={reloadProducts} className="shrink-0 font-semibold underline hover:no-underline">
                Reintentar
              </button>
            </div>
          )}

          {!loadingProducts && !productsError && visibleGroups.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12">No hay productos que coincidan.</p>
          )}

          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {visibleGroups.map((group) => (
              <div key={group.category.id}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{group.category.name}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                  {group.products.map((product) => {
                    const quantity = quantityByProduct.get(product.id) ?? 0;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addProduct(product)}
                        disabled={quantity >= MAX_QUANTITY_PER_ITEM}
                        title={`Agregar ${product.name}`}
                        className={`relative flex flex-col items-center text-center gap-1.5 rounded-xl border p-3 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                          quantity > 0
                            ? 'border-black bg-gray-50'
                            : 'border-gray-200 bg-white hover:border-gray-400 hover:shadow-md'
                        }`}
                      >
                        {quantity > 0 && (
                          <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center">
                            {quantity}
                          </span>
                        )}
                        <CategoryIcon category={product.category.name} size="sm" />
                        <span className="text-xs font-semibold text-gray-900 leading-tight">{product.name}</span>
                        <span className="text-xs text-gray-600">{formatCurrency(product.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Resumen del pedido */}
        <section className="lg:col-span-5 bg-white rounded-2xl shadow-md p-4 lg:sticky lg:top-6 flex flex-col">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3">Resumen del pedido</h2>

          {lines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">
              Hacé click en un producto para agregarlo.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
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
                  {lines.map((line) => (
                    <tr key={line.product.id}>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => changeQuantity(line.product.id, line.quantity - 1)}
                            aria-label={`Restar una unidad de ${line.product.name}`}
                            className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
                          >
                            −
                          </button>
                          <span className="w-6 text-center font-semibold">{line.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(line.product.id, line.quantity + 1)}
                            disabled={line.quantity >= MAX_QUANTITY_PER_ITEM}
                            aria-label={`Sumar una unidad de ${line.product.name}`}
                            className="w-6 h-6 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-1 text-gray-900">{line.product.name}</td>
                      <td className="py-2 px-1 text-right text-gray-600 whitespace-nowrap">
                        {formatCurrency(line.product.price)}
                      </td>
                      <td className="py-2 px-1 text-right font-semibold text-gray-900 whitespace-nowrap">
                        {formatCurrency(line.product.price * line.quantity)}
                      </td>
                      <td className="py-2 px-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeProduct(line.product.id)}
                          aria-label={`Eliminar ${line.product.name} del pedido`}
                          className="w-6 h-6 rounded-lg text-gray-400 hover:text-red-600 transition"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.items && <p className="text-xs text-red-600 mt-2">{errors.items}</p>}

          <div className="mt-4 pt-4 border-t border-gray-200 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>
                Unidades: {units} · Productos: {lines.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-gray-900">TOTAL</span>
              <span className="text-2xl font-bold text-gray-900">{formatCurrency(total)}</span>
            </div>
          </div>

          {submitError && (
            <div role="alert" className="mt-3 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetOrder();
                setLastOrderId(null);
              }}
              disabled={submitting}
              className="px-4 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition disabled:opacity-50"
            >
              Limpiar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 font-bold transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Registrando...' : 'Confirmar pedido'}
            </button>
          </div>
        </section>
      </div>
    </form>
  );
}
