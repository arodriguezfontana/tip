interface CashPinSectionProps {
  cashPinEnabled: boolean;
  setCashPinEnabled: (enabled: boolean) => void;
  cashPin: string;
  setCashPin: (pin: string) => void;
  clearFeedback: () => void;
}

/** Protección del módulo de caja con un PIN de 4 dígitos. */
export function CashPinSection({ cashPinEnabled, setCashPinEnabled, cashPin, setCashPin, clearFeedback }: CashPinSectionProps) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Seguridad y Control de Caja</h2>
        <p className="text-xs text-gray-500 mt-1">
          Configurá un PIN exclusivo de 4 dígitos para que solo el cajero pueda abrir, cerrar o gestionar la caja. Debe ser diferente al PIN de administración del dueño.
        </p>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={cashPinEnabled}
            onChange={(e) => {
              setCashPinEnabled(e.target.checked);
              clearFeedback();
            }}
            className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900"
          />
          <span className="text-sm font-semibold text-gray-800">
            Proteger el módulo de Caja con un PIN de 4 dígitos
          </span>
        </label>

        {cashPinEnabled && (
          <div className="max-w-xs space-y-1.5 pt-1">
            <label htmlFor="cash-pin-input" className="block text-xs font-semibold text-gray-700">
              PIN de Caja (4 dígitos)
            </label>
            <input
              id="cash-pin-input"
              type="password"
              maxLength={4}
              inputMode="numeric"
              value={cashPin}
              onChange={(e) => {
                const clean = e.target.value.replace(/\D/g, '').slice(0, 4);
                setCashPin(clean);
                clearFeedback();
              }}
              placeholder="Ej: 5678"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <p className="text-[11px] text-gray-500">
              Ingresá 4 dígitos numéricos que usará el personal a cargo de la caja.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
