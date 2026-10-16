import { THEME_OPTIONS, type ThemeColor } from '@/types/storeConfig';

export type ViewKey = 'tomar-pedido' | 'comandas' | 'historial' | 'estadisticas' | 'clientes' | 'configuracion-web';

const NAV_ITEMS: { key: ViewKey; label: string }[] = [
  { key: 'tomar-pedido', label: 'Tomar pedido' },
  { key: 'comandas', label: 'Comandas' },
  { key: 'historial', label: 'Historial' },
  { key: 'estadisticas', label: 'Estadísticas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'configuracion-web', label: 'Configuración' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  activeView: ViewKey;
  onSelect: (view: ViewKey) => void;
  themeColor?: ThemeColor;
}

export function Sidebar({ open, onClose, activeView, onSelect, themeColor }: SidebarProps) {
  const themeHex = themeColor ? THEME_OPTIONS[themeColor]?.hex : '#000000';

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
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
          className="text-white px-6 py-4 flex items-center justify-between shrink-0 transition-colors duration-200"
          style={{ backgroundColor: themeHex }}
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

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                style={isActive ? { backgroundColor: themeHex } : undefined}
                className={`w-full text-left rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  isActive ? 'text-white shadow-xs' : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}