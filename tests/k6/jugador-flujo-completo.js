import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const loginTrend = new Trend('login_ms');
const listadoTrend = new Trend('listado_ms');
const slotsTrend = new Trend('slots_ms');
const reservaTrend = new Trend('reserva_ms');
const historialTrend = new Trend('historial_ms');
const dashboardTrend = new Trend('dashboard_ms');
const reservasExitosas = new Counter('reservas_exitosas');
const reservasRechazadas = new Counter('reservas_rechazadas');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    errors: ['rate<0.01'],
    reserva_ms: ['p(95)<1500'],
    slots_ms: ['p(95)<1200']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'jugador.test@pichangago.pe';
const TEST_PASS = __ENV.TEST_PASS || '123456';
const ID_CANCHA = __ENV.ID_CANCHA || '';
const SLOT_IDS = (__ENV.SLOT_IDS || '').split(',');

export default function () {
  const loginRes = http.post(`${BASE_URL}/api/login`, JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASS
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(loginRes, {
    'login 200': (r) => r.status === 200,
    'token existe': (r) => !!r.json('token')
  });
  loginTrend.add(loginRes.timings.duration);

  if (loginRes.status !== 200) {
    errorRate.add(1);
    return;
  }

  const token = loginRes.json('token');
  const authParams = {
    headers: { Authorization: `Bearer ${token}` }
  };

  group('Listar canchas (auth)', () => {
    const res = http.get(`${BASE_URL}/api/canchas`, authParams);
    listadoTrend.add(res.timings.duration);
    check(res, {
      'listado auth 200': (r) => r.status === 200
    });
  });

  group('Dashboard jugador', () => {
    const res = http.get(`${BASE_URL}/api/jugador/dashboard`, authParams);
    dashboardTrend.add(res.timings.duration);
    check(res, {
      'dashboard jugador 200': (r) => r.status === 200
    });
  });

  group('Historial reservas', () => {
    const res = http.get(`${BASE_URL}/api/jugador/reservas`, authParams);
    historialTrend.add(res.timings.duration);
    check(res, {
      'historial 200': (r) => r.status === 200
    });
  });

  if (ID_CANCHA) {
    group('Ver slots', () => {
      const hoy = new Date().toISOString().split('T')[0];
      const res = http.get(`${BASE_URL}/api/canchas/${ID_CANCHA}/slots?fecha=${hoy}`, authParams);
      slotsTrend.add(res.timings.duration);
      check(res, {
        'slots 200': (r) => r.status === 200,
        'slots < 1200ms': (r) => r.timings.duration < 1200
      });
    });
  }

  if (ID_CANCHA && SLOT_IDS.length > 0 && SLOT_IDS[0]) {
    group('Reservar', () => {
      const res = http.post(`${BASE_URL}/api/canchas/reservar`, JSON.stringify({
        idCancha: ID_CANCHA,
        slots: SLOT_IDS,
        montoTotal: 50.00
      }), {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      reservaTrend.add(res.timings.duration);

      if (res.status === 201) {
        reservasExitosas.add(1);
        check(res, { 'reserva exitosa 201': (r) => r.status === 201 });
      } else if (res.status === 409) {
        reservasRechazadas.add(1);
        check(res, { 'reserva rechazada 409': (r) => r.status === 409 });
      } else {
        errorRate.add(1);
        check(res, { 'reserva ok': (r) => r.status < 500 });
      }
    });
  }

  sleep(1);
}
