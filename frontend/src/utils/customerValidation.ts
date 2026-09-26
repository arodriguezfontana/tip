/** Mismo formato de teléfono que valida el backend. */
export const PHONE_PATTERN = /^\+?[0-9\s()-]{6,30}$/;

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return fallback;
}

export interface CustomerDataErrors {
  full_name?: string;
  phone?: string;
  address?: string;
}

export function validateCustomerData(data: { full_name: string; phone: string; address: string }): CustomerDataErrors {
  const errors: CustomerDataErrors = {};
  if (!data.full_name.trim()) {
    errors.full_name = 'Ingresá tu nombre.';
  }
  if (!data.phone.trim()) {
    errors.phone = 'Ingresá tu número de teléfono.';
  } else if (!PHONE_PATTERN.test(data.phone.trim())) {
    errors.phone = 'Ingresá un teléfono válido (solo números, espacios, guiones o +).';
  }
  if (!data.address.trim()) {
    errors.address = 'Ingresá tu dirección.';
  }
  return errors;
}
