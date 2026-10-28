import { useState } from 'react';
import { getThemeOption, type ThemeColor } from '@/types/storeConfig';

export type ViewKey =
  | 'tomar-pedido'
  | 'comandas'
  | 'historial'
  | 'estadisticas'
  | 'reporte-ingredientes'
  | 'clientes'
  | 'repartidores'
  | 'productos'
  | 'ingredientes'
  | 'menu-imagen'
  | 'horarios'
  | 'configuracion-web';

/** Secciones del panel agrupadas por tarea: el día a día, el catálogo, los reportes y la configuración del local. */
const NAV_GROUPS: { title: string; items: { key: ViewKey; label: string }[] }[] = [
  {
    title: 'Operación',
    items: [
      { key: 'comandas', label: 'Comandas' },
      { key: 'tomar-pedido', label: 'Tomar pedido' },
      { key: 'historial', label: 'Historial' },
      { key: 'clientes', label: 'Clientes' },
      { key: 'repartidores', label: 'Repartidores' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { key: 'productos', label: 'Productos y categorías' },
      { key: 'ingredientes', label: 'Ingredientes' },
    ],
  },
  {
    title: 'Reportes',
    items: [
      { key: 'estadisticas', label: 'Estadísticas' },
      { key: 'reporte-ingredientes', label: 'Reporte de ingredientes' },
    ],
  },
  {
    title: 'Configuración',
    items: [
      { key: 'horarios', label: 'Horarios' },
      { key: 'menu-imagen', label: 'Menú en imagen' },
      { key: 'configuracion-web', label: 'Configuración' },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeView: ViewKey;
  onSelect: (view: ViewKey) => void;
  themeColor?: ThemeColor;
}

/** Grupos plegados, recordados en este navegador. Si no hay almacenamiento disponible, arrancan todos abiertos. */
const COLLAPSED_STORAGE_KEY = 'admin-sidebar-collapsed-groups';

function loadCollapsedGroups(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((title): title is string => typeof title === 'string') : [];
  } catch {
    return [];
  }
}

function saveCollapsedGroups(titles: string[]) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(titles));
  } catch {
    // Sin almacenamiento (ej. navegación privada): el estado dura solo mientras la página está abierta.
  }
}

export function Sidebar({ open, onClose, activeView, onSelect, themeColor }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsedGroups);
  const themeHex = themeColor ? getThemeOption(themeColor).hex : undefined;

  const toggleGroup = (title: string) => {
    const next = collapsed.includes(title) ? collapsed.filter((t) => t !== title) : [...collapsed, title];
    setCollapsed(next);
    saveCollapsedGroups(next);
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity lg:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-50 z-50 shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div
          className="bg-black text-white px-6 py-4 flex items-center justify-between shrink-0"
          style={themeHex ? { backgroundColor: themeHex } : undefined}
        >
          <h2 className="text-lg font-bold">Menú</h2>
            <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="w-8 h-8 rounded-lg hover:bg-white/10 transition flex items-center justify-center text-xl leading-none"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {NAV_GROUPS.map((group, index) => {
            const titleId = `nav-group-${index}`;
            const listId = `nav-group-${index}-items`;
            const expanded = !collapsed.includes(group.title);
            // Plegado, el título se resalta si la sección abierta está adentro, para no perderla de vista.
            const containsActive = group.items.some((item) => item.key === activeView);
            return (
              <div key={group.title}>
                <button
                  type="button"
                  id={titleId}
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={expanded}
                  aria-controls={listId}
                  className={`w-full flex items-center justify-between rounded-lg px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider transition hover:bg-gray-200 ${
                    !expanded && containsActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {group.title}
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                    className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                <div id={listId} role="group" aria-labelledby={titleId} hidden={!expanded} className="space-y-1 pt-1 pb-2">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect(item.key)}
                      aria-current={activeView === item.key ? 'page' : undefined}
                      style={activeView === item.key && themeHex ? { backgroundColor: themeHex } : undefined}
                      className={`w-full text-left rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                        activeView === item.key
                          ? themeHex
                            ? 'text-white shadow-xs'
                            : 'bg-black text-white'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}