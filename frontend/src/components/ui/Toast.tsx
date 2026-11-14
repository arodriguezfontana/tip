import { CheckCircleIcon } from '@/components/Icons';

/** Aviso de éxito en la esquina superior derecha (ver useToast). */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed top-5 right-5 z-50 bg-white text-emerald-900 border border-emerald-200/80 px-4 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2.5 transition animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <CheckCircleIcon className="w-5 h-5 text-emerald-600 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
