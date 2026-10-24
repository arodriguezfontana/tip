export type HandoffStatus = 'waiting' | 'in_progress';
export type HandoffMessageAuthor = 'customer' | 'bot' | 'employee' | 'system';

export interface HandoffMessage {
  author: HandoffMessageAuthor;
  text: string;
  sent_at: string;
}

export interface HandoffSummary {
  id: number;
  customer_name: string | null;
  /** @usuario de Telegram, sin la arroba. */
  customer_username?: string | null;
  customer_phone?: string | null;
  reason: string | null;
  status: HandoffStatus;
  handled_by: string | null;
  requested_at: string;
  /** Mensajes del cliente que el empleado todavía no vio. */
  unread_count?: number;
  /** Último mensaje del cliente o del empleado. */
  last_message?: HandoffMessage | null;
}

export interface HandoffDetail extends HandoffSummary {
  messages: HandoffMessage[];
}
