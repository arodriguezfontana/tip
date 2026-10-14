import { useId } from 'react';
import type { ReactNode } from 'react';

const WIDTH_CLASSES = {
  md: 'max-w-md',
  xl: 'max-w-xl',
};

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Por ejemplo mientras se guarda, para no cerrar a mitad de la operación. */
  closeDisabled?: boolean;
  width?: keyof typeof WIDTH_CLASSES;
  children: ReactNode;
}

/** Ventana modal: fondo oscuro, encabezado con título y botón de cerrar, y el contenido debajo. */
export function Modal({ title, subtitle, onClose, closeDisabled = false, width = 'xl', children }: ModalProps) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-2xl shadow-xl ${WIDTH_CLASSES[width]} w-full max-h-[90vh] flex flex-col`}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4 shrink-0">
          <div>
            <h2 id={titleId} className="text-base font-bold text-gray-900">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-700 text-lg font-bold"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Contenido desplazable del modal. */
export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="px-6 py-4 space-y-4 overflow-y-auto min-h-0">{children}</div>;
}

interface ModalFooterProps {
  error?: string | null;
  /** Texto adicional sobre el error (ej. qué va a pasar al guardar). */
  note?: ReactNode;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
}

/** Pie del formulario de un modal: aviso de error y botones Cancelar / confirmar (el de confirmar envía el formulario). */
export function ModalFooter({ error, note, onCancel, submitLabel, saving }: ModalFooterProps) {
  return (
    <div className="border-t border-gray-100 px-6 py-4 space-y-3 shrink-0">
      {note}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="bg-black text-white rounded-xl px-5 py-2 text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-60"
        >
          {saving ? 'Guardando...' : submitLabel}
        </button>
      </div>
    </div>
  );
}
