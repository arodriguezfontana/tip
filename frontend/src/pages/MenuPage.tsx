import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { ProductCard } from '@/components/ProductCard';
import { CartSummary } from '@/components/CartSummary';
import { CheckoutForm } from '@/components/CheckoutForm';
import { OrderSuccess } from '@/components/OrderSuccess';
import { CustomerAccountActions } from '@/components/CustomerAccountActions';
import { CustomerAuthModal } from '@/components/CustomerAuthModal';
import type { CustomerAuthMode } from '@/components/CustomerAuthModal';
import { StoreClosedNotice } from '@/components/StoreClosedNotice';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { useMenuProducts } from '@/hooks/useMenuProducts';
import { groupByCategory } from '@/utils/productGrouping';
import { fetchStoreConfig } from '@/services/storeConfigService';
import { applyThemeColor } from '@/utils/theme';
import { THEME_OPTIONS, type StoreConfig } from '@/types/storeConfig';
import type { CheckoutFormData, WebOrderCreated } from '@/types/order';

interface SubmittedOrder {
  order: WebOrderCreated;
  form: CheckoutFormData;
}

export default function MenuPage() {
  const { clearCart } = useCart();
  const { user, isCustomer } = useAuth();
  const businessHours = useBusinessHours();
  const storeClosed = businessHours !== null && businessHours.configured && !businessHours.is_open;
  const [authModalMode, setAuthModalMode] = useState<CustomerAuthMode | null>(null);
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);

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

  const productGroups = groupByCategory(products);
  const currentTheme = THEME_OPTIONS[storeConfig?.theme_color || 'black'] || THEME_OPTIONS.black;

  const handleOrderCreated = (order: WebOrderCreated, form: CheckoutFormData) => {
    setSubmittedOrder({ order, form });
    clearCart();
  };

  const handleNewOrder = () => {
    setSubmittedOrder(null);
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
      <main className="flex-1 px-4 py-10">
        {storeClosed && !submittedOrder && <StoreClosedNotice status={businessHours} />}
        {submittedOrder ? (
          <OrderSuccess order={submittedOrder.order} form={submittedOrder.form} onNewOrder={handleNewOrder} />
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nuestro menú</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Elegí tus productos favoritos y armá tu pedido{storeConfig?.store_name ? ` en ${storeConfig.store_name}` : ''}.
                </p>
              </div>

              {(storeConfig?.address || storeConfig?.opening_hours || storeConfig?.contact_phone) && (
                <section
                  aria-label="Información de contacto del local"
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div
                    className="h-1.5 w-full transition-colors duration-200"
                    style={{ backgroundColor: currentTheme.hex }}
                  />
                  <div className="p-4 sm:p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {storeConfig.address && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                            style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                              Dirección
                            </span>
                            <span className="text-sm font-semibold text-gray-900 break-words block">
                              {storeConfig.address}
                            </span>
                          </div>
                        </div>
                      )}

                      {storeConfig.opening_hours && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                            style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                              Horarios
                            </span>
                            <span className="text-sm font-semibold text-gray-900 break-words block">
                              {storeConfig.opening_hours}
                            </span>
                          </div>
                        </div>
                      )}

                      {storeConfig.contact_phone && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs"
                            style={{ backgroundColor: `${currentTheme.hex}18`, color: currentTheme.hex }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">
                              Teléfonos
                            </span>
                            <a
                              href={`tel:${storeConfig.contact_phone.split('/')[0].trim()}`}
                              className="text-sm font-bold text-gray-900 hover:underline break-words block"
                            >
                              {storeConfig.contact_phone}
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

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

              {productGroups.map((group) => (
                <section key={group.category.id}>
                  <h2 className="text-lg font-bold text-gray-900 mb-3">{group.category.name}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {group.products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
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

      {authModalMode && <CustomerAuthModal initialMode={authModalMode} onClose={() => setAuthModalMode(null)} />}
    </div>
  );
}
