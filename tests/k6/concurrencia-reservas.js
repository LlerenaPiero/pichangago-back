import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const reservasExitosas = new Counter('reservas_exitosas');
const reservasRechazadas = new Counter('reservas_rechazadas');
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '5s', target: 20 },
    { duration: '10s', target: 20 },
    { duration: '5s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
    http_req_duration: ['p(95)<2000']
  }
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'jugador.test@pichangago.pe';
const TEST_PASS = __ENV.TEST_PASS || '123456';
const ID_CANCHA = __ENV.ID_CANCHA || '';
const SLOT_IDS = (__ENV.SLOT_IDS || '').split(',');

export default function () {
  if (!ID_CANCHA || SLOT_IDS.length === 0 || !SLOT_IDS[0]) {
    console.error('Faltan parametros: ID_CANCHA y SLOT_IDS (slots separados por coma)');
    errorRate.add(1);
    return;
  }

  const loginRes = http.post(`${BASE_URL}/api/login`, JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASS
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(loginRes, {
    'login 200': (r) => r.status === 200
  });

  if (loginRes.status !== 200) {
    errorRate.add(1);
    return;
  }

  const token = loginRes.json('token');
  const reservaBody = JSON.stringify({
    idCancha: ID_CANCHA,
    slots: SLOT_IDS,
    montoTotal: 50.00
  });

  const res = http.post(`${BASE_URL}/api/canchas/reservar`, reservaBody, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 201) {
    reservasExitosas.add(1);
    check(res, { 'reserva exitosa 201': (r) => r.status === 201 });
  } else if (res.status === 409) {
    reservasRechazadas.add(1);
    check(res, { 'reserva rechazada 409': (r) => r.status === 409 });
  } else {
    errorRate.add(1);
    check(res, { 'reserva inesperada': (r) => r.status < 500 });
    console.error(`Reserva fallo con status ${res.status}:`, res.body);
  }

  sleep(0.5);
}
