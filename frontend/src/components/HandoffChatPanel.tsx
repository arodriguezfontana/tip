import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchHandoff, finishHandoff, sendHandoffMessage, takeHandoff } from '@/services/handoffService';
import type { HandoffDetail } from '@/types/handoff';
import { getErrorMessage } from '@/utils/errors';
import { handoffAvatarColor, handoffDetails, handoffName } from '@/utils/handoff';
import { BotIcon } from '@/components/Icons';

export const CHAT_POLL_INTERVAL_MS = 2000;

interface HandoffChatPanelProps {
  handoffId: number;
  /** Vuelve a la lista de chats; la conversación sigue a cargo del empleado. */
  onBack: () => void;
  /** Mensajes nuevos en los demás chats, para avisarlo en la flecha de volver (como en WhatsApp). */
  otherUnread?: number;
}

const BUBBLE_CLASSES = {
  customer: 'self-start bg-gray-100 text-gray-900',
  bot: 'self-start border border-blue-100 bg-blue-50 text-blue-900',
  employee: 'self-end bg-black text-white',
  system: 'self-center text-xs text-gray-400',
};

/**
 * Chat del empleado con un cliente derivado, en un panel lateral que no bloquea el resto de la página.
 * Al abrirlo toma la conversación; con la flecha vuelve a la lista sin soltarla; al finalizar vuelve al bot.
 */
export function HandoffChatPanel({ handoffId, onBack, otherUnread = 0 }: HandoffChatPanelProps) {
  const [handoff, setHandoff] = useState<HandoffDetail | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Si la conversación terminó o la tomó otro empleado, no hay nada más que consultar ni enviar.
  const [closed, setClosed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const fail = (err: unknown) => {
      if (cancelled) return;
      setError(getErrorMessage(err, 'No se pudo cargar la conversación.'));
      setClosed(true);
      clearInterval(intervalId);
    };

    takeHandoff(handoffId)
      .then((data) => {
        if (cancelled) return;
        setHandoff(data);
        intervalId = setInterval(() => {
          fetchHandoff(handoffId)
            .then((latest) => {
              if (!cancelled) setHandoff(latest);
            })
            .catch(fail);
        }, CHAT_POLL_INTERVAL_MS);
      })
      .catch(fail);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [handoffId]);

  const messageCount = handoff?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messageCount]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy || closed) return;
    setBusy(true);
    setError(null);
    try {
      setHandoff(await sendHandoffMessage(handoffId, message));
      setText('');
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo enviar el mensaje.'));
    } finally {
      setBusy(false);
    }
  };

  const handleFinish = async () => {
    if (busy || closed) return;
    setBusy(true);
    setError(null);
    try {
      await finishHandoff(handoffId);
      onBack();
    } catch (err) {
      setError(getErrorMessage(err, 'No se pudo finalizar la atención.'));
      setBusy(false);
    }
  };

  const name = handoff ? handoffName(handoff) : 'el cliente';
  return (
    <section
      role="dialog"
      aria-label={`Chat con ${name}`}
      className="flex h-[min(34rem,calc(100vh-7rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-gray-50 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a la lista de chats"
          className="relative flex h-8 w-8 items-center justify-center rounded-full text-lg text-gray-600 hover:bg-gray-200 transition"
        >
          ←
          {otherUnread > 0 && (
            <span
              role="status"
              aria-label={`${otherUnread} mensajes nuevos en otros chats`}
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white"
            >
              {otherUnread}
            </span>
          )}
        </button>
        {handoff && (
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${handoffAvatarColor(handoff.id)}`}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-gray-900">{handoff ? name : 'Cliente'}</h2>
          {handoff && (
            <p className="truncate text-[11px] text-gray-500">
              #{handoff.id}
              {handoffDetails(handoff) && ` · ${handoffDetails(handoff)}`}
            </p>
          )}
          {handoff?.reason && <p className="truncate text-[11px] text-gray-500">{handoff.reason}</p>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" aria-label="Mensajes">
        {!handoff && !error && <p className="text-sm text-gray-400">Cargando conversación...</p>}
        {handoff?.messages.map((message, index) => (
          <p
            key={index}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${BUBBLE_CLASSES[message.author]}`}
          >
            {message.author === 'bot' && (
              <span className="mb-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase">
                <BotIcon className="w-3 h-3 shrink-0" />
                <span>Bot</span>
              </span>
            )}
            {message.text}
          </p>
        ))}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-gray-100 px-3 py-3">
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!handoff || closed}
            placeholder="Escribí tu respuesta..."
            aria-label="Mensaje"
            maxLength={4000}
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!handoff || closed || busy || !text.trim()}
            className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition disabled:opacity-60"
          >
            Enviar
          </button>
        </form>
        <button
          type="button"
          onClick={handleFinish}
          disabled={!handoff || closed || busy}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
        >
          Finalizar atención y volver al bot
        </button>
      </div>
    </section>
  );
}
