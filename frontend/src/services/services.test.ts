import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/services/api';
import type { ApiErrorResponse } from '@/services/api';
import { lookupClientByPhone } from '@/services/clientService';
import { createCounterOrder, fetchOrders, updateOrderStatus } from '@/services/orderService';
import { fetchTopProducts } from '@/services/statsService';

/** Reemplaza el transporte HTTP de axios: guarda cada request y responde con lo que indique `respond`. */
function mockTransport(respond: (config: InternalAxiosRequestConfig) => Partial<AxiosResponse> | Error) {
  const requests: InternalAxiosRequestConfig[] = [];
  const original = api.defaults.adapter;
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config);
    const result = respond(config);
    if (result instanceof Error) throw result;
    return { data: null, status: 200, statusText: 'OK', headers: {}, config, ...result };
  };
  api.defaults.adapter = adapter;
  return { requests, restore: () => (api.defaults.adapter = original) };
}

function httpError(status: number, data: unknown = {}) {
  return (config: InternalAxiosRequestConfig) =>
    new AxiosError('error', 'ERR', config, null, {
      status,
      data,
      statusText: '',
      headers: {},
      config: { ...config, headers: new AxiosHeaders() },
    });
}

async function captureError(promise: Promise<unknown>): Promise<ApiErrorResponse> {
  try {
    await promise;
  } catch (err) {
    return err as ApiErrorResponse;
  }
  throw new Error('Se esperaba un error');
}

let transport: ReturnType<typeof mockTransport> | null = null;

afterEach(() => {
  transport?.restore();
  transport = null;
});

describe('api: request', () => {
  it('manda el token guardado como Bearer', async () => {
    localStorage.setItem('token', 'abc123');
    transport = mockTransport(() => ({ data: [] }));

    await api.get('/orders');

    expect(transport.requests[0].headers.Authorization).toBe('Bearer abc123');
  });

  it('sin token no manda Authorization', async () => {
    transport = mockTransport(() => ({ data: [] }));

    await api.get('/menu/products');

    expect(transport.requests[0].headers.Authorization).toBeUndefined();
  });
});

describe('api: errores', () => {
  beforeEach(() => localStorage.setItem('token', 'abc123'));

  it('usa el detalle del backend en un 400', async () => {
    transport = mockTransport(httpError(400, { detail: 'Estos productos no están disponibles: Fugazzeta.' }));

    const error = await captureError(api.post('/orders/web', {}));

    expect(error).toMatchObject({ statusCode: 400, message: 'Estos productos no están disponibles: Fugazzeta.' });
  });

  it('en un 401 borra la sesión guardada', async () => {
    transport = mockTransport(httpError(401, {}));

    const error = await captureError(api.get('/auth/me'));

    expect(error.statusCode).toBe(401);
    expect(error.message).toMatch(/inicia sesión nuevamente/);
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('en un 403 no borra la sesión', async () => {
    transport = mockTransport(httpError(403, { detail: 'Acceso exclusivo para administradores' }));

    const error = await captureError(api.get('/orders'));

    expect(error.message).toBe('Acceso exclusivo para administradores');
    expect(localStorage.getItem('token')).toBe('abc123');
  });

  it('en un 422 muestra un mensaje legible en vez del detalle técnico de validación', async () => {
    transport = mockTransport(httpError(422, { detail: [{ loc: ['body', 'customer_phone'], msg: 'string_pattern_mismatch' }] }));

    const error = await captureError(api.post('/orders/web', {}));

    expect(error.message).toBe('Algunos datos enviados no son válidos. Revisalos e intentá nuevamente.');
    expect(error.details).toEqual({ detail: [{ loc: ['body', 'customer_phone'], msg: 'string_pattern_mismatch' }] });
  });

  it.each([
    [404, { detail: 'Pedido no encontrado' }, 'Pedido no encontrado'],
    [409, { detail: "No se puede pasar de 'Finalizado' a 'Confirmado'." }, "No se puede pasar de 'Finalizado' a 'Confirmado'."],
    [500, { detail: 'Traceback...' }, 'Error interno del servidor. Por favor, intenta más tarde.'],
    [503, {}, 'Error inesperado (503).'],
  ])('traduce el estado %i', async (status, data, message) => {
    transport = mockTransport(httpError(status, data));

    const error = await captureError(api.get('/orders/1'));

    expect(error).toMatchObject({ statusCode: status, message });
  });

  it('sin respuesta del servidor avisa que no hay conexión', async () => {
    transport = mockTransport((config) => new AxiosError('Network Error', 'ERR_NETWORK', config));

    const error = await captureError(api.get('/menu/products'));

    expect(error).toMatchObject({ statusCode: 500, message: expect.stringMatching(/No se pudo conectar/) });
  });
});

describe('orderService', () => {
  it('fetchOrders manda los estados repetidos como espera FastAPI y las fechas en ISO', async () => {
    transport = mockTransport(() => ({ data: [] }));

    await fetchOrders({
      status: ['Pendiente', 'Confirmado'],
      dateFrom: new Date('2026-09-28T03:00:00.000Z'),
    });

    const url = api.getUri(transport.requests[0]);
    expect(url).toContain('status=Pendiente&status=Confirmado');
    expect(url).not.toContain('status[]');
    expect(url).toContain('date_from=2026-09-28T03:00:00.000Z');
    expect(url).not.toContain('date_to');
  });

  it('updateOrderStatus solo manda la demora si se indicó', async () => {
    transport = mockTransport((config) => ({ data: { id: 5, status: JSON.parse(config.data).status } }));

    await updateOrderStatus(5, 'Rechazado');
    await updateOrderStatus(5, 'Confirmado', 25);

    expect(transport.requests.map((r) => [r.method, r.url, JSON.parse(r.data)])).toEqual([
      ['patch', '/orders/5/status', { status: 'Rechazado' }],
      ['patch', '/orders/5/status', { status: 'Confirmado', estimated_minutes: 25 }],
    ]);
  });

  it('createCounterOrder publica el pedido presencial', async () => {
    transport = mockTransport(() => ({ data: { id: 9 } }));

    const created = await createCounterOrder({
      customer_name: 'Paula',
      customer_phone: '1144445555',
      delivery_method: 'retiro',
      shipping_address: null,
      notes: null,
      payment_method: 'efectivo',
      is_paid: true,
      items: [{ product_id: 1, quantity: 2 }],
    });

    expect(created).toEqual({ id: 9 });
    expect(transport.requests[0].url).toBe('/orders/counter');
  });
});

describe('statsService', () => {
  it('pide el top de productos con el límite indicado', async () => {
    transport = mockTransport(() => ({ data: [] }));

    await fetchTopProducts({}, 3);

    expect(transport.requests[0].params).toEqual({ date_from: undefined, date_to: undefined, limit: 3 });
  });
});

describe('clientService', () => {
  it('devuelve el cliente registrado', async () => {
    const client = { id: 1, phone: '1144445555', full_name: 'Paula', address: 'Belgrano 95' };
    transport = mockTransport(() => ({ data: client }));

    await expect(lookupClientByPhone('11 4444-5555')).resolves.toEqual(client);
    expect(transport.requests[0].params).toEqual({ phone: '11 4444-5555' });
    expect(transport.requests[0].timeout).toBe(3000);
  });

  it('devuelve null si el teléfono no está registrado', async () => {
    transport = mockTransport(httpError(404, { detail: 'Cliente no registrado' }));

    await expect(lookupClientByPhone('1199990000')).resolves.toBeNull();
  });

  it('propaga los demás errores', async () => {
    transport = mockTransport(httpError(500));

    await expect(lookupClientByPhone('1144445555')).rejects.toMatchObject({ statusCode: 500 });
  });
});
