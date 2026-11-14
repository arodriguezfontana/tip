import type { ReactNode } from 'react';

/** Aviso suelto de una sección (cargando, sin resultados): va sobre una tarjeta blanca para leerse con cualquier fondo. */
export function PanelNote({ children }: { children: ReactNode }) {
  const isString = typeof children === 'string';
  const isLoading = isString && children.toLowerCase().includes('cargando');

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-gray-100 py-10 px-6 flex flex-col items-center justify-center text-center">
      {isLoading ? (
        <div
          className="w-7 h-7 mb-3 rounded-full border-2 border-gray-200 border-t-gray-800 animate-spin"
          aria-hidden="true"
        />
      ) : (
        <div
          className="w-10 h-10 mb-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400"
          aria-hidden="true"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
        </div>
      )}
      <p className="text-sm font-medium text-gray-500 max-w-sm">{children}</p>
    </div>
  );
}
