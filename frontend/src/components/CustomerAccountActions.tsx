import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const BUTTON_CLASS =
  'rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide transition';

/** Acciones de la cuenta del cliente para la barra superior de la web. */
export function CustomerAccountActions({ onLogin }: { onLogin?: () => void }) {
  const { isCustomer, isLoading, logout } = useAuth();

  if (isLoading) return null;

  if (isCustomer) {
    return (
      <>
        <Link to="/perfil" className={BUTTON_CLASS}>
          Mi perfil
        </Link>
        <button type="button" onClick={logout} className={BUTTON_CLASS}>
          Salir
        </button>
      </>
    );
  }

  if (!onLogin) return null;

  return (
    <button type="button" onClick={onLogin} className={BUTTON_CLASS}>
      Ingresar
    </button>
  );
}
