import { useContext } from 'react';
import { PinSecurityContext, type PinSecurityContextValue } from '@/context/pin-security-context';

export function usePinSecurity(): PinSecurityContextValue {
  const ctx = useContext(PinSecurityContext);
  if (!ctx) {
    throw new Error('usePinSecurity debe usarse dentro de un PinSecurityProvider');
  }
  return ctx;
}

