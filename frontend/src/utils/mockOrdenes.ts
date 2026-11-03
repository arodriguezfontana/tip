import { AdminOrder, DeliveryMethod, OrderStatus, PreparationSector, WebOrderItem } from '../types/order';

const MOCK_CATALOG = [
  { id: 1, name: 'Pizza Muzzarella', price: 8500, sector: 'pizzeria' as const },
  { id: 2, name: 'Pizza Napolitana', price: 9500, sector: 'pizzeria' as const },
  { id: 3, name: 'Pizza Fugazzeta', price: 9800, sector: 'pizzeria' as const },
  { id: 4, name: 'Flan casero', price: 3500, sector: 'cocina' as const },
  { id: 5, name: 'Helado 2 bochas', price: 4000, sector: 'cocina' as const },
  { id: 6, name: 'Coca-Cola 500ml', price: 2500, sector: 'barra' as const },
  { id: 7, name: 'Cerveza Quilmes 1L', price: 3200, sector: 'barra' as const },
];

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

    const itemCount = (index % 3) + 1;
    const items: WebOrderItem[] = [];
    const usedSectors = new Set<PreparationSector>();

    for (let i = 0; i < itemCount; i++) {
      const prod = MOCK_CATALOG[(index + i * 2) % MOCK_CATALOG.length];
      const isPrepared = status === 'En Camino' || status === 'Listo para Retirar' || (status === 'Confirmado' && (index + i) % 2 === 0);
      items.push({
        id: id * 10 + i,
        product_id: prod.id,
        product_name: prod.name,
        quantity: ((index + i) % 2) + 1,
        unit_price: prod.price,
        subtotal: prod.price * (((index + i) % 2) + 1),
        sector: prod.sector,
        is_prepared: isPrepared,
      });
      usedSectors.add(prod.sector);
    }

    const itemsPreparedCount = items.filter((i) => i.is_prepared).length;
    const isAllPrepared = items.length > 0 && itemsPreparedCount === items.length;

    return {
      id,
      customer_name: nombreAleatorio,
      shipping_address: delivery_method === 'domicilio' ? 'Av. Calchaquí 1234' : 'Retiro en local',
      total_amount: items.reduce((acc, i) => acc + i.subtotal, 0),
      status,
      delivery_method,
      source: index % 3 === 0 ? 'web' : 'bot',
      customer_phone: `11 5555-${String(index).padStart(4, '0')}`,
      notes: index % 4 === 0 ? 'Sin cebolla, tocar timbre 2B' : null,
      estimated_minutes: status !== 'Pendiente' && !scheduled_for ? 30 : null,
      scheduled_for,
      created_at: createdAtDate.toISOString(),
      item_count: items.length,
      delivery_driver_id: null,
      delivery_driver_name: null,
      items,
      items_prepared_count: itemsPreparedCount,
      is_all_prepared: isAllPrepared,
      sectors: Array.from(usedSectors),
    };
  });
}