import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { setAdminPrivilegedToken, setCashPrivilegedToken } from '@/services/api';

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos de inactividad

interface PinSecurityContextValue {
  isAdminUnlocked: boolean;
  adminToken: string | null;
  unlockAdmin: (token: string) => void;
  lockAdmin: () => void;

  isCashUnlocked: boolean;
  cashToken: string | null;
  unlockCash: (token: string) => void;
  lockCash: () => void;

  lockAll: () => void;
}

const PinSecurityContext = createContext<PinSecurityContextValue | null>(null);

export function PinSecurityProvider({ children }: { children: ReactNode }) {
  const [adminToken, setAdminTokenState] = useState<string | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  const [cashToken, setCashTokenState] = useState<string | null>(null);
  const [isCashUnlocked, setIsCashUnlocked] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockAdmin = useCallback(() => {
    setAdminTokenState(null);
    setIsAdminUnlocked(false);
    setAdminPrivilegedToken(null);
  }, []);

  const lockCash = useCallback(() => {
    setCashTokenState(null);
    setIsCashUnlocked(false);
    setCashPrivilegedToken(null);
  }, []);

  const lockAll = useCallback(() => {
    lockAdmin();
    lockCash();
  }, [lockAdmin, lockCash]);

  const unlockAdmin = useCallback((token: string) => {
    setAdminTokenState(token);
    setIsAdminUnlocked(true);
    setAdminPrivilegedToken(token);
  }, []);

  const unlockCash = useCallback((token: string) => {
    setCashTokenState(token);
    setIsCashUnlocked(true);
    setCashPrivilegedToken(token);
  }, []);

  // Temporizador de 5 minutos de inactividad
  const resetInactivityTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isAdminUnlocked || isCashUnlocked) {
      timeoutRef.current = setTimeout(() => {
        lockAll();
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [isAdminUnlocked, isCashUnlocked, lockAll]);

  useEffect(() => {
    if (!isAdminUnlocked && !isCashUnlocked) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    resetInactivityTimer();

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
    };
  }, [isAdminUnlocked, isCashUnlocked, resetInactivityTimer]);

  const value: PinSecurityContextValue = {
    isAdminUnlocked,
    adminToken,
    unlockAdmin,
    lockAdmin,
    isCashUnlocked,
    cashToken,
    unlockCash,
    lockCash,
    lockAll,
  };

  return <PinSecurityContext.Provider value={value}>{children}</PinSecurityContext.Provider>;
}

export function usePinSecurity(): PinSecurityContextValue {
  const ctx = useContext(PinSecurityContext);
  if (!ctx) {
    throw new Error('usePinSecurity debe usarse dentro de un PinSecurityProvider');
  }
  return ctx;
}

