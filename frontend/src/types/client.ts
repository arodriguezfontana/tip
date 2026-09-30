/** Cliente de la agenda del local (se registra al confirmar pedidos de mostrador). */
export interface Client {
  id: number;
  phone: string;
  full_name: string;
  address: string | null;
}
