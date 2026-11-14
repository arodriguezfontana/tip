import { useCallback, useEffect, useState } from 'react';
import type { PinType } from '@/types/security';
import { fetchPinStatus, verifyAdminPin, verifyCashPin } from '@/services/securityService';
import { getErrorMessage } from '@/utils/errors';

const PIN_LENGTH = 4;
// Tras varios intentos fallidos el servidor bloquea el PIN por 5 minutos.
const LOCKOUT_SECONDS = 300;

function isLockoutMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('bloqueado temporalmente') || text.includes('3 intentos');
}

interface PinModalProps {
  isOpen: boolean;
  pinType: PinType;
  title?: string;
  description?: string;
  onSuccess: (token: string) => void;
  onCancel: () => void;
}

function PinModalDialog({
  pinType,
  title,
  description,
  onSuccess,
  onCancel,
}: Omit<PinModalProps, 'isOpen'>) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blockedSeconds, setBlockedSeconds] = useState(0);

  const defaultTitle =
    pinType === 'admin'
      ? 'Acceso a Datos Sensibles y Estadísticas'
      : 'Control de Caja Protegido';

  const defaultDesc =
    pinType === 'admin'
      ? 'Ingresá el PIN de 4 dígitos para visualizar la facturación, reportes y estadísticas comerciales.'
      : 'Ingresá el PIN de 4 dígitos para abrir, cerrar o gestionar los movimientos de la caja.';

  // Consultar estado de bloqueo al montar
  useEffect(() => {
    let active = true;
    fetchPinStatus()
      .then((status) => {
        if (!active) return;
        if (pinType === 'admin' && status.admin_blocked) {
          setBlockedSeconds(status.admin_blocked_seconds_remaining);
          setErrorMsg(
            'El acceso se encuentra bloqueado temporalmente por demasiados intentos fallidos.'
          );
        } else if (pinType === 'cash' && status.cash_blocked) {
          setBlockedSeconds(status.cash_blocked_seconds_remaining);
          setErrorMsg(
            'El acceso se encuentra bloqueado temporalmente por demasiados intentos fallidos.'
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [pinType]);

  // Contador de bloqueo regresivo
  useEffect(() => {
    if (blockedSeconds <= 0) return;
    const interval = setInterval(() => {
      setBlockedSeconds((prev) => {
        if (prev <= 1) {
          setErrorMsg(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [blockedSeconds]);

  const handleSubmit = useCallback(
    async (pinToSubmit: string) => {
      if (pinToSubmit.length !== PIN_LENGTH || loading || blockedSeconds > 0) return;

      setLoading(true);
      setErrorMsg(null);

      try {
        const verifyFn = pinType === 'admin' ? verifyAdminPin : verifyCashPin;
        const res = await verifyFn(pinToSubmit);
        onSuccess(res.token);
      } catch (err: unknown) {
        setPin('');
        const msg = getErrorMessage(err, 'PIN incorrecto.');
        setErrorMsg(msg);
        if (isLockoutMessage(msg)) setBlockedSeconds(LOCKOUT_SECONDS);
      } finally {
        setLoading(false);
      }
    },
    [blockedSeconds, loading, onSuccess, pinType]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (blockedSeconds > 0 || loading || pin.length >= PIN_LENGTH) return;
      const next = pin + digit;
      setPin(next);
      if (next.length === PIN_LENGTH) handleSubmit(next);
    },
    [blockedSeconds, handleSubmit, loading, pin]
  );

  const handleDelete = useCallback(() => {
    if (blockedSeconds > 0 || loading) return;
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  }, [blockedSeconds, loading]);

  // Teclado físico
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Enter' && pin.length === 4) {
        handleSubmit(pin);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete, handleDigit, handleSubmit, onCancel, pin]);

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const isBlocked = blockedSeconds > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/70 backdrop-blur-md animate-fade-in"
    >
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-7 flex flex-col items-center text-center">
        {/* Ícono de seguridad */}
        <div
          style={
            !isBlocked
              ? {
                  backgroundColor: 'var(--primary-light, #f4f4f5)',
                  borderColor: 'var(--primary-border, #e4e4e7)',
                  color: 'var(--primary-color, #18181b)',
                }
              : undefined
          }
          className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border ${
            isBlocked
              ? 'bg-red-100 text-red-600 border-red-200'
              : ''
          }`}
        >
          {isBlocked ? (
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          ) : (
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          )}
        </div>

        <h2 id="pin-modal-title" className="text-lg font-bold text-gray-900">
          {title || defaultTitle}
        </h2>
        <p className="text-xs text-gray-500 mt-1 mb-5">
          {description || defaultDesc}
        </p>

        {/* Indicadores de 4 dígitos */}
        <div
          className="flex items-center justify-center gap-3 mb-6"
          data-testid="pin-dots"
        >
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = pin.length > idx;
            return (
              <div
                key={idx}
                style={
                  hasDigit
                    ? {
                        backgroundColor: 'var(--primary-color, #18181b)',
                        borderColor: 'var(--primary-color, #18181b)',
                      }
                    : undefined
                }
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  hasDigit
                    ? 'scale-110 shadow-xs'
                    : 'bg-gray-100 border-gray-300'
                }`}
              />
            );
          })}
        </div>

        {/* Banner de error o bloqueo */}
        {errorMsg && (
          <div
            role="alert"
            className={`w-full text-xs font-medium p-3 rounded-xl mb-4 border ${
              isBlocked
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <p>{errorMsg}</p>
            {isBlocked && (
              <p className="mt-1 font-bold text-red-800">
                Podrás reintentar en: {formatCountdown(blockedSeconds)}
              </p>
            )}
          </div>
        )}

        {/* Teclado numérico en pantalla */}
        <div className="grid grid-cols-3 gap-2.5 w-full mb-5">
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row) =>
            row.map((num) => (
              <button
                key={num}
                type="button"
                disabled={isBlocked || loading}
                onClick={() => handleDigit(num)}
                className="h-12 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-lg font-semibold text-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs border border-gray-200/60"
              >
                {num}
              </button>
            ))
          )}
          {/* Fila inferior: Borrar, 0, Confirmar */}
          <button
            type="button"
            disabled={isBlocked || loading || pin.length === 0}
            onClick={handleDelete}
            aria-label="Borrar dígito"
            className="h-12 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-sm font-semibold text-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs border border-gray-200/60 flex items-center justify-center"
          >
            ⌫
          </button>
          <button
            type="button"
            disabled={isBlocked || loading}
            onClick={() => handleDigit('0')}
            className="h-12 rounded-xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-lg font-semibold text-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs border border-gray-200/60"
          >
            0
          </button>
          <button
            type="button"
            disabled={isBlocked || loading || pin.length !== 4}
            onClick={() => handleSubmit(pin)}
            aria-label="Confirmar PIN"
            style={
              !isBlocked && pin.length === 4
                ? {
                    backgroundColor: 'var(--primary-color, #18181b)',
                    color: '#ffffff',
                  }
                : undefined
            }
            className={`h-12 rounded-xl font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs flex items-center justify-center ${
              !isBlocked && pin.length === 4
                ? 'hover:opacity-90'
                : 'bg-zinc-900 text-white'
            }`}
          >
            {loading ? '...' : '✔'}
          </button>
        </div>

        {/* Botón cancelar / volver */}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 py-2 px-4 rounded-lg transition"
        >
          Volver al panel
        </button>
      </div>
    </div>
  );
}

export function PinModal({
  isOpen,
  pinType,
  title,
  description,
  onSuccess,
  onCancel,
}: PinModalProps) {
  if (!isOpen) return null;

  return (
    <PinModalDialog
      pinType={pinType}
      title={title}
      description={description}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
}
