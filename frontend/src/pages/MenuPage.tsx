import { useEffect, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { ProductCard } from '@/components/ProductCard';
import { CartSummary } from '@/components/CartSummary';
import { CheckoutForm } from '@/components/CheckoutForm';
import { OrderSuccess } from '@/components/OrderSuccess';
import { useCart } from '@/hooks/useCart';
import { fetchMenuProducts } from '@/services/menuService';
import { groupByCategory } from '@/utils/productGrouping';
import type { CheckoutFormData, Product, WebOrderCreated } from '@/types/order';

interface SubmittedOrder {
  order: WebOrderCreated;
  form: CheckoutFormData;
}

export default function MenuPage() {
  const { clearCart } = useCart();
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchMenuProducts()
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : null;
        setProductsError(message || 'No pudimos cargar el menú.');
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loadProducts = () => {
    setLoadingProducts(true);
    setProductsError(null);
    setReloadKey((key) => key + 1);
  };

  const productGroups = groupByCategory(products);

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
      <TopBar />
      <main className="flex-1 px-4 py-10">
        {submittedOrder ? (
          <OrderSuccess order={submittedOrder.order} form={submittedOrder.form} onNewOrder={handleNewOrder} />
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nuestro menú</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Elegí tus productos favoritos y armá tu pedido.
                </p>
              </div>

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
                <CheckoutForm onSubmitSuccess={handleOrderCreated} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
