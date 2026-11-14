interface CashHeaderProps {
  isOpen: boolean;
  error: string | null;
  onRefresh: () => void;
  onDismissError: () => void;
}

/** Título de la sección, estado de la caja, botón para actualizar y el aviso de error. */
export function CashHeader({ isOpen, error, onRefresh, onDismissError }: CashHeaderProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Control de caja</h1>
        </div>
        <div className="flex items-center gap-3">
          {isOpen ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Caja abierta
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              Caja cerrada
            </span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="text-red-500 hover:text-red-700 font-bold ml-2 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
