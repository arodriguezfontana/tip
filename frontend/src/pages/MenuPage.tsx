import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { ProductCard } from '@/components/ProductCard';
import { CartSummary } from '@/components/CartSummary';
import { CheckoutForm } from '@/components/CheckoutForm';
import { OrderSuccess } from '@/components/OrderSuccess';
import { useCart } from '@/hooks/useCart';
import { mockProducts, groupByCategory } from '@/data/mockProducts';
import type { CartItem, CheckoutFormData } from '@/types/order';

interface SubmittedOrder {
  items: CartItem[];
  form: CheckoutFormData;
  total: number;
}

export default function MenuPage() {
  const { items, total, clearCart } = useCart();
  const [submittedOrder, setSubmittedOrder] = useState<SubmittedOrder | null>(null);

  const productGroups = groupByCategory(mockProducts);

  const handleNewOrder = () => {
    clearCart();
    setSubmittedOrder(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TopBar />
      <main className="flex-1 px-4 py-10">
        {submittedOrder ? (
          <OrderSuccess
            items={submittedOrder.items}
            form={submittedOrder.form}
            total={submittedOrder.total}
            onNewOrder={handleNewOrder}
          />
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-8">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Nuestro menú</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Elegí tus productos favoritos y armá tu pedido.
                </p>
              </div>

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
                <CheckoutForm
                  onSubmitSuccess={(form) => setSubmittedOrder({ items, form, total })}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
