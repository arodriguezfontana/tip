import { useState } from 'react';
import { getThemeOption, type ThemeColor } from '@/types/storeConfig';
import {
  UtensilsIcon,
  ShoppingBagIcon,
  CashIcon,
  ClockIcon,
  UserIcon,
  DeliveryIcon,
  PizzaIcon,
  TagIcon,
  SparklesIcon,
  KitchenIcon,
  TrendingUpIcon,
  ClipboardListIcon,
  CalendarIcon,
  ImageIcon,
  PrinterIcon,
  SettingsIcon,
  ChevronDownIcon,
} from '@/components/Icons';

export type ViewKey =
  | 'tomar-pedido'
  | 'caja'
  | 'comandas'
  | 'historial'
  | 'estadisticas'
  | 'reporte-ingredientes'
  | 'clientes'
  | 'repartidores'
  | 'productos'
  | 'categorias'
  | 'promociones'
  | 'ingredientes'
  | 'menu-imagen'
  | 'horarios'
  | 'configuracion-web'
  | 'impresoras';

/** Secciones del panel agrupadas por tarea: el día a día, el catálogo, los reportes y la configuración del local. */
const NAV_GROUPS: { title: string; items: { key: ViewKey; label: string }[] }[] = [
  {
    title: 'Operación',
    items: [
      { key: 'comandas', label: 'Comandas' },
      { key: 'tomar-pedido', label: 'Tomar pedido' },
      { key: 'caja', label: 'Control de caja' },
      { key: 'historial', label: 'Historial' },
      { key: 'clientes', label: 'Clientes' },
      { key: 'repartidores', label: 'Repartidores' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { key: 'productos', label: 'Productos' },
      { key: 'categorias', label: 'Categorías' },
      { key: 'promociones', label: 'Promociones' },
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
      { key: 'menu-imagen', label: 'Menú y promociones' },
      { key: 'impresoras', label: 'Impresoras' },
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

function getNavIcon(key: ViewKey) {
  switch (key) {
    case 'comandas':
      return <UtensilsIcon className="w-4 h-4 shrink-0" />;
    case 'tomar-pedido':
      return <ShoppingBagIcon className="w-4 h-4 shrink-0" />;
    case 'caja':
      return <CashIcon className="w-4 h-4 shrink-0" />;
    case 'historial':
      return <ClockIcon className="w-4 h-4 shrink-0" />;
    case 'clientes':
      return <UserIcon className="w-4 h-4 shrink-0" />;
    case 'repartidores':
      return <DeliveryIcon className="w-4 h-4 shrink-0" />;
    case 'productos':
      return <PizzaIcon className="w-4 h-4 shrink-0" />;
    case 'categorias':
      return <TagIcon className="w-4 h-4 shrink-0" />;
    case 'promociones':
      return <SparklesIcon className="w-4 h-4 shrink-0" />;
    case 'ingredientes':
      return <KitchenIcon className="w-4 h-4 shrink-0" />;
    case 'estadisticas':
      return <TrendingUpIcon className="w-4 h-4 shrink-0" />;
    case 'reporte-ingredientes':
      return <ClipboardListIcon className="w-4 h-4 shrink-0" />;
    case 'horarios':
      return <CalendarIcon className="w-4 h-4 shrink-0" />;
    case 'menu-imagen':
      return <ImageIcon className="w-4 h-4 shrink-0" />;
    case 'impresoras':
      return <PrinterIcon className="w-4 h-4 shrink-0" />;
    case 'configuracion-web':
      return <SettingsIcon className="w-4 h-4 shrink-0" />;
    default:
      return null;
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
                  <ChevronDownIcon
                    className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                <div id={listId} role="group" aria-labelledby={titleId} hidden={!expanded} className="space-y-1 pt-1 pb-2">
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onSelect(item.key)}
                      aria-current={activeView === item.key ? 'page' : undefined}
                      style={activeView === item.key ? { backgroundColor: 'var(--primary-color, #18181b)' } : undefined}
                      className={`w-full text-left rounded-xl px-3.5 py-2.5 text-sm font-semibold transition flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
                        activeView === item.key
                          ? 'text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className="shrink-0 text-current" aria-hidden="true">
                        {getNavIcon(item.key)}
                      </span>
                      <span className="truncate">{item.label}</span>
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
