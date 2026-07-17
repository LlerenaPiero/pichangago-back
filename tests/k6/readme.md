# Pruebas de Carga con k6 — Enfoque Progresivo

Buscamos el **punto de quiebre** del backend. Empezamos con pocos usuarios y subimos hasta que fallen los thresholds.

## Instalación

```bash
winget install k6          # Windows
choco install k6           # o con Chocolatey
docker pull grafana/k6     # o Docker
```

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `catalogo-publico.js` | Catálogo público sin auth: listado, tipos, ubicaciones |
| `jugador-flujo-completo.js` | Login → catálogo → dashboard → historial → reserva |
| `dueno-dashboard.js` | 7 endpoints del panel del dueño |
| `concurrencia-reservas.js` | N usuarios simultáneos sobre el mismo slot |

Todos aceptan `MAX_VUS` y `DURATION` como variables de entorno.

---

## Prueba progresiva — Catálogo público

```bash
# Escalera: 5 → 10 → 20 → 30 → 50 VUs
# Cada nivel: 2 minutos sostenido

k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=5  tests/k6/catalogo-publico.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=10 tests/k6/catalogo-publico.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=20 tests/k6/catalogo-publico.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=30 tests/k6/catalogo-publico.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=50 tests/k6/catalogo-publico.js
```

Anotar en cada nivel: `http_req_failed`, `p(95)` y `checks` fallidos.
El punto de quiebre es donde `http_req_failed > 1%` o `p(95) > 3000ms`.

---

## Prueba progresiva — Jugador

```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=5  -e TEST_EMAIL=... -e TEST_PASS=... tests/k6/jugador-flujo-completo.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=10 -e TEST_EMAIL=... -e TEST_PASS=... tests/k6/jugador-flujo-completo.js
```

Para probar reserva real, agregar `ID_CANCHA` y `SLOT_IDS`:
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=5 -e ID_CANCHA=CHN-XXXXXX -e SLOT_IDS=SLT-XXXXXX,SLT-XXXXXX -e TEST_EMAIL=... -e TEST_PASS=... tests/k6/jugador-flujo-completo.js
```

---

## Prueba progresiva — Dueño

Requiere credenciales de dueño:
```bash
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=5  -e TEST_EMAIL=dueno@email.com -e TEST_PASS=123456 tests/k6/dueno-dashboard.js
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=10 -e TEST_EMAIL=dueno@email.com -e TEST_PASS=123456 tests/k6/dueno-dashboard.js
```

---

## Prueba de concurrencia — Doble reserva

```bash
# 20 usuarios intentan el mismo slot. Solo 1 debe ganar.
k6 run -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=20 -e ID_CANCHA=CHN-XXXXXX -e SLOT_IDS=SLT-XXXXXX,SLT-XXXXXX -e TEST_EMAIL=... -e TEST_PASS=... tests/k6/concurrencia-reservas.js
```

Verificar: `reservas_exitosas === 1`, `reservas_rechazadas === 19`.

---

## Exportar evidencias

```bash
k6 run --summary-export evidencias/04-k6/catalogo-05vu.json   -e MAX_VUS=5  -e BASE_URL=... tests/k6/catalogo-publico.js
k6 run --summary-export evidencias/04-k6/catalogo-10vu.json  -e MAX_VUS=10 -e BASE_URL=... tests/k6/catalogo-publico.js
k6 run --summary-export evidencias/04-k6/catalogo-20vu.json  -e MAX_VUS=20 -e BASE_URL=... tests/k6/catalogo-publico.js
k6 run --summary-export evidencias/04-k6/catalogo-30vu.json  -e MAX_VUS=30 -e BASE_URL=... tests/k6/catalogo-publico.js
k6 run --summary-export evidencias/04-k6/catalogo-50vu.json  -e MAX_VUS=50 -e BASE_URL=... tests/k6/catalogo-publico.js
```

---

## Criterios de aceptación (ISO 25010)

| Métrica | Límite aceptable | ISO relacionada |
|---------|-----------------|-----------------|
| `http_req_failed` | < 1% | Fiabilidad |
| `p(95)` Catálogo público | < 1500 ms | Eficiencia |
| `p(95)` Slots cancha | < 1200 ms | Eficiencia |
| `p(95)` Dashboard dueño | < 1000 ms | Eficiencia |
| `p(95)` Agenda diaria | < 1200 ms | Eficiencia |
| `p(95)` Reportes ingresos | < 1500 ms | Eficiencia |
| `p(95)` Reserva | < 1500 ms | Eficiencia |
| Doble reserva exitosa | 0 | Safety / Fiabilidad |
| Errores 500 | < 1% | Fiabilidad |

---

## Plantilla de resultados (por nivel)

| VUs | `http_req_failed` | `p(95)` listado | `p(95)` tipos | `p(95)` ubicaciones | ¿Quiebre? |
|-----|--------------------|-----------------|---------------|---------------------|-----------|
| 5   | % | ms | ms | ms | |
| 10  | % | ms | ms | ms | |
| 20  | % | ms | ms | ms | |
| 30  | % | ms | ms | ms | |
| 50  | % | ms | ms | ms | |

El punto de quiebre es donde `http_req_failed > 1%` o `p(95)` supera los límites.

---

## Docker

```bash
docker run --rm -i -e BASE_URL=https://pichangago-back.onrender.com -e MAX_VUS=10 grafana/k6 run - <tests/k6/catalogo-publico.js
```
