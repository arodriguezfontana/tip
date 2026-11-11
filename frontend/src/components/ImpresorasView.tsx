import { useEffect, useState } from 'react';
import { SECTOR_CONFIG } from '@/types/order';
import type { PreparationSector } from '@/types/order';
import type { PrinterConfig } from '@/types/printer';
import { fetchPrinters, savePrinters, testPrinter } from '@/services/printerService';
import { getErrorMessage } from '@/utils/errors';
import { INPUT_FULL_CLASS, LABEL_CLASS } from '@/styles/forms';
import { PanelNote } from '@/components/ui/PanelNote';

const SECTORS: PreparationSector[] = ['cocina', 'pizzeria', 'barra'];
const DEFAULT_PORT = '9100';

interface Draft {
  enabled: boolean;
  name: string;
  host: string;
  port: string;
}

type Drafts = Record<PreparationSector, Draft>;
type Feedback = { type: 'success' | 'error'; message: string } | null;

const EMPTY_DRAFT: Draft = { enabled: false, name: '', host: '', port: DEFAULT_PORT };

function emptyDrafts(): Drafts {
  return { cocina: { ...EMPTY_DRAFT }, pizzeria: { ...EMPTY_DRAFT }, barra: { ...EMPTY_DRAFT } };
}

/** Configuración (fuera de las comandas) de la impresora que recibe las comandas de cada sector de preparación. */
export function ImpresorasView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<PreparationSector | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(emptyDrafts);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPrinters()
      .then((printers) => {
        if (cancelled) return;
        const next = emptyDrafts();
        for (const printer of printers) {
          if (printer.sector in next) {
            next[printer.sector] = {
              enabled: true,
              name: printer.name,
              host: printer.host,
              port: String(printer.port),
            };
          }
        }
        setDrafts(next);
      })
      .catch((err) => {
        if (!cancelled) setFeedback({ type: 'error', message: getErrorMessage(err, 'No se pudo cargar la configuración de impresoras.') });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (sector: PreparationSector, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [sector]: { ...prev[sector], ...patch } }));

  const portValue = (draft: Draft) => Number.parseInt(draft.port, 10);
  const isValidPort = (draft: Draft) => Number.isInteger(portValue(draft)) && portValue(draft) >= 1 && portValue(draft) <= 65535;

  const handleSave = async () => {
    const enabled = SECTORS.filter((sector) => drafts[sector].enabled);
    for (const sector of enabled) {
      const draft = drafts[sector];
      if (!draft.host.trim()) {
        setFeedback({ type: 'error', message: `Indicá la dirección (IP) de la impresora de ${SECTOR_CONFIG[sector].label}.` });
        return;
      }
      if (!isValidPort(draft)) {
        setFeedback({ type: 'error', message: `El puerto de la impresora de ${SECTOR_CONFIG[sector].label} no es válido.` });
        return;
      }
    }
    const payload: PrinterConfig[] = enabled.map((sector) => ({
      sector,
      name: drafts[sector].name.trim() || `Impresora ${SECTOR_CONFIG[sector].label}`,
      host: drafts[sector].host.trim(),
      port: portValue(drafts[sector]),
    }));
    setSaving(true);
    setFeedback(null);
    try {
      await savePrinters(payload);
      setFeedback({ type: 'success', message: 'Configuración de impresoras guardada.' });
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'No se pudo guardar la configuración de impresoras.') });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (sector: PreparationSector) => {
    const draft = drafts[sector];
    if (!draft.host.trim() || !isValidPort(draft)) {
      setFeedback({ type: 'error', message: 'Completá la dirección y el puerto para probar la impresora.' });
      return;
    }
    setTesting(sector);
    setFeedback(null);
    try {
      const result = await testPrinter(draft.host.trim(), portValue(draft));
      setFeedback(
        result.success
          ? { type: 'success', message: `Prueba enviada a la impresora de ${SECTOR_CONFIG[sector].label}.` }
          : { type: 'error', message: `La impresora de ${SECTOR_CONFIG[sector].label} no respondió. ${result.message ?? ''}`.trim() }
      );
    } catch (err) {
      setFeedback({ type: 'error', message: getErrorMessage(err, 'No se pudo probar la impresora.') });
    } finally {
      setTesting(null);
    }
  };

  if (loading) return <PanelNote>Cargando...</PanelNote>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Impresoras de comandas</h1>
        <p className="text-xs text-gray-500 mt-1">
          Elegí a qué impresora (térmica de red) se envía la comanda de cada sector al confirmar un pedido. Si el pedido
          tiene productos de varios sectores, se imprime en la impresora de cada uno. Si configurás una sola impresora,
          recibe todas las comandas sin importar el sector.
        </p>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`p-4 rounded-xl text-sm font-medium border ${
            feedback.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {SECTORS.map((sector) => {
          const draft = drafts[sector];
          const label = SECTOR_CONFIG[sector].label;
          return (
            <section key={sector} className="bg-white p-5 rounded-2xl shadow-xs border border-gray-100 flex flex-col gap-3">
              <label className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => update(sector, { enabled: event.target.checked })}
                  aria-label={`Imprimir comandas de ${label}`}
                />
                {label}
              </label>
              <div>
                <label htmlFor={`printer-name-${sector}`} className={LABEL_CLASS}>
                  Nombre
                </label>
                <input
                  id={`printer-name-${sector}`}
                  className={INPUT_FULL_CLASS}
                  value={draft.name}
                  disabled={!draft.enabled}
                  placeholder={`Impresora ${label}`}
                  maxLength={100}
                  onChange={(event) => update(sector, { name: event.target.value })}
                />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-2">
                <div>
                  <label htmlFor={`printer-host-${sector}`} className={LABEL_CLASS}>
                    Dirección (IP)
                  </label>
                  <input
                    id={`printer-host-${sector}`}
                    className={INPUT_FULL_CLASS}
                    value={draft.host}
                    disabled={!draft.enabled}
                    placeholder="192.168.1.50"
                    onChange={(event) => update(sector, { host: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`printer-port-${sector}`} className={LABEL_CLASS}>
                    Puerto
                  </label>
                  <input
                    id={`printer-port-${sector}`}
                    className={INPUT_FULL_CLASS}
                    value={draft.port}
                    disabled={!draft.enabled}
                    inputMode="numeric"
                    onChange={(event) => update(sector, { port: event.target.value.replace(/\D/g, '') })}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleTest(sector)}
                disabled={!draft.enabled || testing !== null}
                className="self-start rounded-xl border border-gray-300 px-4 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                {testing === sector ? 'Probando...' : 'Imprimir prueba'}
              </button>
            </section>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-black hover:bg-gray-800 text-white text-sm font-bold transition disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
      </div>
    </div>
  );
}
