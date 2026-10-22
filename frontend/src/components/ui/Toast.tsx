/** Aviso de éxito en la esquina superior derecha (ver useToast). */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed top-5 right-5 z-50 bg-green-50 text-green-800 border border-green-200 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold transition"
    >
      {message}
    </div>
  );
}
