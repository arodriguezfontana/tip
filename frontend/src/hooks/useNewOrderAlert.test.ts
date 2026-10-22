import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALERT_REPEAT_MS, useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import * as alertSound from '@/utils/alertSound';

vi.mock('@/utils/alertSound', () => ({
  playAlertSound: vi.fn(() => true),
  unlockAudio: vi.fn(async () => true),
  subscribeAlertAudioState: vi.fn(() => () => undefined),
  getAlertAudioState: vi.fn(() => 'running'),
}));

const sound = vi.mocked(alertSound);

function renderAlert(initial: number[]) {
  return renderHook(({ ids }) => useNewOrderAlert(ids), { initialProps: { ids: initial } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  sound.getAlertAudioState.mockReturnValue('running');
});

describe('useNewOrderAlert', () => {
  it('no suena si no hay pendientes', () => {
    renderAlert([]);
    act(() => vi.advanceTimersByTime(ALERT_REPEAT_MS * 3));

    expect(sound.playAlertSound).not.toHaveBeenCalled();
  });

  it('suena apenas hay pendientes y se repite hasta que se atienden', () => {
    const { rerender } = renderAlert([1]);
    expect(sound.playAlertSound).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(ALERT_REPEAT_MS * 2));
    expect(sound.playAlertSound).toHaveBeenCalledTimes(3);

    rerender({ ids: [] });
    act(() => vi.advanceTimersByTime(ALERT_REPEAT_MS * 3));
    expect(sound.playAlertSound).toHaveBeenCalledTimes(3);
  });

  it('un pedido nuevo suena al instante aunque ya hubiera otros pendientes', () => {
    const { rerender } = renderAlert([1]);
    sound.playAlertSound.mockClear();

    rerender({ ids: [1, 2] });

    expect(sound.playAlertSound).toHaveBeenCalledTimes(1);
  });

  it('el mismo conjunto en otro orden no cuenta como pedido nuevo', () => {
    const { rerender } = renderAlert([1, 2]);
    sound.playAlertSound.mockClear();

    rerender({ ids: [2, 1] });

    expect(sound.playAlertSound).not.toHaveBeenCalled();
  });

  it('silenciar corta la alerta y se recuerda', () => {
    const { result } = renderAlert([1]);
    sound.playAlertSound.mockClear();

    act(() => result.current.toggleEnabled());
    act(() => vi.advanceTimersByTime(ALERT_REPEAT_MS * 3));

    expect(result.current.enabled).toBe(false);
    expect(sound.playAlertSound).not.toHaveBeenCalled();
    expect(localStorage.getItem('orderAlertSoundEnabled')).toBe('false');

    // Al volver a abrir el panel sigue silenciado.
    const { result: again } = renderAlert([1]);
    expect(again.current.enabled).toBe(false);
  });

  it('reactivar desbloquea el audio del navegador', () => {
    localStorage.setItem('orderAlertSoundEnabled', 'false');
    const { result } = renderAlert([]);

    act(() => result.current.toggleEnabled());

    expect(result.current.enabled).toBe(true);
    expect(sound.unlockAudio).toHaveBeenCalled();
  });

  it('silenciar en otra pestaña aplica también en esta', () => {
    const { result } = renderAlert([1]);

    act(() => {
      localStorage.setItem('orderAlertSoundEnabled', 'false');
      window.dispatchEvent(new StorageEvent('storage', { key: 'orderAlertSoundEnabled' }));
    });

    expect(result.current.enabled).toBe(false);
  });

  it.each([
    ['suspended', true, true],
    ['running', true, false],
    ['unsupported', false, false],
  ] as const)('con el audio en estado %s informa soporte=%s y bloqueo=%s', (state, supported, blocked) => {
    sound.getAlertAudioState.mockReturnValue(state);
    const { result } = renderAlert([]);

    expect(result.current.audioSupported).toBe(supported);
    expect(result.current.audioBlocked).toBe(blocked);
  });
});
