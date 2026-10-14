import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useToast } from '@/hooks/useToast';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsyncData', () => {
  it('carga los datos y avisa mientras espera', async () => {
    // Como en los componentes, la función de carga es estable (módulo o useCallback).
    const load = () => Promise.resolve(['a']);
    const { result } = renderHook(() => useAsyncData(load, 'Error'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(['a']));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('descarta la respuesta de un pedido viejo si mientras tanto cambió el pedido', async () => {
    const viejo = deferred<string>();
    const nuevo = deferred<string>();
    const { result, rerender } = renderHook(({ load }) => useAsyncData(load, 'Error'), {
      initialProps: { load: () => viejo.promise },
    });

    rerender({ load: () => nuevo.promise });
    await act(async () => nuevo.resolve('filtro nuevo'));
    await act(async () => viejo.resolve('filtro viejo'));

    expect(result.current.data).toBe('filtro nuevo');
  });

  it('sin función de carga no pide nada ni queda cargando', () => {
    const { result } = renderHook(() => useAsyncData<string>(null, 'Error'));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('informa el error, o el motivo del servidor si se pide, y conserva lo último que cargó', async () => {
    const load = vi.fn().mockResolvedValueOnce('datos').mockRejectedValueOnce({ message: 'Servidor caído' });
    const { result } = renderHook(() => useAsyncData(load, 'No se pudo cargar.', { useServerMessage: true }));
    await waitFor(() => expect(result.current.data).toBe('datos'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.error).toBe('Servidor caído'));
    expect(result.current.data).toBe('datos');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('permite actualizar los datos cargados sin volver a pedirlos', async () => {
    const load = vi.fn<() => Promise<number[]>>().mockResolvedValue([1, 2]);
    const { result } = renderHook(() => useAsyncData(load, 'Error'));
    await waitFor(() => expect(result.current.data).toEqual([1, 2]));

    act(() => result.current.update((current) => [...(current ?? []), 3]));

    expect(result.current.data).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('useToast', () => {
  it('muestra el mensaje y lo oculta solo a los pocos segundos', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.show('Se guardó.'));
    expect(result.current.message).toBe('Se guardó.');

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.message).toBeNull();
  });
});
