import { useEffect, useState } from 'react';
import { fetchBusinessHours, updateBusinessHours } from '@/services/businessHoursService';
import type { BusinessHoursRange, BusinessHoursStatus } from '@/types/businessHours';
import { DAY_NAMES, groupRangesByDay } from '@/utils/businessHours';
import { getErrorMessage } from '@/utils/customerValidation';

interface EditableRange {
  opens_at: string;
  closes_at: string;
}

/** Franjas por día de la semana (índice 0 = lunes). Un día sin franjas está cerrado. */
type WeekDraft = EditableRange[][];

const NEW_RANGE: EditableRange = { opens_at: '12:00', closes_at: '23:00' };

function toDraft(ranges: BusinessHoursRange[]): WeekDraft {
  return groupRangesByDay(ranges).map((day) =>
    day.ranges.map(({ opens_at, closes_at }) => ({ opens_at, closes_at }))
  );
}

function toRanges(draft: WeekDraft): BusinessHoursRange[] {
  return draft.flatMap((ranges, day) => ranges.map((range) => ({ day_of_week: day, ...range })));
}

function validateDraft(draft: WeekDraft): string | null {
  const ranges = toRanges(draft);
  if (ranges.length === 0) return 'Cargá al menos una franja horaria de atención.';
  if (ranges.some((range) => !range.opens_at || !range.closes_at)) {
    return 'Completá la hora de apertura y de cierre de todas las franjas.';
  }
  if (ranges.some((range) => range.opens_at === range.closes_at)) {
    return 'La hora de apertura y la de cierre de una franja no pueden ser iguales.';
  }
  return null;
}

function StatusSummary({ status }: { status: BusinessHoursStatus }) {
  if (!status.configured) {
    return (
      <p className="text-xs text-gray-500">
        Todavía no configuraste horarios: se aceptan pedidos a cualquier hora.
      </p>
    );
  }
  return status.is_open ? (
    <p className="text-xs font-semibold text-green-700">El local está abierto y recibiendo pedidos.</p>
  ) : (
    <p className="text-xs font-semibold text-red-700">
      El local está cerrado{status.next_opening_label ? `: abre ${status.next_opening_label}` : ''}.
    </p>
  );
}

export function HorariosView() {
  const [status, setStatus] = useState<BusinessHoursStatus | null>(null);
  const [draft, setDraft] = useState<WeekDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBusinessHours()
      .then((data) => {
        if (cancelled) return;
        setStatus(data);
        setDraft(toDraft(data.ranges));
      })
      .catch(() => {
        if (!cancelled) setLoadError('No se pudieron cargar los horarios de atención.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDay = (day: number, update: (ranges: EditableRange[]) => EditableRange[]) => {
    setDraft((current) => current && current.map((ranges, index) => (index === day ? update(ranges) : ranges)));
    setFormError(null);
  };

  const updateRange = (day: number, index: number, field: keyof EditableRange, value: string) => {
    updateDay(day, (ranges) => ranges.map((range, i) => (i === index ? { ...range, [field]: value } : range)));
  };

  const copyToAllDays = (day: number) => {
    setDraft((current) => current && current.map(() => current[day].map((range) => ({ ...range }))));
    setFormError(null);
  };

  const handleSave = async () => {
    if (!draft || saving) return;
    const validationError = validateDraft(draft);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const saved = await updateBusinessHours(toRanges(draft));
      setStatus(saved);
      setDraft(toDraft(saved.ranges));
      setToastMessage('Los horarios de atención se guardaron correctamente.');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      setFormError(getErrorMessage(err, 'No se pudieron guardar los horarios. Intentá nuevamente.'));
    } finally {
      setSaving(false);
    }
  };

  // En pantallas grandes el panel ocupa el alto de la ventana: la semana scrollea y el botón de
  // guardar queda siempre a la vista.
  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto relative lg:h-full">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-green-50 text-green-800 border border-green-200 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition">
          {toastMessage}
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 space-y-1 shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Horarios de atención</h1>
        <p className="text-xs text-gray-500">
          Fuera de estos horarios la web no permite hacer pedidos y el bot solo toma pedidos programados para
          cuando el local esté abierto. Si una franja cierra antes de la hora de apertura (ej. 20:00 a 02:00),
          termina al día siguiente.
        </p>
        {status && <StatusSummary status={status} />}
      </div>

      {loadError && <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{loadError}</div>}

      {!draft && !loadError && <p className="text-sm text-gray-500 text-center py-16">Cargando horarios...</p>}

      {draft && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs divide-y divide-gray-100 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
          {DAY_NAMES.map((name, day) => (
            <section key={day} aria-label={name} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <h2 className="w-28 shrink-0 text-sm font-semibold text-gray-900 sm:pt-2">{name}</h2>

              <div className="flex-1 space-y-2">
                {draft[day].length === 0 && <p className="text-sm text-gray-400 sm:pt-2">Cerrado</p>}
                {draft[day].map((range, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <input
                      type="time"
                      aria-label={`${name}: apertura de la franja ${index + 1}`}
                      value={range.opens_at}
                      onChange={(e) => updateRange(day, index, 'opens_at', e.target.value)}
                      className="rounded-xl border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <span className="text-gray-500">a</span>
                    <input
                      type="time"
                      aria-label={`${name}: cierre de la franja ${index + 1}`}
                      value={range.closes_at}
                      onChange={(e) => updateRange(day, index, 'closes_at', e.target.value)}
                      className="rounded-xl border border-gray-300 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <button
                      type="button"
                      onClick={() => updateDay(day, (ranges) => ranges.filter((_, i) => i !== index))}
                      aria-label={`Quitar la franja ${index + 1} del ${name.toLowerCase()}`}
                      className="w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex sm:flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => updateDay(day, (ranges) => [...ranges, { ...NEW_RANGE }])}
                  aria-label={`Agregar franja al ${name.toLowerCase()}`}
                  className="text-xs font-semibold rounded-lg border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition"
                >
                  + Agregar franja
                </button>
                {draft[day].length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyToAllDays(day)}
                    aria-label={`Copiar los horarios del ${name.toLowerCase()} a todos los días`}
                    className="text-xs font-semibold rounded-lg px-3 py-1.5 text-gray-500 hover:bg-gray-100 transition"
                  >
                    Copiar a todos
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {draft && (
        <div className="space-y-3 shrink-0">
          {formError && (
            <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {formError}
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="bg-black text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar horarios'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
