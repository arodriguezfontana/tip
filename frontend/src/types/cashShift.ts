export type CashShiftStatus = 'abierta' | 'cerrada';
export type MovementType = 'ingreso' | 'egreso';
export type DifferenceType = 'sobrante' | 'faltante' | 'exacta';

export interface CashMovement {
  id: number;
  cash_shift_id: number;
  amount: number;
  type: MovementType;
  category: string;
  description?: string | null;
  created_at: string;
  created_by_name?: string | null;
}

export interface CashShiftSummaryBreakdown {
  initial_amount: number;
  cash_sales: number;
  mercadopago_sales: number;
  transferencia_sales: number;
  tarjeta_sales: number;
  other_digital_sales: number;
  total_digital_sales: number;
  total_sales: number;
  manual_income: number;
  manual_expense: number;
  expected_cash: number;
  final_amount?: number | null;
  difference?: number | null;
  difference_type?: DifferenceType | null;
  orders_count: number;
  movements_count: number;
}

export interface CashShift {
  id: number;
  opened_at: string;
  closed_at?: string | null;
  status: CashShiftStatus;
  initial_amount: number;
  final_amount?: number | null;
  expected_amount?: number | null;
  difference?: number | null;
  difference_type?: DifferenceType | null;
  notes?: string | null;
  opened_by_name?: string | null;
  closed_by_name?: string | null;
  summary?: CashShiftSummaryBreakdown | null;
}

export interface CashShiftDetail extends CashShift {
  movements: CashMovement[];
}

export interface CashShiftCurrentStatus {
  is_open: boolean;
  shift: CashShiftDetail | null;
}

export interface CashShiftHistory {
  items: CashShift[];
  total: number;
}

export interface OpenCashShiftPayload {
  initial_amount: number;
  notes?: string;
}

export interface CloseCashShiftPayload {
  final_amount: number;
  notes?: string;
}

export interface CreateCashMovementPayload {
  amount: number;
  type: MovementType;
  category: string;
  description?: string;
}

