import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { ProductCard } from '@/components/ProductCard';
import { PromotionCard } from '@/components/PromotionCard';
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
import { PizzaIcon, SearchIcon } from '@/components/Icons';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useAvailablePromotions } from '@/hooks/useAvailablePromotions';
import { useBusinessHours } from '@/hooks/useBusinessHours';
import { useMenuProducts } from '@/hooks/useMenuProducts';
import { useStoreConfig } from '@/hooks/useStoreConfig';
import { groupByCategory } from '@/utils/productGrouping';
import { clearPendingPaymentOrder, loadPendingPaymentOrder, savePendingPaymentOrder } from '@/utils/pendingPayment';
import { groupWeeklySchedule } from '@/utils/businessHours';
import { getThemeOption } from '@/types/storeConfig';
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
  const { storeConfig } = useStoreConfig();
  const { promotions, reload: loadPromos } = useAvailablePromotions();
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

  const showingConfirmation = Boolean(submittedOrder || returningOrderId);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRestriction, setSelectedRestriction] = useState<string>('all');

  const categories = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>();
    for (const p of products) {
      if (p.category && !map.has(p.category.id)) {
        map.set(p.category.id, p.category);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const availableRestrictions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const r of p.dietary_restrictions ?? []) {
        if (r && r.trim()) set.add(r.trim());
      }
    }
    ['vegetariano', 'vegano', 'sin TACC'].forEach((def) => set.add(def));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const restriction = selectedRestriction.toLowerCase().trim();

    return products.filter((product) => {
      if (term) {
        const name = product.name.toLowerCase();
        const desc = (product.description ?? '').toLowerCase();
        const cat = (product.category?.name ?? '').toLowerCase();
        const rest = (product.dietary_restrictions ?? []).join(' ').toLowerCase();
        if (!name.includes(term) && !desc.includes(term) && !cat.includes(term) && !rest.includes(term)) {
          return false;
        }
      }

      if (selectedCategory === 'promociones') {
        return false;
      }

      if (selectedCategory !== 'all' && String(product.category?.id) !== selectedCategory) {
        return false;
      }

      if (selectedRestriction !== 'all') {
        const hasMatch = (product.dietary_restrictions ?? []).some(
          (r) => r.toLowerCase().trim() === restriction || r.toLowerCase().trim().includes(restriction)
        );
        if (!hasMatch) return false;
      }

      return true;
    });
  }, [products, search, selectedCategory, selectedRestriction]);

  const productGroups = useMemo(() => groupByCategory(filteredProducts), [filteredProducts]);

  const filteredPromotions = useMemo(() => {
    if (selectedCategory !== 'all' && selectedCategory !== 'promociones') {
      return [];
    }
    if (selectedRestriction !== 'all') {
      return [];
    }
    const term = search.trim().toLowerCase();
    if (!term) return promotions;
    return promotions.filter(
      (promo) =>
        promo.name.toLowerCase().includes(term) ||
        Boolean(promo.description?.toLowerCase().includes(term))
    );
  }, [promotions, search, selectedCategory, selectedRestriction]);

  const hasActiveFilters = Boolean(search.trim() || selectedCategory !== 'all' || selectedRestriction !== 'all');

  const handleClearFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setSelectedRestriction('all');
  };

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
    loadPromos();
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

              {/* Barra de Búsqueda y Filtros */}
              {!loadingProducts && products.length > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 space-y-3">
                  {/* Fila del buscador a ancho completo para que la frase se lea completa sin cortarse */}
                  <div className="relative w-full">
                    <SearchIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      aria-label="Buscar producto"
                      placeholder="Buscar por nombre, descripción o ingrediente..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9.5 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-400 transition"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 font-bold text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                    <select
                      aria-label="Filtrar por categoría"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black flex-1"
                    >
                      <option value="all">Todas las categorías</option>
                      {promotions.length > 0 && <option value="promociones">Promociones</option>}
                      {categories.map((cat) => (
                        <option key={cat.id} value={String(cat.id)}>
                          {cat.name}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Filtrar por restricción"
                      value={selectedRestriction}
                      onChange={(e) => setSelectedRestriction(e.target.value)}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black flex-1"
                    >
                      <option value="all">Todas las restricciones</option>
                      {availableRestrictions.map((res) => (
                        <option key={res} value={res}>
                          {res}
                        </option>
                      ))}
                    </select>

                    {hasActiveFilters && (
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-1 shrink-0 underline"
                      >
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                </div>
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

              {/* Sección de Promociones vigentes */}
              {filteredPromotions.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-lg font-bold text-gray-900">Promociones</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredPromotions.map((promo) => (
                      <PromotionCard key={promo.id} promotion={promo} />
                    ))}
                  </div>
                </section>
              )}

              {!loadingProducts && !productsError && products.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12">
                  No hay productos disponibles en este momento.
                </p>
              )}

              {!loadingProducts && !productsError && products.length > 0 && filteredProducts.length === 0 && filteredPromotions.length === 0 && (
                <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-8 text-center space-y-3">
                  <p className="text-sm font-semibold text-gray-700">
                    No encontramos platos ni productos que coincidan con los filtros.
                  </p>
                  <p className="text-xs text-gray-500">
                    Probá cambiando el término de búsqueda o quitando las restricciones.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="inline-flex items-center text-xs font-semibold px-4 py-2 rounded-xl bg-black text-white hover:bg-gray-800 transition"
                  >
                    Restablecer filtros
                  </button>
                </div>
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
                          style={{ backgroundColor: 'var(--primary-color, #18181b)' }}
                          className="inline-flex items-center gap-1.5 text-white rounded-xl px-4 py-1.5 text-sm font-semibold hover:opacity-90 transition shadow-xs"
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
