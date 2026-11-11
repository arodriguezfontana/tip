import { useState } from 'react';
import type { SubmitEvent } from 'react';
import type { MovementForm } from '@/hooks/useCashForms';
import type { CashMovement, CreateCashMovementPayload, MovementType } from '@/types/cashShift';
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
        <p className="text-xs text-gray-500 mt-0.5">Asentá entradas o salidas de efectivo no vinculadas a pedidos.</p>
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
            placeholder="Ej. Factura N° 1234, proveedor de verduras..."
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

function MovementTypeBadge({ type }: { type: MovementType }) {
  return type === 'ingreso' ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Ingreso</span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">Egreso</span>
  );
}

function MovementsList({ movements, onDelete }: { movements: CashMovement[]; onDelete: (id: number) => void }) {
  return (
    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900 mb-3">Movimientos de este turno</h2>
      {movements.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12 border border-dashed border-gray-200 rounded-xl">
          No hay movimientos manuales registrados en este turno.
        </p>
      ) : (
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
              {movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-gray-50 transition">
                  <td className="py-2.5 px-2 text-gray-500 whitespace-nowrap">{formatTime(movement.created_at)}</td>
                  <td className="py-2.5 px-2">
                    <MovementTypeBadge type={movement.type} />
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-gray-900">{movement.category}</td>
                  <td className="py-2.5 px-2 text-gray-600 max-w-xs truncate">{movement.description || '-'}</td>
                  <td
                    className={`py-2.5 px-2 text-right font-bold whitespace-nowrap ${
                      movement.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {movement.type === 'ingreso' ? '+' : '-'}
                    {formatCurrency(movement.amount)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => onDelete(movement.id)}
                      title="Anular movimiento"
                      className="text-gray-400 hover:text-red-600 font-bold p-1 transition"
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
    </div>
  );
}

interface MovementsTabProps extends MovementFormCardProps {
  movements: CashMovement[];
  onDelete: (id: number) => void;
}

/** Formulario para asentar movimientos manuales de efectivo y la lista de los del turno. */
export function MovementsTab({ form, onInvalid, onAdd, movements, onDelete }: MovementsTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <MovementFormCard form={form} onInvalid={onInvalid} onAdd={onAdd} />
      <MovementsList movements={movements} onDelete={onDelete} />
    </div>
  );
}
