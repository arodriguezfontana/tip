// Google Maps falso para los tests e2e: ubica cualquier dirección y responde como la Routes API (computeRoutes), con 10 minutos de manejo entre
// paradas y las paradas en el orden en que llegaron (sin optimizar). Nunca habla con Google.
import http from 'node:http';

const port = Number(process.env.MAPS_PORT ?? 8002);

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    res.setHeader('Content-Type', 'application/json');
    if (url.searchParams.has('health')) {
      res.end('{"status":"OK"}');
      return;
    }
    if (url.pathname === '/geocode') {
      // Toda dirección cae en el mismo punto (el local y los clientes quedan a distancia cero).
      res.end(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: -34.6, lng: -58.4 } } }] }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const stops = body.intermediates ?? [];
      const legs = Array.from({ length: stops.length + 1 }, () => ({ duration: '600s' }));
      res.end(JSON.stringify({ routes: [{ optimizedIntermediateWaypointIndex: stops.map((_, i) => i), legs }] }));
    });
  })
  .listen(port, '127.0.0.1');
