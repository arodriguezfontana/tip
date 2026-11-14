import { useMemo, useState } from 'react';
import type { SubmitEvent } from 'react';
import type { MovementForm } from '@/hooks/useCashForms';
import type { CashMovement, CreateCashMovementPayload, MovementType, ShiftOrder } from '@/types/cashShift';
import type { PaymentMethod } from '@/types/order';
import { PAYMENT_METHOD_LABEL } from '@/types/order';
import { MOVEMENT_CATEGORIES, OTHER_CATEGORY, parseAmount } from '@/utils/cashShift';
import { formatCurrency } from '@/utils/currency';
import { formatTime } from '@/utils/dateTime';

const LABEL_CLASS = 'block text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1';
const FIELD_CLASS =
  'w-full px-3 py-2 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-black focus:border-black transition';

function TypeButton({
  type,
  selected,
  onSelect,
}: {
  type: MovementType;
  selected: MovementType;
  onSelect: (type: MovementType) => void;
}) {
  const isIncome = type === 'ingreso';
  const selectedClass = isIncome ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected === type}
      onClick={() => onSelect(type)}
      className={`py-2 text-xs font-bold rounded-xl border transition ${
        selected === type ? selectedClass : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {isIncome ? '+ Ingreso' : '− Egreso'}
    </button>
  );
}

interface MovementFormCardProps {
  form: MovementForm;
  onInvalid: (message: string) => void;
  onAdd: (movement: CreateCashMovementPayload) => Promise<boolean>;
}

function MovementFormCard({ form, onInvalid, onAdd }: MovementFormCardProps) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const amount = parseAmount(form.amount);
    if (amount === null || amount <= 0) {
      onInvalid('El monto del movimiento debe ser mayor a 0.');
      return;
    }
    const category = form.category === OTHER_CATEGORY ? form.customCategory.trim() : form.category;
    if (!category) {
      onInvalid('Debés indicar una categoría para el movimiento.');
      return;
    }
    setSaving(true);
    try {
      const saved = await onAdd({
        type: form.type,
        amount,
        category,
        description: form.description.trim() || undefined,
      });
      if (saved) form.reset();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-900">Registrar movimiento manual</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className={LABEL_CLASS}>Tipo de movimiento</label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
            <TypeButton type="ingreso" selected={form.type} onSelect={form.setType} />
            <TypeButton type="egreso" selected={form.type} onSelect={form.setType} />
          </div>
        </div>

        <div>
          <label htmlFor="mov-amount" className={LABEL_CLASS}>
            Monto ($) *
          </label>
          <input
            id="mov-amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => form.setAmount(e.target.value)}
            className={`${FIELD_CLASS} font-medium`}
          />
        </div>

        <div>
          <label htmlFor="mov-category" className={LABEL_CLASS}>
            Categoría *
          </label>
          <select
            id="mov-category"
            value={form.category}
            onChange={(e) => form.setCategory(e.target.value)}
            className={FIELD_CLASS}
          >
            {MOVEMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {form.category === OTHER_CATEGORY && (
            <input
              type="text"
              placeholder="Escribí el motivo o categoría..."
              required
              value={form.customCategory}
              onChange={(e) => form.setCustomCategory(e.target.value)}
              className={`mt-2 ${FIELD_CLASS}`}
            />
          )}
        </div>

        <div>
          <label htmlFor="mov-description" className={LABEL_CLASS}>
            Observaciones / Detalle (opcional)
          </label>
          <input
            id="mov-description"
            type="text"
            placeholder="Ej. Factura N° 1234, proveedor..."
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-black text-white text-sm font-bold hover:bg-gray-800 transition disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Asentar movimiento'}
        </button>
      </form>
    </div>
  );
}

type ShiftDisplayMovementType = 'ingreso' | 'egreso' | 'venta';

interface UnifiedMovementItem {
  id: string;
  rawId: number;
  time: string;
  type: ShiftDisplayMovementType;
  category: string;
  description: string;
  amount: number;
  isManual: boolean;
}

function MovementTypeBadge({ type }: { type: ShiftDisplayMovementType }) {
  if (type === 'ingreso') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Ingreso</span>;
  }
  if (type === 'egreso') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Egreso</span>;
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">Venta</span>;
}

const PAGE_SIZE = 7;

function MovementsList({
  movements,
  orders = [],
  onDelete,
}: {
  movements: CashMovement[];
  orders?: ShiftOrder[];
  onDelete: (id: number) => void;
}) {
  const [filter, setFilter] = useState<'todos' | ShiftDisplayMovementType>('todos');
  const [page, setPage] = useState(1);

  const allItems = useMemo<UnifiedMovementItem[]>(() => {
    const manualItems: UnifiedMovementItem[] = movements.map((m) => ({
      id: `mov-${m.id}`,
      rawId: m.id,
      time: m.created_at,
      type: m.type,
      category: m.category,
      description: m.description || '-',
      amount: m.amount,
      isManual: true,
    }));

    const orderItems: UnifiedMovementItem[] = orders
      .filter((o) => o.is_billable)
      .map((o) => {
        const methodKey = (o.payment_method || '').toLowerCase() as PaymentMethod;
        const methodLabel = PAYMENT_METHOD_LABEL[methodKey] || o.payment_method || 'Efectivo';
        return {
          id: `order-${o.id}`,
          rawId: o.id,
          time: o.created_at,
          type: 'venta',
          category: `Venta (${methodLabel})`,
          description: `Pedido #${o.shift_number || o.id} · ${o.customer_name}`,
          amount: o.total_amount,
          isManual: false,
        };
      });

    return [...manualItems, ...orderItems].sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [movements, orders]);

  const filteredItems = useMemo(() => {
    if (filter === 'todos') return allItems;
    return allItems.filter((item) => item.type === filter);
  }, [allItems, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const counts = useMemo(
    () => ({
      todos: allItems.length,
      ingreso: allItems.filter((i) => i.type === 'ingreso').length,
      egreso: allItems.filter((i) => i.type === 'egreso').length,
      venta: allItems.filter((i) => i.type === 'venta').length,
    }),
    [allItems]
  );

  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">Movimientos del turno</h2>
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filtrar movimientos">
          {(
            [
              { key: 'todos', label: 'Todos', count: counts.todos },
              { key: 'ingreso', label: 'Ingresos', count: counts.ingreso },
              { key: 'egreso', label: 'Egresos', count: counts.egreso },
              { key: 'venta', label: 'Ventas', count: counts.venta },
            ] as const
          ).map((tab) => {
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setFilter(tab.key);
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                  isActive
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12 border border-dashed border-gray-200 rounded-xl">
          No hay movimientos que coincidan con el filtro seleccionado.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500 uppercase tracking-wider">
                  <th className="py-2.5 px-2">Hora</th>
                  <th className="py-2.5 px-2">Tipo</th>
                  <th className="py-2.5 px-2">Categoría</th>
                  <th className="py-2.5 px-2">Detalle</th>
                  <th className="py-2.5 px-2 text-right">Monto</th>
                  <th className="py-2.5 px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition">
                    <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{formatTime(item.time)}</td>
                    <td className="py-2.5 px-2">
                      <MovementTypeBadge type={item.type} />
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-gray-900">{item.category}</td>
                    <td className="py-2.5 px-2 text-gray-600 max-w-xs truncate">{item.description}</td>
                    <td
                      className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${
                        item.type === 'ingreso'
                          ? 'text-emerald-600'
                          : item.type === 'egreso'
                          ? 'text-rose-600'
                          : 'text-blue-600'
                      }`}
                    >
                      {item.type === 'egreso' ? '-' : '+'}
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {item.isManual ? (
                        <button
                          type="button"
                          onClick={() => onDelete(item.rawId)}
                          title="Anular movimiento"
                          className="text-gray-400 hover:text-red-600 font-bold p-1 transition"
                        >
                          ×
                        </button>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span>
              {filteredItems.length} {filteredItems.length === 1 ? 'movimiento' : 'movimientos'}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Página anterior"
                  className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                >
                  &larr;
                </button>
                <span className="font-semibold text-gray-700">
                  {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Página siguiente"
                  className="px-2 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed font-bold"
                >
                  &rarr;
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface MovementsTabProps extends MovementFormCardProps {
  movements: CashMovement[];
  orders?: ShiftOrder[];
  onDelete: (id: number) => void;
}

/** Formulario para asentar movimientos manuales de efectivo y la lista de los del turno. */
export function MovementsTab({ form, onInvalid, onAdd, movements, orders, onDelete }: MovementsTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <MovementFormCard form={form} onInvalid={onInvalid} onAdd={onAdd} />
      <MovementsList movements={movements} orders={orders} onDelete={onDelete} />
    </div>
  );
}
