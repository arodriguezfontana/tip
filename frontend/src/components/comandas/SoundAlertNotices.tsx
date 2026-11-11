interface SoundAlertNoticesProps {
  supported: boolean;
  enabled: boolean;
  blocked: boolean;
  onUnlock: () => void;
}

/** Avisos sobre la alerta sonora de nuevos pedidos: el navegador no la soporta o la tiene bloqueada. */
export function SoundAlertNotices({ supported, enabled, blocked, onUnlock }: SoundAlertNoticesProps) {
  if (!supported) {
    return (
      <div className="shrink-0 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm">
        Este navegador no permite reproducir la alerta sonora de nuevos pedidos. Usá una versión actualizada de Chrome, Edge, Firefox o Safari.
      </div>
    );
  }
  if (!enabled || !blocked) return null;
  return (
    <div role="alert" className="shrink-0 rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
      <span>El navegador bloqueó el sonido hasta que interactúes con la página. Habilitalo para escuchar la alerta de nuevos pedidos.</span>
      <button
        type="button"
        onClick={onUnlock}
        className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition"
      >
        Habilitar sonido
      </button>
    </div>
  );
}
