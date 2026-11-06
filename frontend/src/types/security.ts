export type PinType = 'admin' | 'cash';

export interface PinVerificationRequest {
  pin: string;
}

export interface PinVerificationResponse {
  token: string;
  expires_in: number;
  message: string;
}

export interface PinStatusResponse {
  admin_pin_required: boolean;
  admin_blocked: boolean;
  admin_blocked_seconds_remaining: number;
  cash_pin_required: boolean;
  cash_blocked: boolean;
  cash_blocked_seconds_remaining: number;
}

