import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const dashboardTrend = new Trend('dashboard_ms');
const agendaDiariaTrend = new Trend('agenda_diaria_ms');
const agendaSemanalTrend = new Trend('agenda_semanal_ms');
const reportesIngresosTrend = new Trend('reportes_ingresos_ms');
const ocupacionTrend = new Trend('ocupacion_ms');
const pagosTrend = new Trend('pagos_ms');
const reembolsosTrend = new Trend('reembolsos_ms');

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
const TEST_EMAIL = __ENV.TEST_EMAIL || 'dueno.lima.norte@pichangago.pe';
const TEST_PASS = __ENV.TEST_PASS || '123456';

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

  if (loginRes.status !== 200) {
    errorRate.add(1);
    return;
  }

  const token = loginRes.json('token');
  const params = {
    headers: { Authorization: `Bearer ${token}` }
  };

  group('Dashboard', () => {
    const res = http.get(`${BASE_URL}/api/dueno/dashboard`, params);
    dashboardTrend.add(res.timings.duration);
    check(res, { 'dashboard 200': (r) => r.status === 200 });
  });

  group('Agenda diaria', () => {
    const hoy = new Date().toISOString().split('T')[0];
    const res = http.get(`${BASE_URL}/api/dueno/agenda/diaria?fecha=${hoy}`, params);
    agendaDiariaTrend.add(res.timings.duration);
    check(res, { 'agenda diaria 200': (r) => r.status === 200 });
  });

  group('Agenda semanal', () => {
    const hoy = new Date().toISOString().split('T')[0];
    const res = http.get(`${BASE_URL}/api/dueno/agenda/semanal?fecha_inicio=${hoy}`, params);
    agendaSemanalTrend.add(res.timings.duration);
    check(res, { 'agenda semanal 200': (r) => r.status === 200 });
  });

  group('Reportes ingresos', () => {
    const mes = new Date().toISOString().slice(0, 7);
    const res = http.get(`${BASE_URL}/api/dueno/reportes/ingresos?fecha_inicio=${mes}-01&fecha_fin=${mes}-31`, params);
    reportesIngresosTrend.add(res.timings.duration);
    check(res, { 'reportes ingresos 200': (r) => r.status === 200 });
  });

  group('Estadisticas ocupacion', () => {
    const mesActual = String(new Date().getMonth() + 1);
    const anioActual = String(new Date().getFullYear());
    const res = http.get(`${BASE_URL}/api/dueno/estadisticas/ocupacion?mes=${mesActual}&anio=${anioActual}`, params);
    ocupacionTrend.add(res.timings.duration);
    check(res, { 'ocupacion 200': (r) => r.status === 200 });
  });

  group('Pagos', () => {
    const res = http.get(`${BASE_URL}/api/dueno/pagos`, params);
    pagosTrend.add(res.timings.duration);
    check(res, { 'pagos 200': (r) => r.status === 200 });
  });

  group('Reembolsos', () => {
    const res = http.get(`${BASE_URL}/api/dueno/reembolsos`, params);
    reembolsosTrend.add(res.timings.duration);
    check(res, { 'reembolsos 200': (r) => r.status === 200 });
  });

  sleep(1);
}
