/** Clases de Tailwind compartidas por los formularios, para que todos los campos se vean igual. */

/** Campo de texto, select o textarea. Sumarle `w-full` o un ancho según dónde se use. */
export const INPUT_CLASS =
  'rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black';

/** Campo de ancho completo, para formularios en columna. */
export const INPUT_FULL_CLASS = `${INPUT_CLASS} w-full`;

/** Campo más alto, para formularios con pocos datos (perfil, ingreso, edición de clientes). */
export const INPUT_LG_CLASS =
  'w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black';

export const LABEL_CLASS = 'block text-xs font-medium text-gray-700 mb-1';
