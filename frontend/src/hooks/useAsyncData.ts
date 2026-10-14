import { useCallback, useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '@/utils/errors';

interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  /** Pedido al que corresponde el último resultado (para saber si el actual sigue cargando). */
  settledFor: object | null;
}

export interface AsyncData<T> {
  data: T | undefined;
  /** true mientras se espera la respuesta del pedido actual (también al recargar). */
  loading: boolean;
  error: string | null;
  /** Vuelve a pedir los datos (por ejemplo, después de guardar un cambio). */
  reload: () => void;
  /** Modifica los datos ya cargados sin volver a pedirlos (por ejemplo, para reflejar lo que se guardó). */
  update: (updater: (current: T | undefined) => T | undefined) => void;
}

/**
 * Carga datos de la API al montar el componente y cada vez que cambia `load`.
 *
 * `load` tiene que estar memorizado con useCallback (sus dependencias son las del pedido) o ser `null` para
 * no pedir nada por ahora (por ejemplo, mientras un filtro está incompleto). Si el pedido cambia antes de
 * que llegue la respuesta anterior, esa respuesta se descarta: nunca se muestran datos de un filtro viejo.
 *
 * Si falla se informa `errorMessage`, o el motivo que dio el servidor si `useServerMessage` es true.
 */
export function useAsyncData<T>(
  load: (() => Promise<T>) | null,
  errorMessage: string,
  { useServerMessage = false }: { useServerMessage?: boolean } = {}
): AsyncData<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, settledFor: null });
  const [reloadCount, setReloadCount] = useState(0);
  // Identifica cada pedido: cambia con la función de carga o al recargar.
  const request = useMemo(() => ({ load, reloadCount }), [load, reloadCount]);

  useEffect(() => {
    if (!request.load) return;
    let cancelled = false;
    request
      .load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, settledFor: request });
      })
      .catch((err: unknown) => {
        const error = useServerMessage ? getErrorMessage(err, errorMessage) : errorMessage;
        // Se conservan los últimos datos cargados: un error al recargar no vacía la pantalla.
        if (!cancelled) setState((current) => ({ ...current, error, settledFor: request }));
      });
    return () => {
      cancelled = true;
    };
  }, [request, errorMessage, useServerMessage]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);
  const update = useCallback(
    (updater: (current: T | undefined) => T | undefined) =>
      setState((current) => ({ ...current, data: updater(current.data) })),
    []
  );

  return {
    data: state.data,
    loading: load !== null && state.settledFor !== request,
    // El error de un pedido anterior no se muestra mientras se espera la respuesta del actual.
    error: state.settledFor === request ? state.error : null,
    reload,
    update,
  };
}
