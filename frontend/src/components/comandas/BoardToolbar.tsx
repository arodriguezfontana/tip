const PAGE_SIZES = [3, 5, 7];

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5z" />
      {muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />}
    </svg>
  );
}

interface BoardToolbarProps {
  isSimulating: boolean;
  /** Acceso rápido a la sección para cargar pedidos presenciales. */
  onTakeOrder?: () => void;
  /** Color del tema del local (para el botón de tomar pedido). */
  themeHex?: string;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onToggleSimulation: () => void;
  soundEnabled: boolean;
  soundSupported: boolean;
  onToggleSound: () => void;
}

/** Barra superior del tablero: título, tomar pedido, tamaño de página, simulación y alerta sonora. */
export function BoardToolbar({
  isSimulating,
  onTakeOrder,
  themeHex,
  pageSize,
  onPageSizeChange,
  onToggleSimulation,
  soundEnabled,
  soundSupported,
  onToggleSound,
}: BoardToolbarProps) {
  const soundLabel = soundEnabled ? 'Silenciar alerta de nuevos pedidos' : 'Activar alerta de nuevos pedidos';
  return (
    <div className="shrink-0 flex flex-wrap items-center justify-between bg-white px-5 py-3 rounded-2xl shadow-xs border border-gray-100 gap-3">
      <div className="flex items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${isSimulating ? 'bg-purple-500' : 'bg-amber-500'} animate-pulse`}></span>
        <span className="text-sm font-semibold text-gray-800">
          {isSimulating ? 'Panel de Comandas (Modo Simulación)' : 'Panel de Comandas'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {onTakeOrder && (
          <button
            type="button"
            onClick={onTakeOrder}
            style={themeHex ? { backgroundColor: themeHex } : undefined}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl text-white transition shadow-xs ${
              themeHex ? 'hover:opacity-90' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            <span className="text-sm leading-none">+</span>
            Tomar pedido
          </button>
        )}

        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200">
          <span className="text-xs text-gray-500 font-medium">Ver:</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => onPageSizeChange(size)}
              className={`text-xs px-2 py-0.5 rounded-lg font-bold transition ${pageSize === size ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-200'}`}
            >
              {size}
            </button>
          ))}
        </div>

        {/* Herramienta de desarrollo para probar el tablero con muchos pedidos: no se incluye en producción. */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={onToggleSimulation}
            className={`text-xs font-medium px-3 py-1.5 rounded-xl transition shadow-xs ${isSimulating ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'}`}
          >
            {isSimulating ? 'Salir de Simulación' : 'Simular 50 Pedidos'}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleSound}
          disabled={!soundSupported}
          aria-pressed={soundEnabled}
          aria-label={soundLabel}
          title={soundLabel}
          className={`flex items-center justify-center w-8 h-8 rounded-xl border transition disabled:opacity-40 ${
            soundEnabled ? 'bg-white border-gray-200 text-gray-800 hover:bg-gray-100' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
          }`}
        >
          <SpeakerIcon muted={!soundEnabled} />
        </button>
      </div>
    </div>
  );
}
