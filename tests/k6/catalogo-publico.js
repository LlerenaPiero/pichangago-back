import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const listadoTrend = new Trend('listado_ms');
const detalleTrend = new Trend('detalle_ms');
const slotsTrend = new Trend('slots_ms');
const tiposTrend = new Trend('tipos_ms');
const ubicacionesTrend = new Trend('ubicaciones_ms');

const MAX_VUS = parseInt(__ENV.MAX_VUS) || 10;
const DURATION = __ENV.DURATION || '2m';

export const options = {
  stages: [
    { duration: '30s', target: Math.ceil(MAX_VUS * 0.3) },
    { duration: DURATION, target: MAX_VUS },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
    errors: ['rate<0.05']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ID_CANCHA = __ENV.ID_CANCHA || '';

export default function () {
  group('Listar canchas', () => {
    const res = http.get(`${BASE_URL}/api/canchas?distrito=Miraflores`);
    listadoTrend.add(res.timings.duration);
    check(res, {
      'listado 200': (r) => r.status === 200,
      'listado < 1500ms': (r) => r.timings.duration < 1500
    });
  });

  group('Tipos de cancha', () => {
    const res = http.get(`${BASE_URL}/api/canchas/tipos-cancha`);
    tiposTrend.add(res.timings.duration);
    check(res, { 'tipos 200': (r) => r.status === 200 });
  });

  group('Ubicaciones', () => {
    const res = http.get(`${BASE_URL}/api/ubicaciones/departamentos`);
    ubicacionesTrend.add(res.timings.duration);
    check(res, { 'ubicaciones 200': (r) => r.status === 200 });
  });

  if (ID_CANCHA) {
    group('Detalle cancha', () => {
      const res = http.get(`${BASE_URL}/api/canchas/${ID_CANCHA}`);
      detalleTrend.add(res.timings.duration);
      check(res, { 'detalle 200': (r) => r.status === 200 });
    });

    group('Slots cancha', () => {
      const hoy = new Date().toISOString().split('T')[0];
      const res = http.get(`${BASE_URL}/api/canchas/${ID_CANCHA}/slots?fecha=${hoy}`);
      slotsTrend.add(res.timings.duration);
      check(res, {
        'slots 200': (r) => r.status === 200,
        'slots < 1200ms': (r) => r.timings.duration < 1200
      });
    });
  }

  sleep(1);
}
