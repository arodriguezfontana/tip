import type { ReactNode } from 'react';

/** Aviso suelto de una sección (cargando, sin resultados): va sobre una tarjeta blanca para leerse con cualquier fondo. */
export function PanelNote({ children }: { children: ReactNode }) {
  return (
    <p className="bg-white rounded-2xl shadow-xs border border-gray-100 text-sm text-gray-500 text-center py-8 px-4">
      {children}
    </p>
  );
}
