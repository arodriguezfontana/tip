import { Section } from '@/components/orderDetail/DetailLayout';
import { PromoTable, SectorTable } from '@/components/orderDetail/ProductTables';
import { BellIcon } from '@/components/Icons';
import type { AdminOrder, OrderDetail } from '@/types/order';
import { groupItemsBySector } from '@/utils/orderSectors';

function KitchenUpdateAlert({ acknowledging, onAcknowledge }: { acknowledging: boolean; onAcknowledge?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900"
    >
      <span className="inline-flex items-center gap-1.5">
        <BellIcon className="w-4 h-4 text-amber-700 shrink-0" />
        El cliente agregó productos a este pedido (marcados como “Nuevo”).
      </span>
      {onAcknowledge && (
        <button
          type="button"
          onClick={onAcknowledge}
          disabled={acknowledging}
          className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white px-2.5 py-1 transition"
        >
          Visto
        </button>
      )}
    </div>
  );
}

function ProductsContent({
  order,
  detail,
  acknowledging,
  onAcknowledge,
}: {
  order: AdminOrder;
  detail: OrderDetail;
  acknowledging: boolean;
  onAcknowledge?: () => void;
}) {
  const { itemsBySector, promoItems } = groupItemsBySector(detail.items);
  return (
    <div className="space-y-2.5">
      {order.kitchen_update_pending && <KitchenUpdateAlert acknowledging={acknowledging} onAcknowledge={onAcknowledge} />}
      {itemsBySector.map(([sector, items]) => (
        <SectorTable key={sector} sector={sector} items={items} />
      ))}
      {promoItems.length > 0 && <PromoTable promos={promoItems} />}
    </div>
  );
}

interface LoadState {
  simulated: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function ProductsStatus({ simulated, loading, error, onRetry }: LoadState) {
  if (simulated) {
    return <p className="text-sm text-gray-500">El detalle de productos no está disponible en el modo simulación.</p>;
  }
  if (loading) return <p className="text-sm text-gray-500">Cargando productos…</p>;
  return (
    <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between gap-3">
      <span>{error}</span>
      <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline hover:no-underline">
        Reintentar
      </button>
    </div>
  );
}

interface ProductsSectionProps extends LoadState {
  order: AdminOrder;
  detail: OrderDetail | null;
  acknowledging: boolean;
  onAcknowledge?: () => void;
}

/** Productos del pedido (o el estado de la carga) y las aclaraciones del cliente. */
export function ProductsSection({ order, detail, acknowledging, onAcknowledge, ...loadState }: ProductsSectionProps) {
  const isWaitingOrFailed = loadState.simulated || loadState.loading || loadState.error;
  return (
    <Section title="Productos">
      {isWaitingOrFailed ? (
        <ProductsStatus {...loadState} />
      ) : (
        detail && (
          <ProductsContent order={order} detail={detail} acknowledging={acknowledging} onAcknowledge={onAcknowledge} />
        )
      )}
      <div className={`rounded-xl px-4 py-3 text-sm ${order.notes ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-400'}`}>
        <span className="block text-[11px] font-bold uppercase tracking-wide mb-0.5">Aclaraciones del cliente</span>
        <span className="break-words">{order.notes || 'Sin observaciones'}</span>
      </div>
    </Section>
  );
}
