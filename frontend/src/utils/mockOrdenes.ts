import { AdminOrder, DeliveryMethod, OrderStatus } from '../types/order';

export function generarMockOrders(cantidad: number = 55): AdminOrder[] {
  const nombres = ['Lucía Gómez', 'Carlos Pérez', 'Mariana Ruiz', 'Federico López', 'Sofía Benítez', 'Juan Martínez', 'Valentina Díaz', 'Mateo Romero', 'Camila Sosa', 'Agustín Acosta'];
  const estados: OrderStatus[] = ['Pendiente', 'Confirmado', 'En Camino', 'Listo para Retirar'];
  const metodos: DeliveryMethod[] = ['domicilio', 'retiro'];

  const ahora = new Date();

  return Array.from({ length: cantidad }, (_, index) => {
    const id = 1000 + index;
    const nombreAleatorio = nombres[index % nombres.length];
    const status = estados[index % estados.length];
    const delivery_method = metodos[index % metodos.length];
    
    const minutosAtras = (index * 7) % 180;
    const createdAtDate = new Date(ahora.getTime() - minutosAtras * 60 * 1000);

    let scheduled_for: string | null = null;
    if (index % 5 === 0) {
      const horaProg = new Date(ahora.getTime() + (index + 1) * 30 * 60 * 1000);
      scheduled_for = horaProg.toISOString();
    }

    return {
      id,
      customer_name: nombreAleatorio,
      shipping_address: delivery_method === 'domicilio' ? 'Av. Calchaquí 1234' : 'Retiro en local',
      total_amount: Math.floor(Math.random() * 25000) + 8000,
      status,
      delivery_method,
      source: index % 3 === 0 ? 'web' : 'bot',
      customer_phone: index % 3 === 0 ? '11 5555-0000' : null,
      notes: null,
      estimated_minutes: status !== 'Pendiente' ? 30 : null,
      scheduled_for,
      created_at: createdAtDate.toISOString(),
      item_count: (index % 4) + 1,
    };
  });
}