import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ProductCard } from '@/components/ProductCard';
import { CartSummary } from '@/components/CartSummary';
import { CheckoutForm } from '@/components/CheckoutForm';
import { OrderSuccess } from '@/components/OrderSuccess';
import { CustomerAccountActions } from '@/components/CustomerAccountActions';
import { CustomerAuthModal } from '@/components/CustomerAuthModal';
import type { CustomerAuthMode } from '@/components/CustomerAuthModal';
import { MobileCartBar } from '@/components/MobileCartBar';
import { StoreClosedNotice } from '@/components/StoreClosedNotice';
import { StoreInfoCard } from '@/components/StoreInfoCard';
import { PaymentReturn } from '@/components/PaymentReturn';
import { PizzaMitadYMitadModal } from '@/components/PizzaMitadYMitadModal';
import { PizzaIcon } from '@/components/Icons';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { useMenuProducts } from '@/hooks/useMenuProducts';
import { groupByCategory } from '@/utils/productGrouping';
import { fetchStoreConfig } from '@/services/storeConfigService';
import { applyThemeColor } from '@/utils/theme';
import { clearPendingPaymentOrder, loadPendingPaymentOrder, savePendingPaymentOrder } from '@/utils/pendingPayment';
import { groupWeeklySchedule } from '@/utils/businessHours';
import { getThemeOption, type StoreConfig } from '@/types/storeConfig';
import type { CheckoutFormData, Product, WebOrderCreated } from '@/types/order';

interface SubmittedOrder {
  order: WebOrderCreated;
  form: CheckoutFormData;
}

export default function MenuPage() {
  const { clearCart } = useCart();
  const { user, isCustomer } = useAuth();
  const businessHours = useBusinessHours();
  const storeClosed = businessHours !== null && businessHours.configured && !businessHours.is_open;
  // Los horarios se cargan solo desde la sección Horarios del panel.
  const schedule = businessHours?.configured ? groupWeeklySchedule(businessHours.ranges) : [];
  const [authModalMode, setAuthModalMode] = useState<CustomerAuthMode | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);
  const [halfAndHalfPizzas, setHalfAndHalfPizzas] = useState<Product[] | null>(null);
  // Al volver del checkout de MercadoPago la URL trae el pedido y el resultado del pago.
  const [searchParams, setSearchParams] = useSearchParams();
  const returningOrderId = searchParams.get('pedido');

  const {
    products,
    loading: loadingProducts,
    error: productsError,
    reload: loadProducts,
  } = useMenuProducts('No pudimos cargar el menú.');

  useEffect(() => {
    let cancelled = false;
    fetchStoreConfig()
      .then((data) => {
        if (!cancelled) {
          setStoreConfig(data);
          if (data?.theme_color) {
            applyThemeColor(data.theme_color);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const showingConfirmation = Boolean(submittedOrder || returningOrderId);
  const productGroups = groupByCategory(products);
  const currentTheme = getThemeOption(storeConfig?.theme_color);

  const handleOrderCreated = (order: WebOrderCreated, form: CheckoutFormData) => {
    // Con MercadoPago se sale de la página a pagar: se guarda el pedido para mostrarlo al volver.
    if (order.payment_url) savePendingPaymentOrder({ order, form });
    setSubmittedOrder({ order, form });
    clearCart();
  };

  const handleNewOrder = () => {
    if (returningOrderId) clearPendingPaymentOrder(returningOrderId);
    setSubmittedOrder(null);
    setSearchParams({}, { replace: true });
    loadProducts();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar
        title={storeConfig?.store_name}
        logoUrl={storeConfig?.logo_url}
        themeColor={storeConfig?.theme_color}
        actions={<CustomerAccountActions onLogin={() => setAuthModalMode('login')} />}
      />
      <main className={`flex-1 px-4 py-6 sm:py-10 ${showingConfirmation ? '' : 'pb-24 lg:pb-10'}`}>
        {storeClosed && !showingConfirmation && <StoreClosedNotice status={businessHours} />}
        {submittedOrder ? (
          <OrderSuccess order={submittedOrder.order} form={submittedOrder.form} onNewOrder={handleNewOrder} />
        ) : returningOrderId ? (
          /* El cliente vuelve del checkout de MercadoPago: se le muestra la confirmación con el estado del pago. */
          <PaymentReturn
            orderId={returningOrderId}
            paymentId={searchParams.get('payment_id')}
            status={searchParams.get('status') ?? searchParams.get('collection_status')}
            saved={loadPendingPaymentOrder(returningOrderId)}
            onNewOrder={handleNewOrder}
          />
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nuestro menú</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Elegí tus productos favoritos y armá tu pedido{storeConfig?.store_name ? ` en ${storeConfig.store_name}` : ''}.
                </p>
              </div>

              <StoreInfoCard
                address={storeConfig?.address}
                contactPhone={storeConfig?.contact_phone}
                schedule={schedule}
                accentColor={currentTheme.hex}
              />

              {loadingProducts && products.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12">Cargando menú...</p>
              )}

              {productsError && (
                <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span>{productsError}</span>
                  <button
                    type="button"
                    onClick={loadProducts}
                    className="shrink-0 font-semibold underline hover:no-underline"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {!loadingProducts && !productsError && products.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12">
                  No hay productos disponibles en este momento.
                </p>
              )}

              {productGroups.map((group) => {
                const isPizzaCategory = group.category.name.toLowerCase().includes('pizza');
                const canMakeHalfAndHalf = isPizzaCategory && group.products.length >= 2;

                return (
                  <section key={group.category.id}>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-lg font-bold text-gray-900">{group.category.name}</h2>
                      {canMakeHalfAndHalf && (
                        <button
                          type="button"
                          onClick={() => setHalfAndHalfPizzas(group.products)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-xl border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition shadow-2xs"
                        >
                          <PizzaIcon className="w-4 h-4 shrink-0" /> Armar mitad y mitad
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {group.products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>

            <div id="pedido" tabIndex={-1} className="lg:col-span-1 scroll-mt-4 focus:outline-none">
              {/* En pantallas grandes el panel acompaña al scroll y, si es más alto que la ventana, se desplaza por
                  dentro (así los datos del pedido y el botón siempre se pueden alcanzar). */}
              <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:-m-1 lg:p-1 space-y-4 lg:space-y-5">
                <CartSummary />
                {storeClosed ? (
                  <div className="bg-white rounded-2xl shadow-md p-6 mt-6">
                    <h2 className="text-lg font-bold text-gray-900 mb-2">Pedidos no disponibles</h2>
                    <p className="text-sm text-gray-500">
                      El local está cerrado. Vas a poder hacer tu pedido cuando volvamos a abrir.
                    </p>
                  </div>
                ) : (
                  /* Se remonta al iniciar/cerrar sesión para autocompletar con los datos de la cuenta. */
                  <CheckoutForm
                    key={isCustomer && user ? `customer-${user.id}` : 'guest'}
                    onSubmitSuccess={handleOrderCreated}
                    onRequestAuth={setAuthModalMode}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {!showingConfirmation && !storeClosed && <MobileCartBar targetId="pedido" />}

      {authModalMode && <CustomerAuthModal initialMode={authModalMode} onClose={() => setAuthModalMode(null)} />}

      {halfAndHalfPizzas && (
        <PizzaMitadYMitadModal
          pizzas={halfAndHalfPizzas}
          onClose={() => setHalfAndHalfPizzas(null)}
        />
      )}
    </div>
  );
}
