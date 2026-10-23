import { useEffect, useState } from 'react';
import { HandoffChatPanel } from '@/components/HandoffChatPanel';
import { useAuth } from '@/hooks/useAuth';
import { useHandoffs } from '@/hooks/useHandoffs';
import { useNewOrderAlert } from '@/hooks/useNewOrderAlert';
import { playHandoffAlertSound } from '@/utils/alertSound';
import { handoffAvatarColor, handoffDetails, handoffName } from '@/utils/handoff';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Columna a la derecha de la pantalla con las conversaciones derivadas a un empleado:
 * - Avisos de los clientes que piden hablar con una persona (suenan hasta que alguien los atiende).
 * - Historial de los chats que el empleado sigue atendiendo, para salir de un chat y volver cuando quiera,
 *   o hablar con varias personas a la vez. Desaparece cuando no queda ninguno.
 * El chat se abre únicamente desde alguno de estos dos lugares y ocupa esta misma columna (sin tapar la
 * página, que sigue usable); su flecha vuelve a la lista.
 */
interface HandoffNotificationsProps {
  /** Avisa si la columna tiene algo para mostrar, para que la página le deje lugar y no quede tapada. */
  onVisibleChange?: (visible: boolean) => void;
}

export function HandoffNotifications({ onVisibleChange }: HandoffNotificationsProps) {
  const { user } = useAuth();
  const handoffs = useHandoffs();
  const [openId, setOpenId] = useState<number | null>(null);

  const waiting = handoffs.filter((h) => h.status === 'waiting');
  // El servidor identifica al empleado por su nombre o, si no tiene, por su email.
  const me = user?.full_name || user?.email;
  const mine = handoffs.filter((h) => h.status === 'in_progress' && h.handled_by === me);

  const otherUnread = mine.reduce((total, h) => total + (h.id === openId ? 0 : (h.unread_count ?? 0)), 0);

  const visible = waiting.length > 0 || mine.length > 0 || openId !== null;
  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  useNewOrderAlert(
    waiting.map((h) => h.id),
    playHandoffAlertSound
  );

  return (
    <>
      <div
        aria-label="Conversaciones con clientes"
        className="fixed top-20 right-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {waiting.map((handoff) => (
          <div
            key={handoff.id}
            role="alert"
            className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 shadow-lg"
          >
            <p className="text-sm font-bold">
              🔔 {handoffName(handoff)} quiere hablar con una persona
            </p>
            {handoffDetails(handoff) && <p className="mt-0.5 text-xs font-semibold">{handoffDetails(handoff)}</p>}
            {handoff.reason && <p className="mt-1 text-xs opacity-80">{handoff.reason}</p>}
            <button
              type="button"
              onClick={() => setOpenId(handoff.id)}
              className="mt-2 rounded-xl bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition"
            >
              Atender
            </button>
          </div>
        ))}

        {openId !== null && (
          <HandoffChatPanel handoffId={openId} onBack={() => setOpenId(null)} otherUnread={otherUnread} />
        )}

        {openId === null && mine.length > 0 && (
          <section
            aria-label="Chats en curso"
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg"
          >
            <h2 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Chats en curso ({mine.length})
            </h2>
            <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
              {mine.map((handoff) => {
                const name = handoffName(handoff);
                const details = handoffDetails(handoff);
                const last = handoff.last_message;
                // El chat abierto se lee en vivo: no se marca como pendiente.
                const unread = openId === handoff.id ? 0 : (handoff.unread_count ?? 0);
                return (
                  <li key={handoff.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(handoff.id)}
                      aria-label={`Chat con ${name} #${handoff.id}`}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${handoffAvatarColor(handoff.id)}`}
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {name} <span className="text-xs font-normal text-gray-400">#{handoff.id}</span>
                          </span>
                          {last && (
                            <time dateTime={last.sent_at} className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-emerald-600' : 'text-gray-400'}`}>
                              {formatTime(last.sent_at)}
                            </time>
                          )}
                        </span>
                        {details && <span className="block truncate text-[11px] text-gray-400">{details}</span>}
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-xs ${unread ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                            {last ? `${last.author === 'employee' ? 'Vos: ' : ''}${last.text}` : 'Sin mensajes todavía'}
                          </span>
                          {unread > 0 && (
                            <span
                              role="status"
                              aria-label={`${unread} mensajes nuevos`}
                              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-bold text-white"
                            >
                              {unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

    </>
  );
}
