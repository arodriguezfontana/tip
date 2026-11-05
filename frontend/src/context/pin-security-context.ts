import { createContext } from 'react';

export interface PinSecurityContextValue {
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

export const PinSecurityContext = createContext<PinSecurityContextValue | null>(null);

